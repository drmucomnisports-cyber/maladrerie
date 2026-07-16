// ============================================================
// Handler Vercel Serverless pour le Webhook Stripe
// Version robuste avec diagnostic intégré, idempotence et cache Prisma
// ============================================================

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import mailer from '../../backend/utils/mailer.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// ==============================================================
// Cache Prisma (éviter la saturation des connexions sur Vercel)
// ==============================================================
const prisma = globalThis.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

// ==============================================================
// Helper : Lecture du raw body — compatible avec tous les runtimes
// ==============================================================
const getRawBody = async (req) => {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody, 'utf8');
  }

  if (req.readable && !req.readableEnded) {
    try {
      const raw = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
      });
      if (raw && raw.length > 0) {
        return raw;
      }
    } catch (e) {
      console.warn('[WEBHOOK] Erreur lecture stream direct:', e.message);
    }
  }

  if (req.body) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }

  return Buffer.alloc(0);
};

// ==============================================================
// Handler Principal
// ==============================================================
export default async function handler(req, res) {
  console.log(`[WEBHOOK] ▶ ${req.method} /api/stripe/webhook`);
  console.log(`[WEBHOOK] Headers stripe-signature: ${req.headers['stripe-signature'] ? 'PRÉSENT' : 'ABSENT'}`);
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const secretPrefix = secret ? `${secret.substring(0, 12)}...` : 'NON_CONFIGURÉ';
  console.log(`[WEBHOOK] STRIPE_WEBHOOK_SECRET utilisé (début) : ${secretPrefix}`);

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
    console.log(`[WEBHOOK] Body lu: ${rawBody.length} octets`);
  } catch (err) {
    console.error('[WEBHOOK] ❌ Erreur lecture rawBody:', err.message);
    return res.status(400).send(`Erreur Body: ${err.message}`);
  }

  const sig = req.headers['stripe-signature'];
  let event;

  // --- Vérification de la signature Stripe ---
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log(`[WEBHOOK] ✅ Signature Stripe valide — Event: ${event.type}`);
    } else {
      console.warn('[WEBHOOK] ⚠️ Mode dégradé — signature non vérifiée');
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch (parseErr) {
        console.error('[WEBHOOK] ❌ Impossible de parser le JSON dégradé:', parseErr.message);
        return res.status(400).send('Format JSON invalide');
      }
    }
  } catch (err) {
    console.error('[WEBHOOK] ❌ Vérification signature échouée:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- Traitement des événements Stripe ---
  try {
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

      // -- IDEMPOTENCE : Vérifier si l'événement a déjà été traité via une dépense Stripe Fees --
      // Ou via le statut de la réservation pour éviter un double traitement.
      const resDb = await prisma.reservation.findUnique({
        where: { id: parseInt(reservationId) },
        include: { client: true, intervenant: true }
      });

      if (!resDb) {
        console.warn(`[WEBHOOK] ⚠️ Réservation #${reservationId} introuvable en DB`);
        return res.status(200).json({ received: true });
      }

      let isAlreadyProcessed = false;
      if (paymentType === 'acompte' && resDb.statutPaiement === 'ACOMPTE_PAYE') isAlreadyProcessed = true;
      if (paymentType === 'acompte' && resDb.statutPaiement === 'PAYE') isAlreadyProcessed = true;
      if ((paymentType === 'solde' || paymentType === 'totalite') && (resDb.statutPaiement === 'PAYE' || resDb.statutPaiement === 'SOLDE_PAYE')) isAlreadyProcessed = true;
      if (paymentType === 'caution' && resDb.statutCaution === 'DEPOSEE') isAlreadyProcessed = true;

      if (isAlreadyProcessed) {
         console.log(`[WEBHOOK] ⚠️ Événement ${paymentType} déjà traité pour la réservation #${reservationId}. Ignoré.`);
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
        try {
          const existingExpense = await prisma.expense.findFirst({
            where: { description: `Session Stripe: ${session.id}` }
          });
          if (!existingExpense) {
            await prisma.expense.create({
              data: {
                date: new Date(),
                label: `Frais Stripe - Réservation #${reservationId} (${paymentType.toUpperCase()})`,
                montant: stripeFee,
                categorie: 'Frais bancaires & Commissions Stripe',
                comptePcg: '627',
                description: `Session Stripe: ${session.id}`
              }
            });
            console.log(`[WEBHOOK] Frais Stripe de ${stripeFee} € enregistrés pour la session ${session.id}`);
          }
        } catch (e) {
          console.error('[WEBHOOK] Erreur création dépense:', e.message);
        }
      }

      // ==============================================
      // CAS ACOMPTE
      // ==============================================
      if (paymentType === 'acompte') {
        let targetStatus = 'ACOMPTE_PAYE';
        if (resDb.statutPaiement === 'SOLDE_PAYE') targetStatus = 'PAYE';

        let stripeSoldeId = null;
        let balancePaymentLink = '';
        if (targetStatus === 'ACOMPTE_PAYE' && resDb.montantSolde > 0) {
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
            balancePaymentLink = soldeSession.url;
          } catch (e) { console.error('[WEBHOOK] Erreur session solde:', e.message); }
        }

        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutPaiement: targetStatus, statut: 'RESERVE', modePaiement: 'STRIPE', stripeSoldeId: stripeSoldeId || undefined, payeLe: resDb.payeLe || new Date() },
          include: { client: true }
        });

        if (reservation.codePromo) {
          await prisma.promoCode.updateMany({ where: { code: reservation.codePromo.toUpperCase() }, data: { usageActuel: { increment: 1 } } }).catch(() => {});
        }

        await mailer.sendPaymentConfirmationEmails(prisma, reservation, 'acompte', session.amount_total / 100, balancePaymentLink);
        console.log(`[WEBHOOK] ✅ Acompte traité — Résa #${reservationId} → ${targetStatus}`);

      // ==============================================
      // CAS SOLDE / TOTALITÉ
      // ==============================================
      } else if (paymentType === 'solde' || paymentType === 'totalite') {
        let targetStatus = 'PAYE';
        if (paymentType === 'solde' && resDb.montantAcompte > 0 && resDb.statutPaiement !== 'ACOMPTE_PAYE') {
          targetStatus = 'SOLDE_PAYE';
        }
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutPaiement: targetStatus, statut: 'RESERVE', modePaiement: 'STRIPE', payeLe: resDb.payeLe || new Date() },
          include: { client: true }
        });
        await mailer.sendPaymentConfirmationEmails(prisma, reservation, paymentType, session.amount_total / 100);
        console.log(`[WEBHOOK] ✅ Solde/Totalité traité — Résa #${reservationId} → ${targetStatus}`);

      // ==============================================
      // CAS CAUTION
      // ==============================================
      } else if (paymentType === 'caution') {
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { statutCaution: 'DEPOSEE', stripeCautionId: session.payment_intent },
          include: { client: true }
        });
        await mailer.sendPaymentConfirmationEmails(prisma, reservation, 'caution', session.amount_total / 100);
        console.log(`[WEBHOOK] ✅ Caution déposée — Résa #${reservationId}`);
      } else {
        console.log(`[WEBHOOK] ℹ️ Type de paiement non géré: ${paymentType}`);
      }
    } else {
      console.log(`[WEBHOOK] ℹ️ Événement ignoré: ${event.type}`);
    }

  } catch (err) {
    console.error('[WEBHOOK] ❌ Erreur traitement:', err);
    return res.status(200).json({ received: true, warning: 'processing_error' });
  }

  // ✅ Répondre 200
  return res.status(200).json({ received: true });
}

export const config = {
  api: { bodyParser: false }
};
