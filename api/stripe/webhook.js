// ============================================================
// Handler Vercel Serverless pour le Webhook Stripe
// Version robuste avec diagnostic intégré
// ============================================================

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// ==============================================================
// Helper : Lecture du raw body — compatible avec tous les runtimes
// ==============================================================
const getRawBody = async (req) => {
  // Cas spécifique Vercel : Vercel injecte le body brut intact dans req.rawBody
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody, 'utf8');
  }

  // Cas 1 : Le body est déjà un Buffer (certains runtimes pré-bufferisent)
  if (req.body) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
    // JSON déjà parsé — on ne peut plus vérifier la signature Stripe
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }

  // Cas 2 : Lecture du stream de la requête
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
};

// ==============================================================
// Helper : Envoi e-mail
// ==============================================================
const sendConfirmationMail = async ({ to, nom, montant, type }) => {
  if (!to || to === 'N/A') return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const typeLabel = type === 'acompte' ? 'Acompte' : type === 'caution' ? 'Caution' : 'Solde';
    await transporter.sendMail({
      from: `"Gîte de la Maladrerie" <${process.env.SMTP_SENDER || 'david.roujet@mucomnisports.fr'}>`,
      to,
      subject: `✅ Confirmation de paiement — ${typeLabel} — Gîte de la Maladrerie`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 24px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px;">
            <h2 style="color: #004B93;">Bonjour ${nom},</h2>
            <p>Nous avons bien reçu votre paiement de <strong>${montant} €</strong> (${typeLabel.toLowerCase()}) par carte bancaire.</p>
            <p>Merci pour votre confiance et à très bientôt !</p>
          </div>
          <div style="background: #f8fafc; padding: 12px; text-align: center; font-size: 11px; color: #64748b;">
            Gîte de la Maladrerie — MUC Omnisports — david.roujet@mucomnisports.fr
          </div>
        </div>
      `
    });
    console.log(`[WEBHOOK] ✉️ Email envoyé à ${to}`);
  } catch (err) {
    console.error('[WEBHOOK] Erreur envoi email:', err.message);
  }
};

// ==============================================================
// Handler Principal
// ==============================================================
export default async function handler(req, res) {
  // --- Diagnostic : toujours logger l'appel entrant ---
  console.log(`[WEBHOOK] ▶ ${req.method} /api/stripe/webhook`);
  console.log(`[WEBHOOK] Headers stripe-signature: ${req.headers['stripe-signature'] ? 'PRÉSENT' : 'ABSENT'}`);
  console.log(`[WEBHOOK] STRIPE_WEBHOOK_SECRET configuré: ${process.env.STRIPE_WEBHOOK_SECRET ? 'OUI' : 'NON'}`);

  if (req.method !== 'POST') {
    console.log(`[WEBHOOK] ⚠️ Méthode non autorisée: ${req.method}`);
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  // --- Lecture du body brut ---
  let rawBody;
  try {
    rawBody = await getRawBody(req);
    console.log(`[WEBHOOK] Body lu: ${rawBody.length} octets`);
  } catch (err) {
    console.error('[WEBHOOK] ❌ Erreur lecture body:', err.message);
    // Répondre 200 pour éviter que Stripe re-tente sans cesse
    return res.status(200).json({ received: true, warning: 'body_read_error' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  // --- Vérification de la signature Stripe ---
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`[WEBHOOK] ✅ Signature Stripe valide — Event: ${event.type}`);
    } else {
      // Sans secret ou sans signature : accepter en mode dégradé
      console.warn('[WEBHOOK] ⚠️ Mode dégradé — signature non vérifiée');
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch (parseErr) {
        console.error('[WEBHOOK] ❌ Impossible de parser le body:', parseErr.message);
        return res.status(200).json({ received: true, warning: 'parse_error' });
      }
    }
  } catch (err) {
    console.error('[WEBHOOK] ❌ Vérification signature échouée:', err.message);
    // IMPORTANT : Ne retourner 400 QUE si la signature est présente et invalide
    // Cela indique une vraie tentative malveillante ou un mauvais secret
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- Traitement des événements Stripe ---
  let prisma;
  try {
    prisma = new PrismaClient();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const reservationId = session.metadata?.reservationId;
      const paymentType = session.metadata?.paymentType?.toLowerCase();
      const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.gite-maladrerie.fr';

      console.log(`[WEBHOOK] 💳 checkout.session.completed — RésaId: ${reservationId}, Type: ${paymentType}`);

      if (!reservationId) {
        console.warn('[WEBHOOK] ⚠️ reservationId manquant dans les metadata');
        return res.status(200).json({ received: true });
      }

      // -- Calcul des frais Stripe réels --
      let stripeFee = 0;
      if (session.payment_intent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
            expand: ['latest_charge.balance_transaction']
          });
          if (pi.latest_charge?.balance_transaction) {
            stripeFee = pi.latest_charge.balance_transaction.fee / 100;
          }
        } catch (feeErr) {
          console.error('[WEBHOOK] Erreur récup frais:', feeErr.message);
        }
      }
      if (stripeFee === 0 && session.amount_total) {
        stripeFee = Math.round(((session.amount_total / 100) * 0.014 + 0.25) * 100) / 100;
      }

      // -- Enregistrement des frais --
      if (stripeFee > 0 && ['acompte', 'solde', 'totalite'].includes(paymentType)) {
        await prisma.expense.create({
          data: {
            date: new Date(),
            label: `Frais Stripe - Réservation #${reservationId} (${paymentType.toUpperCase()})`,
            montant: stripeFee,
            categorie: 'Frais bancaires & Commissions Stripe',
            comptePcg: '627',
            description: `Session Stripe: ${session.id}`
          }
        }).catch(e => console.error('[WEBHOOK] Erreur création dépense:', e.message));
      }

      // ==============================================
      // CAS ACOMPTE
      // ==============================================
      if (paymentType === 'acompte') {
        const resDb = await prisma.reservation.findUnique({
          where: { id: parseInt(reservationId) },
          include: { client: true }
        });

        let targetStatus = 'ACOMPTE_PAYE';
        if (resDb?.statutPaiement === 'SOLDE_PAYE') targetStatus = 'PAYE';

        let stripeSoldeId = null;
        if (targetStatus === 'ACOMPTE_PAYE' && resDb?.montantSolde > 0) {
          try {
            const soldeSession = await stripe.checkout.sessions.create({
              payment_method_types: ['card'],
              mode: 'payment',
              line_items: [{ price_data: { currency: 'eur', unit_amount: Math.round(resDb.montantSolde * 100), product_data: { name: `Solde séjour #${reservationId}` } }, quantity: 1 }],
              metadata: { reservationId: String(reservationId), paymentType: 'solde' },
              success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${FRONTEND_URL}/payment-cancel`,
              customer_email: resDb.client?.email || undefined
            });
            stripeSoldeId = soldeSession.id;
          } catch (e) { console.error('[WEBHOOK] Erreur session solde:', e.message); }
        }

        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutPaiement: targetStatus, statut: 'RESERVE', modePaiement: 'STRIPE', stripeSoldeId: stripeSoldeId || undefined, payeLe: resDb?.payeLe || new Date() },
          include: { client: true }
        });

        if (reservation.codePromo) {
          await prisma.promoCode.updateMany({ where: { code: reservation.codePromo.toUpperCase() }, data: { usageActuel: { increment: 1 } } }).catch(() => {});
        }

        await sendConfirmationMail({ to: reservation.client?.email, nom: reservation.client?.nom, montant: (session.amount_total / 100).toFixed(2), type: 'acompte' });
        console.log(`[WEBHOOK] ✅ Acompte traité — Résa #${reservationId} → ${targetStatus}`);

      // ==============================================
      // CAS SOLDE / TOTALITÉ
      // ==============================================
      } else if (paymentType === 'solde' || paymentType === 'totalite') {
        const resDb = await prisma.reservation.findUnique({ where: { id: parseInt(reservationId) } });
        let targetStatus = 'PAYE';
        if (paymentType === 'solde' && resDb?.montantAcompte > 0 && resDb?.statutPaiement !== 'ACOMPTE_PAYE') {
          targetStatus = 'SOLDE_PAYE';
        }
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutPaiement: targetStatus, modePaiement: 'STRIPE', payeLe: resDb?.payeLe || new Date() },
          include: { client: true }
        });
        await sendConfirmationMail({ to: reservation.client?.email, nom: reservation.client?.nom, montant: (session.amount_total / 100).toFixed(2), type: paymentType });
        console.log(`[WEBHOOK] ✅ Solde/Totalité traité — Résa #${reservationId} → ${targetStatus}`);

      // ==============================================
      // CAS CAUTION
      // ==============================================
      } else if (paymentType === 'caution') {
        await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutCaution: 'DEPOSEE', stripeCautionId: session.payment_intent }
        });
        console.log(`[WEBHOOK] ✅ Caution déposée — Résa #${reservationId}`);
      } else {
        console.log(`[WEBHOOK] ℹ️ Type de paiement non géré: ${paymentType}`);
      }
    } else {
      console.log(`[WEBHOOK] ℹ️ Événement ignoré: ${event.type}`);
    }

  } catch (err) {
    console.error('[WEBHOOK] ❌ Erreur traitement:', err);
    // Retourner 200 pour éviter les re-tentatives Stripe sur une erreur interne
    return res.status(200).json({ received: true, warning: 'processing_error' });
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }

  // ✅ Répondre 200 — indispensable pour que Stripe considère le webhook comme reçu
  return res.status(200).json({ received: true });
}

// NOTE : Dans @vercel/node (hors Next.js), il n'y a pas de body parser automatique.
// Le body est disponible comme stream. La directive ci-dessous est ignorée par Vercel
// mais documentée pour clarté.
export const config = {
  api: { bodyParser: false }
};
