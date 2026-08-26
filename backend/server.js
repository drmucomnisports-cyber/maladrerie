require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { BrevoClient } = require('@getbrevo/brevo');
const nodemailer = require('nodemailer');
const { generateDevisPDF } = require('./utils/generateDevisPDF');
const getAssetPath = require('./utils/getAssetPath');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
const stripe = require('stripe')(stripeSecretKey);

const prisma = new PrismaClient();
const app = express();

const generateFeedbackHTML = (title, message, isSuccess = true) => {
  const themeColor = isSuccess ? '#22c55e' : '#ef4444';
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;900&display=swap" rel="stylesheet">
      <style>
        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          background-color: #f8fafc; 
          background-image: radial-gradient(#e2e8f0 1px, transparent 1px);
          background-size: 20px 20px;
          display: flex; 
          justify-content: center; 
          align-items: center; 
          min-height: 100vh; 
          margin: 0; 
          color: #334155; 
        }
        .card { 
          background-color: white; 
          border-radius: 24px; 
          padding: 40px; 
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); 
          max-width: 500px; 
          width: 90%; 
          text-align: center; 
          border-top: 8px solid ${themeColor}; 
        }
        h1 { color: ${themeColor}; font-weight: 900; font-size: 28px; margin-top: 0; text-transform: uppercase; letter-spacing: -0.025em; }
        p { font-size: 16px; line-height: 1.6; font-weight: 500; margin-bottom: 30px; }
        .btn { 
          display: inline-block; 
          background-color: #032e5f; 
          color: white; 
          border: none; 
          padding: 14px 28px; 
          border-radius: 12px; 
          font-weight: 900; 
          font-size: 14px; 
          text-transform: uppercase; 
          letter-spacing: 0.05em; 
          cursor: pointer; 
          transition: transform 0.2s, background-color 0.2s; 
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); 
        }
        .btn:hover { background-color: #021f42; transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
        <button class="btn" onclick="window.close()">Fermer cette fenêtre</button>
      </div>
    </body>
    </html>
  `;
};

const BACKEND_URL = process.env.BACKEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5000');
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173');

app.use(cors({
  origin: [
    'https://gite-maladrerie.fr',
    'https://www.gite-maladrerie.fr',
    'https://api.gite-maladrerie.fr',
    'http://localhost:5173',
    'http://localhost:5000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe Webhook doit être avant express.json()
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      // Pour les tests sans webhook secret
      event = JSON.parse(request.body.toString());
    }
  } catch (err) {
    console.error("Erreur Webhook:", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const reservationId = session.metadata?.reservationId;
    const paymentType = session.metadata?.paymentType?.toLowerCase(); // 'acompte', 'solde', 'caution'
    
    if(reservationId) {
      // Calcul des frais Stripe
      let stripeFee = 0;
      if (session.payment_intent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
            expand: ['latest_charge.balance_transaction']
          });
          const charge = pi.latest_charge;
          if (charge && charge.balance_transaction) {
            stripeFee = charge.balance_transaction.fee / 100;
          }
        } catch (stripeErr) {
          console.error("Erreur récupération frais réels Stripe via API:", stripeErr);
        }
      }
      if (stripeFee === 0 && session.amount_total) {
        // Fallback standard : 1.4% + 0.25€
        stripeFee = Math.round(((session.amount_total / 100) * 0.014 + 0.25) * 100) / 100;
      }

      // Enregistrer automatiquement les frais Stripe en dépense
      if (stripeFee > 0 && (paymentType === 'acompte' || paymentType === 'solde' || paymentType === 'totalite')) {
        try {
          const existingExpense = await prisma.expense.findFirst({
            where: {
              description: {
                contains: session.id
              }
            }
          });

          if (!existingExpense) {
            await prisma.expense.create({
              data: {
                date: new Date(),
                label: `Frais Stripe - Réservation #${reservationId} (${paymentType.toUpperCase()})`,
                montant: stripeFee,
                categorie: 'Frais bancaires & Commissions Stripe',
                comptePcg: '627',
                description: `Automatique: Frais Stripe pour la session ${session.id}`
              }
            });
            console.log(`Frais Stripe de ${stripeFee} € enregistrés en dépense pour la résa ${reservationId}`);
          } else {
            console.log(`Frais Stripe déjà enregistrés pour la session ${session.id} (Résa #${reservationId})`);
          }
        } catch (expErr) {
          console.error("Erreur création dépense commission Stripe:", expErr);
        }
      }

      if (paymentType === 'acompte') {
        let balancePaymentLink = '';
        let stripeSoldeId = null;
        
        const reservationDb = await prisma.reservation.findUnique({
          where: { id: parseInt(reservationId) },
          include: { client: true }
        });

        let targetStatus = 'ACOMPTE_PAYE';
        if (reservationDb && reservationDb.statutPaiement === 'SOLDE_PAYE') {
          targetStatus = 'PAYE';
        }

        if (targetStatus === 'ACOMPTE_PAYE') {
          try {
            if (reservationDb) {
              const soldeSession = await createStripeSessionForReservation(reservationDb, 'solde');
              stripeSoldeId = soldeSession.id;
              balancePaymentLink = soldeSession.url;
            }
          } catch (err) {
            console.error("Erreur génération automatique du lien de solde lors du paiement de l'acompte:", err);
          }
        }

        const existingRes = await prisma.reservation.findUnique({ where: { id: parseInt(reservationId) } });
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { 
            statutPaiement: targetStatus,
            statut: 'RESERVE',
            stripeSoldeId: stripeSoldeId || undefined,
            modePaiement: 'STRIPE',
            payeLe: (existingRes && existingRes.payeLe) ? existingRes.payeLe : new Date()
          },
          include: { client: true, intervenant: true }
        });
        console.log(`Acompte payé (statut final: ${targetStatus}) pour la réservation ${reservationId}`);
        // Désactivé : remplacé par l'envoi hebdomadaire groupé (cron cuisine du jeudi)
        // await sendCuisineEmailIfNeeded(reservationId);
        await sendPaymentConfirmationEmails(reservation, 'acompte', session.amount_total / 100, balancePaymentLink);
        
        if (reservation.codePromo) {
          try {
            await prisma.promoCode.update({
              where: { code: reservation.codePromo.toUpperCase() },
              data: { usageActuel: { increment: 1 } }
            });
            console.log(`Usage incrémenté pour le code promo: ${reservation.codePromo}`);
          } catch (promoErr) {
            console.error("Erreur incrémentation code promo:", promoErr.message);
          }
        }
      } else if (paymentType === 'solde' || paymentType === 'totalite') {
        const resDb = await prisma.reservation.findUnique({
          where: { id: parseInt(reservationId) }
        });
        let targetStatus = 'PAYE';
        if (paymentType === 'solde' && resDb && resDb.montantAcompte > 0 && resDb.statutPaiement !== 'ACOMPTE_PAYE') {
          targetStatus = 'SOLDE_PAYE';
        }
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { 
            statutPaiement: targetStatus,
            modePaiement: 'STRIPE',
            payeLe: (resDb && resDb.payeLe) ? resDb.payeLe : new Date()
          },
          include: { client: true, intervenant: true }
        });
        console.log(`Solde/Totalité payé (statut final: ${targetStatus}) pour la réservation ${reservationId}`);
        // Désactivé : remplacé par l'envoi hebdomadaire groupé (cron cuisine du jeudi)
        // await sendCuisineEmailIfNeeded(reservationId);
        await sendPaymentConfirmationEmails(reservation, paymentType, session.amount_total / 100);
      } else if (paymentType === 'caution') {
        const reservation = await prisma.reservation.update({
          where: { id: parseInt(reservationId) },
          data: { 
            statutCaution: 'DEPOSEE',
            stripeCautionId: session.payment_intent
          },
          include: { client: true, intervenant: true }
        });
        console.log(`Caution déposée (PaymentIntent autorisé) pour la réservation ${reservationId}`);
        await sendPaymentConfirmationEmails(reservation, 'caution', session.amount_total / 100);
      }
    }
  }
  response.send();
});

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'david.roujet@mucomnisports.fr';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'muc2024';

const checkAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  
  // Compatibilité avec l'ancien token pour l'instant si besoin, mais on privilégie JWT
  if (token === 'fake-jwt-token-muc') {
    req.user = { email: ADMIN_EMAIL, role: 'admin' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expirée ou invalide' });
  }
};

const checkAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
};

const checkSuperAdmin = (req, res, next) => {
  if (req.user && req.user.email === ADMIN_EMAIL) {
    next();
  } else {
    res.status(403).json({ error: 'Accès réservé au SuperAdmin' });
  }
};

/**
 * Formate les détails d'une mission pour l'affichage HTML dans les e-mails.
 * @param {Object} m - L'objet mission
 * @param {Date} dateDebut - Date de début de la réservation
 * @param {Date} dateFin - Date de fin de la réservation
 * @returns {string} - HTML formaté pour la mission
 */
const getMissionDetail = (m, dateDebut, dateFin) => {
  const start = new Date(dateDebut);
  const end = new Date(dateFin);
  const veille = new Date(start);
  veille.setDate(veille.getDate() - 1);

  const formatDate = (date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatDateShort = (date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const formatPetitDejDates = (s, e) => {
    const dates = [];
    const curr = new Date(s);
    curr.setDate(curr.getDate() + 1);
    while (curr <= e) {
      dates.push(formatDateShort(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates.length > 0 ? dates.join(', ') : 'à définir';
  };

  let details = '';
  const typeLower = (m.typeMission || '').toLowerCase().trim();

  if (typeLower === 'prestation draps et ménage' || typeLower === 'draps et ménage') {
    details = `<strong>Prestation Draps et Ménage :</strong> effectuer le ménage de préparation du gîte et déposer les draps pliés sur chaque lit (l'intervenant ne fait pas les lits). S'assurer que toutes les chambres disposent d'un drap et que tous les lits de chaque chambre réservée disposent de draps, afin d'accueillir les personnes selon la répartition prévue. À réaliser la veille du séjour (le <strong>${formatDate(veille)}</strong>).`;
  } else if (typeLower === 'remise et récupération des clés' || typeLower === 'remise des clés') {
    details = `<strong>Remise et récupération des clés :</strong>
      <ul style="margin: 5px 0; padding-left: 20px;">
        <li><strong>Entrée (le ${formatDate(start)} à 17h00) :</strong> remise des clés aux clients, accompagnement à l'installation, vérification de la présence des draps et de la bonne installation des voyageurs pour s'assurer que tout se passe au mieux.</li>
        <li><strong>Sortie (le ${formatDate(end)} à 11h00) :</strong> récupération des clés et réalisation de l'état des lieux contradictoire de sortie.</li>
      </ul>`;
  } else if (typeLower === 'astreinte de nuit sur place') {
    details = `<strong>Astreinte de nuit sur place :</strong> surveillance nocturne continue du site du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>). Comprend également la gestion de l'arrivée tardive des personnes, de leur départ, ainsi que les tâches d'entretien/ménage nécessaires et, le cas échéant, la préparation/service du petit-déjeuner le lendemain matin.`;
  } else if (typeLower === 'astreinte de nuit à domicile') {
    details = `<strong>Astreinte de nuit à domicile :</strong> disponibilité téléphonique et physique pour intervenir en urgence sur le site du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>).`;
  } else if (typeLower === 'déplacement astreinte' || typeLower === 'déplacement sur site en astreinte') {
    details = `<strong>Déplacement sur site en astreinte :</strong> intervention ponctuelle d'urgence sur site (complément de +100 €).`;
  } else if (typeLower === 'lits faits') {
    details = `<strong>Lits faits :</strong> faire activement les lits pour préparer les chambres avant l'arrivée des voyageurs. À réaliser la veille du séjour (le <strong>${formatDate(veille)}</strong>) ou au plus tard le jour de l'arrivée avant 17h00 (le <strong>${formatDate(start)}</strong>).`;
  } else if (typeLower === 'linge de toilette') {
    details = `<strong>Linge de toilette :</strong> approvisionner et disposer le linge de toilette propre dans chaque chambre. À réaliser avant l'arrivée le <strong>${formatDate(start)}</strong>.`;
  } else if (typeLower === 'ménage' || typeLower === 'ménage de chambre') {
    details = `<strong>Ménage :</strong> nettoyage et remise au propre complète du gîte/des chambres. À réaliser le jour du départ à partir de 11h00 (le <strong>${formatDate(end)}</strong>).`;
  } else if (typeLower === 'préparation petit-déjeuner') {
    details = `<strong>Préparation petit-déjeuner :</strong> préparer et dresser le petit-déjeuner chaque matin du séjour. À réaliser les matins du <strong>${formatPetitDejDates(start, end)}</strong>.`;
  } else {
    details = `<strong>${m.typeMission} :</strong> prévue le ${m.date ? formatDate(new Date(m.date)) : 'à définir'}.`;
  }

  return `${details} <br/><span style="color: #666; font-size: 13px;">(Rémunération : ${m.montant.toFixed(2)} €)</span>`;
};

const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 7, 5: 7, 6: 5 };
const CHAMBRES_NAMES = { 1: "Chambre 1", 2: "Chambre 2", 3: "Chambre 3", 4: "Chambre 4", 5: "Chambre 5", 6: "Chambre 6" };

const recalculerPrix = async (dateDebut, dateFin, chambres, chambresDetails, options, promoCode, repas, salles) => {
  const start = new Date(dateDebut);
  const end = new Date(dateFin);
  const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (nuits <= 0) return 0;

  let total = 0;
  let totalAdultes = 0;

  // Chambres
  chambres.forEach(chId => {
    const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
    const nbAdultes = parseInt(details.adultes || 0);
    const nbMineurs = parseInt(details.enfants || 0);
    const occupants = nbAdultes + nbMineurs;
    const capacite = CHAMBRES_CAPACITE[chId] || 5;
    
    totalAdultes += nbAdultes;
    const tarifPers = occupants >= capacite ? 22 : 25;
    total += occupants * tarifPers * nuits;
    // Taxe de séjour : 4% du prix de la nuitée par adulte
    total += nbAdultes * (tarifPers * 0.044) * nuits;
  });

  // Salles de réunion
  if (salles) {
    let nuitsSalles = nuits;
    if (salles.dateDebut && salles.dateFin) {
      const startS = new Date(salles.dateDebut);
      const endS = new Date(salles.dateFin);
      nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
    }
    const prixSalle = chambres.length > 0 ? 100 : 150;
    if (salles.salle15) total += prixSalle * nuitsSalles;
    if (salles.salle12) total += prixSalle * nuitsSalles;
  }

  // Repas
  if (repas) {
    Object.values(repas).forEach(dayRepas => {
      if (dayRepas.PETIT_DEJ) {
        total += (parseInt(dayRepas.PETIT_DEJ.ADULTE || 0) * 6);
        total += (parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12 || 0) * 5);
        total += (parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5 || 0) * 4);
      }
      if (dayRepas.DEJEUNER) {
        total += (parseInt(dayRepas.DEJEUNER.ADULTE || 0) * 11.5);
        total += (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12 || 0) * 9.5);
        total += (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5 || 0) * 8);
      }
      if (dayRepas.DINER) {
        total += (parseInt(dayRepas.DINER.ADULTE || 0) * 14);
        total += (parseInt(dayRepas.DINER.ENFANT_MOINS_12 || 0) * 12);
        total += (parseInt(dayRepas.DINER.ENFANT_MOINS_5 || 0) * 10);
      }
    });
  }

  // Options
  const totalPersonnes = Object.values(chambresDetails || {}).reduce((acc, curr) => acc + parseInt(curr.adultes || 0) + parseInt(curr.enfants || 0), 0);
  if (options?.litsFaits) total += totalPersonnes * 5;
  if (options?.lingeFourni) total += totalPersonnes * 5;
  if (options?.menage) total += chambres.length * 50;

  // Promo
  if (promoCode) {
    const promo = await prisma.promoCode.findUnique({ where: { code: promoCode.toUpperCase() } });
    if (promo && promo.actif && (!promo.dateExpiration || promo.dateExpiration > new Date()) && (!promo.usageMax || promo.usageActuel < promo.usageMax)) {
      if (promo.type === 'pourcentage') {
        total = total * (1 - promo.valeur / 100);
      } else {
        total = Math.max(0, total - promo.valeur);
      }
    }
  }

  return Math.round(total * 100) / 100;
};

// Configuration Brevo API (v5) - La méthode la plus fiable en production
const brevo = new BrevoClient({ 
  apiKey: process.env.BREVO_API_KEY || process.env.SMTP_PASS 
});

const getStripeDescription = (res, isCaution = false) => {
  let taxe = 0;
  if (res.dateDebut && res.dateFin) {
    const start = new Date(res.dateDebut);
    const end = new Date(res.dateFin);
    const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    let nbAdultes = 0;
    let nbOccupants = 0;
    if (res.occupants && res.occupants.length > 0) {
      nbAdultes = res.occupants.filter(o => o.estAdulte).length;
      nbOccupants = res.occupants.length;
    } else if (res.chambresDetails && Object.keys(res.chambresDetails).length > 0) {
      Object.values(res.chambresDetails).forEach(room => {
        nbAdultes += parseInt(room.adultes || 0);
        nbOccupants += parseInt(room.adultes || 0) + parseInt(room.mineurs || 0);
      });
    }
    if (nbAdultes > 0 && res.chambres && res.chambres.length > 0) {
       const tarifPers = (nbOccupants >= res.chambres.length * 4) ? 22 : 25;
       taxe = nbAdultes * tarifPers * nuits * 0.044;
    }
  }
  const clientNom = res.client ? res.client.nom : (res.clientNom || '');
  const nbChambres = res.chambres ? res.chambres.length : 0;
  let text = `${clientNom}\nChambre(s) : ${nbChambres}\nDu ${new Date(res.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(res.dateFin).toLocaleDateString('fr-FR')}`;
  
  if (isCaution) {
    text += '\nCe montant ne sera pas prélevé.';
  } else {
    text += `\nTaxe de séjour incluse dans le prix total : ${taxe.toFixed(2)} €`;
  }
  return text;
};

const sendMail = async (options) => {
  // Déterminer s'il faut utiliser l'API Brevo (clé API valide commençant par xkeysib-)
  const brevoKey = process.env.BREVO_API_KEY;
  const useApi = brevoKey && brevoKey.startsWith('xkeysib-');

  if (useApi) {
    try {
      const toEmails = options.to.split(',').map(email => ({ email: email.trim() }));
      
      const emailPayload = {
        subject: options.subject,
        htmlContent: options.html,
        sender: { 
          name: "Gite de la Maladrerie - MUC", 
          email: "dr.mucomnisports@gmail.com" 
        },
        to: toEmails,
        headers: {
          'X-Mailin-Track-Click': '0',
          'X-Mailin-Track': '0'
        },
        attachment: options.attachments ? options.attachments.map(att => ({
          content: att.content,
          name: att.name
        })) : undefined
      };

      if (options.cc) {
        emailPayload.cc = options.cc.split(',').map(email => ({ email: email.trim() }));
      }

      await brevo.transactionalEmails.sendTransacEmail(emailPayload);
      console.log(`Email envoyé via API Brevo avec succès à : ${options.to}${options.cc ? ' (CC: ' + options.cc + ')' : ''}`);
      return;
    } catch (error) {
      console.error("Erreur lors de l'envoi de l'email via API Brevo:", error.message || error);
      console.log("Tentative de repli vers l'envoi SMTP...");
    }
  }

  // Repli : Envoi SMTP classique (sécurisé avec nodemailer)
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: `"Gite de la Maladrerie - MUC" <${process.env.SMTP_SENDER || 'dr.mucomnisports@gmail.com'}>`,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    if (options.cc) {
      mailOptions.cc = options.cc;
    }

    if (options.attachments) {
      mailOptions.attachments = options.attachments.map(att => ({
        filename: att.name,
        content: Buffer.from(att.content, 'base64')
      }));
    }

    await transporter.sendMail(mailOptions);
    console.log(`Email envoyé via SMTP avec succès à : ${options.to}${options.cc ? ' (CC: ' + options.cc + ')' : ''}`);
  } catch (smtpError) {
    console.error("Erreur lors de l'envoi de l'email via SMTP (échec total):", smtpError.message || smtpError);
  }
};

const getClientAttachments = () => {
  const attachments = [];
  try {
    const inventairePath = getAssetPath('Inventaire - 15-04-2026.docx');
    const etatDesLieuxPath = getAssetPath('ÉTAT DES LIEUX GITE - Client.docx');
    const cgvPath = getAssetPath('CGV - Gite de la Maladrerie.pdf');

    if (inventairePath && fs.existsSync(inventairePath)) {
      attachments.push({
        content: fs.readFileSync(inventairePath).toString('base64'),
        name: "Inventaire - Gite de la Maladrerie.docx"
      });
    } else {
      console.warn("Fichier inventaire manquant à :", inventairePath);
    }

    if (etatDesLieuxPath && fs.existsSync(etatDesLieuxPath)) {
      attachments.push({
        content: fs.readFileSync(etatDesLieuxPath).toString('base64'),
        name: "Etat des lieux - Gite de la Maladrerie.docx"
      });
    } else {
      console.warn("Fichier état des lieux manquant à :", etatDesLieuxPath);
    }

    if (cgvPath && fs.existsSync(cgvPath)) {
      attachments.push({
        content: fs.readFileSync(cgvPath).toString('base64'),
        name: "CGV - Gite de la Maladrerie.pdf"
      });
    } else {
      console.warn("Fichier CGV PDF manquant à :", cgvPath);
    }
  } catch (err) {
    console.error("Erreur lors du chargement des pièces jointes client:", err);
  }
  return attachments;
};

const getRulesVignettesHTML = () => {
  return `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 25px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <h3 style="color: #004B93; margin-top: 0; font-size: 15px; font-weight: bold; border-bottom: 2px solid #FFD700; padding-bottom: 6px; text-transform: uppercase; margin-bottom: 15px; letter-spacing: 0.5px;">📢 Les 6 Règles d'Or du Gîte (Consignes CGV)</h3>
      <p style="font-size: 12.5px; color: #475569; margin-bottom: 15px;">Pour garantir le confort de tous et le respect du gîte, merci de prendre connaissance de ces consignes importantes :</p>
      
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="48%" valign="top">
            <!-- Règle 1: Capacité -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #004B93; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">👥 Respect de la Capacité</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">Le nombre d'occupants ne doit jamais dépasser la capacité déclarée lors de votre réservation.</span>
            </div>
            
            <!-- Règle 2: Nuisances -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">🔇 Tranquillité & Bruit</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">Le calme est requis après 22h00 pour le respect du voisinage. Fêtes interdites en extérieur.</span>
            </div>

            <!-- Règle 3: Rangement Vaisselle -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #10b981; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">🧹 Consignes de départ</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">Vaisselle lavée et rangée, poubelles vidées et triées, draps retirés et meubles replacés à leur place d'origine.</span>
            </div>
          </td>
          <td width="4%">&nbsp;</td>
          <td width="48%" valign="top">
            <!-- Règle 4: Caution -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">🛡️ Dépôt de garantie (Caution)</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">L'empreinte de caution de 500 € par Stripe est obligatoire et doit être effectuée avant votre arrivée.</span>
            </div>
            
            <!-- Règle 5: Restauration -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #ec4899; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">🍳 Repas & Cuisine</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">Repas à réserver/modifier au plus tard le jeudi S-1 précédant le séjour. Nourriture interdite dans les chambres.</span>
            </div>

            <!-- Règle 6: Horaires -->
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; border-left: 4px solid #8b5cf6; margin-bottom: 12px;">
              <strong style="color: #1e293b; font-size: 12px; display: block; margin-bottom: 3px;">🕒 Arrivées & Départs</strong>
              <span style="font-size: 11px; color: #64748b; line-height: 1.4; display: block;">Accueil/remise des clés à partir de 17h00. Restitution des clés et état des lieux de sortie à 11h00.</span>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
};

async function getAdminEmailsForPreference(preferenceKey, fallbackEmails = []) {
  try {
    const admins = await prisma.adminAccount.findMany({
      where: {
        [preferenceKey]: true
      },
      select: {
        email: true
      }
    });

    const emailsSet = new Set();
    
    if (admins.length === 0) {
      if (process.env.ADMIN_EMAIL) emailsSet.add(process.env.ADMIN_EMAIL);
      emailsSet.add('david.roujet@mucomnisports.fr');
    } else {
      admins.forEach(a => {
        if (a.email && a.email.includes('@')) {
          emailsSet.add(a.email.trim());
        }
      });
    }

    fallbackEmails.forEach(email => {
      if (email && email.includes('@')) {
        emailsSet.add(email.trim());
      }
    });

    if (emailsSet.size === 0) {
      emailsSet.add('david.roujet@mucomnisports.fr');
    }

    return Array.from(emailsSet).join(',');
  } catch (error) {
    console.error(`Erreur getAdminEmailsForPreference pour ${preferenceKey}:`, error);
    const fallbackSet = new Set(['david.roujet@mucomnisports.fr']);
    if (process.env.ADMIN_EMAIL) fallbackSet.add(process.env.ADMIN_EMAIL);
    fallbackEmails.forEach(email => {
      if (email && email.includes('@')) {
        fallbackSet.add(email.trim());
      }
    });
    return Array.from(fallbackSet).join(',');
  }
}

const sendCuisineEmailIfNeeded = async (reservationId) => {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(reservationId) },
      include: { client: true, occupants: true }
    });
    
    if (!reservation) return;
    if (!reservation.repas || Object.keys(reservation.repas).length === 0) return;
    if (reservation.cuisineEmailEnvoye) return;

    // Vérifier si des repas ont été réellement commandés (quantités > 0)
    let hasMealsOrdered = false;
    for (const dayRepas of Object.values(reservation.repas)) {
      if (dayRepas) {
        const pd = dayRepas.PETIT_DEJ;
        const dj = dayRepas.DEJEUNER;
        const dn = dayRepas.DINER;
        
        const hasPd = pd && ((pd.ADULTE || 0) > 0 || (pd.ENFANT_MOINS_12 || 0) > 0 || (pd.ENFANT_MOINS_5 || 0) > 0);
        const hasDj = dj && ((dj.ADULTE || 0) > 0 || (dj.ENFANT_MOINS_12 || 0) > 0 || (dj.ENFANT_MOINS_5 || 0) > 0);
        const hasDn = dn && ((dn.ADULTE || 0) > 0 || (dn.ENFANT_MOINS_12 || 0) > 0 || (dn.ENFANT_MOINS_5 || 0) > 0);
        
        if (hasPd || hasDj || hasDn) {
          hasMealsOrdered = true;
          break;
        }
      }
    }
    
    if (!hasMealsOrdered) {
      console.log("Aucun repas commandé pour la réservation " + reservationId + ". Pas d'envoi d'email cuisine.");
      return;
    }
    
    const validStatuses = ['ACCEPTEE', 'RESERVE', 'CONFIRMEE'];
    const validPayStatuses = ['ACOMPTE_PAYE', 'PAYE'];
    
    if (!validStatuses.includes(reservation.statut) && !validPayStatuses.includes(reservation.statutPaiement)) {
      return;
    }

    let nbAdultes = 0;
    let nbMineurs12 = 0;
    let nbMineurs5 = 0;

    if (reservation.occupants && reservation.occupants.length > 0) {
      reservation.occupants.forEach(occ => {
        if (occ.estAdulte) {
          nbAdultes++;
        } else {
          const age = parseInt(occ.age);
          if (!isNaN(age) && age < 5) nbMineurs5++;
          else nbMineurs12++;
        }
      });
    } else if (reservation.chambresDetails) {
      Object.values(reservation.chambresDetails).forEach(ch => {
        nbAdultes += parseInt(ch.adultes || 0);
        nbMineurs12 += parseInt(ch.enfants || ch.mineurs || 0);
      });
    }
    
    let mealDetailsHTML = '<ul>';
    Object.entries(reservation.repas).forEach(([dateStr, dayRepas]) => {
      // Vérifier si ce jour précis a des repas
      const pd = dayRepas.PETIT_DEJ;
      const dj = dayRepas.DEJEUNER;
      const dn = dayRepas.DINER;
      const hasPd = pd && ((pd.ADULTE || 0) > 0 || (pd.ENFANT_MOINS_12 || 0) > 0 || (pd.ENFANT_MOINS_5 || 0) > 0);
      const hasDj = dj && ((dj.ADULTE || 0) > 0 || (dj.ENFANT_MOINS_12 || 0) > 0 || (dj.ENFANT_MOINS_5 || 0) > 0);
      const hasDn = dn && ((dn.ADULTE || 0) > 0 || (dn.ENFANT_MOINS_12 || 0) > 0 || (dn.ENFANT_MOINS_5 || 0) > 0);

      if (hasPd || hasDj || hasDn) {
        mealDetailsHTML += `<li><strong>${new Date(dateStr).toLocaleDateString('fr-FR')}</strong>:`;
        if (hasPd) {
          mealDetailsHTML += ` Petit-déj: ${pd.ADULTE || 0} Adulte(s), ${(pd.ENFANT_MOINS_12 || 0) + (pd.ENFANT_MOINS_5 || 0)} Enfant(s).`;
        }
        if (hasDj) {
          mealDetailsHTML += ` Déjeuner: ${dj.ADULTE || 0} Adulte(s), ${(dj.ENFANT_MOINS_12 || 0) + (dj.ENFANT_MOINS_5 || 0)} Enfant(s).`;
        }
        if (hasDn) {
          mealDetailsHTML += ` Dîner: ${dn.ADULTE || 0} Adulte(s), ${(dn.ENFANT_MOINS_12 || 0) + (dn.ENFANT_MOINS_5 || 0)} Enfant(s).`;
        }
        mealDetailsHTML += `</li>`;
      }
    });
    mealDetailsHTML += '</ul>';

    const cuisineEmail = process.env.CUISINE_EMAIL || process.env.ADMIN_EMAIL || 'cuisine@millau.fr';
    
    await sendMail({
      to: cuisineEmail,
      subject: `Nouvelle commande de repas - Réservation de ${reservation.client?.nom || 'Client'}`,
      html: `
        <h2>Nouvelle commande de repas validée</h2>
        <p><strong>Client :</strong> ${reservation.client?.nom || 'Non spécifié'}</p>
        <p><strong>Dates du séjour :</strong> du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</p>
        <p><strong>Détails de la commande :</strong></p>
        ${mealDetailsHTML}
      `
    });

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { cuisineEmailEnvoye: true }
    });
    console.log("Email cuisine envoyé avec succès pour la réservation " + reservation.id);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email cuisine:", error);
  }
};

// Fonction pour envoyer des e-mails de confirmation de paiement (Client + Admin)
const sendPaymentConfirmationEmails = async (reservation, paymentType, amount, balancePaymentLink = '') => {
  try {
    const isCaution = paymentType.toLowerCase() === 'caution';
    const isAcompte = paymentType.toLowerCase() === 'acompte';
    const isSolde = paymentType.toLowerCase() === 'solde' || paymentType.toLowerCase() === 'totalite';

    let typeLabel = '';
    let descriptionText = '';
    let cgvReference = '';
    const soldeRestant = (reservation.prixTotal || 0) - amount;

    const isSoldeComplet = isSolde && (reservation.statutPaiement === 'PAYE');
    const isSoldePartiel = isSolde && (reservation.statutPaiement === 'SOLDE_PAYE');

    let cautionButtonUrl = null;
    if (isSolde && reservation.statutCaution !== 'DEPOSEE') {
      try {
        const stripeCustomerCaution = await getOrCreateStripeCustomer(reservation.client?.email, reservation.client?.nom);
        const dDebut = new Date(reservation.dateDebut).toLocaleDateString('fr-FR');
        const dFin = new Date(reservation.dateFin).toLocaleDateString('fr-FR');
        
        const cautionParams = {
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Caution - Empreinte bancaire (Gîte de La Maladrerie)',
                description: `Dépôt de garantie pour la réservation #${reservation.id} du ${dDebut} au ${dFin}`,
              },
              unit_amount: 50000, // 500€
            },
            quantity: 1,
          }],
          mode: 'payment',
          billing_address_collection: 'required',
          payment_intent_data: {
            capture_method: 'manual', // Empreinte sans débit
          },
          success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${FRONTEND_URL}/payment-cancel`,
          metadata: {
            reservationId: reservation.id.toString(),
            paymentType: 'caution'
          }
        };
        if (stripeCustomerCaution) {
          cautionParams.customer = stripeCustomerCaution;
        } else if (reservation.client?.email && reservation.client?.email !== 'N/A') {
          cautionParams.customer_email = reservation.client.email;
        }

        const session = await stripe.checkout.sessions.create(cautionParams);
        if (session && session.url) {
          cautionButtonUrl = session.url;
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: { stripeCautionId: session.id }
          }).catch(e => console.error("Erreur save stripeCautionId server.js:", e.message));
        }
      } catch (errCaution) {
        console.error("Erreur création session caution Stripe server.js:", errCaution.message);
      }
    }

    if (isCaution) {
      typeLabel = 'Dépôt de garantie (Caution)';
      descriptionText = `Une empreinte bancaire temporaire de <strong>${amount.toFixed(2)} €</strong> a été enregistrée à titre de caution. Aucun montant n'a été débité de votre compte.`;
      cgvReference = `Conformément à l'Article 10 de nos CGV, cette caution est destinée à couvrir les éventuels dommages, manquements au règlement intérieur, ou frais de ménage. Elle sera automatiquement annulée/libérée dans un délai de 30 jours maximum après votre départ.`;
    } else if (isAcompte) {
      typeLabel = "Acompte (30%)";
      descriptionText = `Le paiement de l'acompte de 30% d'un montant de <strong>${amount.toFixed(2)} €</strong> a été validé. Vos dates de séjour sont désormais réservées.`;
      cgvReference = `Le solde restant de votre séjour (70%) d'un montant de <strong>${soldeRestant.toFixed(2)} €</strong> devra être réglé au plus tard 7 jours avant votre arrivée.`;
      if (balancePaymentLink) {
        cgvReference += ` Vous pouvez dès à présent le régler en utilisant le lien ci-dessous.`;
      } else {
        cgvReference += ` Vous recevrez un lien de paiement automatique par e-mail à cette date.`;
      }
    } else if (isSoldeComplet) {
      typeLabel = "Solde du séjour";
      descriptionText = `Le paiement du solde de votre séjour d'un montant de <strong>${amount.toFixed(2)} €</strong> a été validé. Votre réservation est désormais entièrement payée !`;
      cgvReference = `Avant votre entrée dans les lieux, il vous est demandé d'effectuer l'empreinte bancaire pour le dépôt de garantie (caution de 500 € - aucun débit). ${cautionButtonUrl ? 'Vous pouvez la réaliser dès maintenant ci-dessous.' : ''}`;
    } else if (isSoldePartiel) {
      typeLabel = "Solde du séjour (Règlement partiel)";
      descriptionText = `Le paiement du solde de votre séjour d'un montant de <strong>${amount.toFixed(2)} €</strong> a été validé. Attention : l'acompte de <strong>${(reservation.montantAcompte || 0).toFixed(2)} €</strong> reste à régler.`;
      cgvReference = `Pour confirmer définitivement votre réservation, merci de procéder également au règlement de l'acompte de <strong>${(reservation.montantAcompte || 0).toFixed(2)} €</strong>.`;
    }

    const dDebut = new Date(reservation.dateDebut).toLocaleDateString('fr-FR');
    const dFin = new Date(reservation.dateFin).toLocaleDateString('fr-FR');

    // 1. Email pour le Client
    if (reservation.client?.email && reservation.client?.email !== 'N/A') {
      let tokenModification = reservation.tokenModification;
      if (!tokenModification) {
        tokenModification = require('crypto').randomBytes(32).toString('hex');
        try {
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: { tokenModification }
          });
        } catch (dbErr) {
          console.error("Erreur lors de la génération de tokenModification:", dbErr);
        }
      }

      const adminEmail = reservation.validePar || 'david.roujet@mucomnisports.fr';
      const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
      const modificationLinkHTML = getModificationLinkHTML(tokenModification);

      await sendMail({
        to: reservation.client.email,
        subject: `Confirmation de paiement - ${typeLabel} - Gîte de la Maladrerie`,
        attachments: !isCaution ? getClientAttachments() : undefined,
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #004B93; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                      <p>Nous vous remercions pour votre transaction.</p>
                      
                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #004B93;">
                        <p style="margin: 0 0 10px 0;"><strong>Type de transaction :</strong> ${typeLabel}</p>
                        <p style="margin: 0 0 10px 0;"><strong>Montant :</strong> ${amount.toFixed(2)} €</p>
                        <p style="margin: 0;"><strong>Séjour :</strong> du ${dDebut} au ${dFin}</p>
                      </div>

                      <p>${descriptionText}</p>
                      <p style="background-color: #fff8e1; border: 1px solid #ffe082; padding: 15px; border-radius: 8px; font-size: 13px; color: #856404; margin-top: 20px;">
                        📢 <strong>Important :</strong> ${cgvReference}
                      </p>
                      
                      ${cautionButtonUrl ? `
                      <div style="background-color: #eff6ff; border: 2px solid #3b82f6; padding: 25px; border-radius: 10px; text-align: center; margin: 30px 0; box-shadow: 0 4px 6px rgba(59,130,246,0.1);">
                        <h3 style="margin: 0 0 10px 0; color: #004B93; font-size: 18px; font-weight: bold;">🛡️ Dépôt de garantie (Caution de 500 €)</h3>
                        <p style="margin: 0 0 16px 0; color: #334155; font-size: 14px; line-height: 1.5;">
                          Votre séjour est payé ! Afin de finaliser la préparation de votre entrée dans les lieux, merci d'effectuer dès maintenant l'<strong>empreinte bancaire sécurisée de 500 €</strong>.<br>
                          <strong style="color: #059669;">Il s'agit d'une simple empreinte : aucun montant n'est débité de votre compte bancaire.</strong>
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center">
                              <a href="${cautionButtonUrl}" style="background-color: #004B93; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,75,147,0.25);">
                                ⚡ Réaliser l'empreinte de caution (500 €)
                              </a>
                            </td>
                          </tr>
                        </table>
                      </div>
                      ` : ''}

                      ${!isCaution ? `
                      <p style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; font-size: 13px; color: #166534; margin-top: 20px;">
                        📎 <strong>Pièces jointes obligatoires :</strong> Vous trouverez en pièces jointes les <strong>CGV (PDF)</strong>, l'<strong>Inventaire</strong> et l'<strong>État des lieux</strong> du gîte. Le présent contrat est complété par l'état des lieux et l'inventaire en annexe. Il appartient aux occupants d'en vérifier l'exactitude dès leur arrivée. Tout écart doit impérativement nous être signalé dans les premières heures de l'entrée dans les lieux.
                      </p>
                      <p style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 8px; font-size: 13px; color: #1e3a8a; margin-top: 20px;">
                        📝 <strong>Émargement à l'arrivée :</strong> Afin de valider la remise des clés, l'état des lieux et l'inventaire devront être émargés en ligne le jour de votre arrivée à partir de 17h00 (via un lien reçu par e-mail ou en scannant le QR code de l'intervenant sur place).
                      </p>
                      ${getRulesVignettesHTML()}
                      ` : ''}

                      ${isAcompte ? `
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px; margin: 20px 0; font-size: 13px; border-left: 4px solid #10b981;">
                        <p style="margin-top: 0; font-weight: bold; color: #10b981; font-size: 14px;">🙋‍♂️ Souhaitez-vous régler le solde à votre arrivée ?</p>
                        <p style="margin-bottom: 15px; color: #475569;">Si vous préférez régler le solde restant (${soldeRestant.toFixed(2)} €) directement le jour de votre arrivée sur les lieux (chèque, espèces), merci de nous l'indiquer d'un simple clic ci-dessous pour enregistrer votre choix et stopper les relances e-mail :</p>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: center;">
                          <tr>
                            <td>
                              <a href="${BACKEND_URL}/api/payment/pay-on-arrival/${tokenModification}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">Je réglerai mon solde sur place à l'arrivée</a>
                            </td>
                          </tr>
                        </table>
                      </div>
                      ` : ''}
                      
                      ${(isAcompte && balancePaymentLink) ? `
                        <div style="background-color: #fff8e1; border: 1px solid #ffe082; padding: 25px; border-radius: 8px; text-align: center; margin: 30px 0;">
                          <p style="font-weight: bold; margin: 0 0 15px 0; color: #004B93;">Régler dès maintenant le solde restant (${soldeRestant.toFixed(2)} €) :</p>
                          <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center">
                                <a href="${balancePaymentLink}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block;">Payer le solde de ${soldeRestant.toFixed(2)} €</a>
                              </td>
                            </tr>
                          </table>
                        </div>
                      ` : ''}

                      ${modificationLinkHTML}

                      <p style="margin-top: 30px;">À très bientôt !</p>
                      
                      ${adminSignatureHTML}
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #FDB913; height: 5px;"></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
    }

    // 2. Email pour l'Administrateur
    const adminEmail = await getAdminEmailsForPreference('notifPaymentReceived');
    await sendMail({
      to: adminEmail,
      subject: `💰 Nouveau paiement reçu - ${typeLabel} (${reservation.client?.nom || 'Client'})`,
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: bold;">Paiement Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Nouveau paiement enregistré</h2>
                    <p>Un paiement vient d'être validé en ligne via Stripe :</p>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #004B93;">
                      <p style="margin: 0 0 10px 0;"><strong>Client :</strong> ${reservation.client?.nom || 'Non spécifié'} (${reservation.client?.email || 'N/A'})</p>
                      <p style="margin: 0 0 10px 0;"><strong>Type de transaction :</strong> ${typeLabel}</p>
                      <p style="margin: 0 0 10px 0;"><strong>Montant :</strong> ${amount.toFixed(2)} €</p>
                      <p style="margin: 0 0 10px 0;"><strong>Séjour :</strong> du ${dDebut} au ${dFin}</p>
                      <p style="margin: 0;"><strong>Référence devis :</strong> ${reservation.numeroDevis || 'N/A'}</p>
                    </div>

                    <p>Vous pouvez consulter et gérer cette réservation directement dans votre espace administratif.</p>
                    <p style="margin-top: 30px;"><strong>Notification système - Maladrerie</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });
  } catch (error) {
    console.error("Erreur lors de l'envoi des e-mails de confirmation de paiement:", error);
  }
};


async function getOrCreateStripeCustomer(email, nom) {
  if (!email || email === 'N/A') return undefined;
  try {
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    if (customers.data.length > 0) {
      return customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({ email, name: nom });
      return customer.id;
    }
  } catch (err) {
    console.error("Erreur création client Stripe:", err);
    return undefined; // Fallback without customer
  }
}


// Obtenir toutes les réservations approuvées et devis en attente pour le calendrier
app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        OR: [
          { statut: 'RESERVE' },
          { statut: 'DEVIS_EN_ATTENTE' }
        ]
      },
      include: {
        client: true
      }
    });
    // Filter out expired devis explicitly just in case the cron job hasn't run yet
    const validReservations = reservations.filter(r => {
      if (r.statut === 'DEVIS_EN_ATTENTE') {
        if (!r.expireLe) return false;
        if (new Date(r.expireLe) < new Date()) return false;
      }
      return true;
    });
    res.json(validReservations);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' });
  }
});


// --- HELPER STRIPE : Créer une session de paiement Stripe ---
async function createStripeSessionForReservation(reservation, paymentType) {
  const stripeCustomerId = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
  
  let amount = 0;
  let productName = '';
  
  if (paymentType === 'acompte') {
    const repasTotal = calculerTotalRepasServeur(reservation.repas);
    const montantHebergement = Math.max(0, (reservation.prixTotal || 0) - repasTotal);
    amount = reservation.montantAcompte ? reservation.montantAcompte : Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    productName = repasTotal > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie';
  } else if (paymentType === 'solde') {
    amount = reservation.montantSolde ? reservation.montantSolde : ((reservation.prixTotal || 0) - (reservation.montantAcompte || 0));
    productName = 'Solde du séjour - Gîte de La Maladrerie';
  } else if (paymentType === 'totalite') {
    amount = reservation.prixTotal || 0;
    productName = 'Paiement total du séjour - Gîte de La Maladrerie';
  }
  
  const params = {
    payment_method_types: ['card'],
    allow_promotion_codes: true,
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: productName,
          description: getStripeDescription(reservation),
        },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    billing_address_collection: 'required',
    success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND_URL}/payment-cancel`,
    metadata: {
      reservationId: reservation.id.toString(),
      paymentType: paymentType
    }
  };
  
  if (stripeCustomerId) {
    params.customer = stripeCustomerId;
  } else if (reservation.client.email && reservation.client.email !== 'N/A') {
    params.customer_email = reservation.client.email;
  }
  
  const session = await stripe.checkout.sessions.create(params);
  return session;
}

// --- HELPER : Obtenir ou assigner un numéro de facture unique ---
async function getOrAssignNumeroFacture(reservationId) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId }
  });
  if (!reservation) return null;
  if (reservation.numeroFacture) return reservation.numeroFacture;

  const estConfirmee = ['RESERVE', 'TERMINE'].includes(reservation.statut) || 
                       ['ACOMPTE_PAYE', 'PAYE'].includes(reservation.statutPaiement);

  if (estConfirmee) {
    const year = new Date(reservation.dateDebut || new Date()).getFullYear();
    
    // Récupérer toutes les factures existantes pour cette année afin de trouver le max
    const existingReservations = await prisma.reservation.findMany({
      where: {
        numeroFacture: { startsWith: `FA-${year}-` }
      },
      select: {
        numeroFacture: true
      }
    });

    let maxSuffix = 0;
    existingReservations.forEach(r => {
      if (r.numeroFacture) {
        const parts = r.numeroFacture.split('-');
        if (parts.length === 3) {
          const suffixNum = parseInt(parts[2], 10);
          if (!isNaN(suffixNum) && suffixNum > maxSuffix) {
            maxSuffix = suffixNum;
          }
        }
      }
    });

    const numeroFacture = `FA-${year}-${String(maxSuffix + 1).padStart(4, '0')}`;
    
    // Mettre à jour en base de données
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { numeroFacture }
    });
    return numeroFacture;
  }
  return null;
}

// --- HELPER : Calculer le total des repas ---
function calculerTotalRepasServeur(repas) {
  if (!repas) return 0;
  let total = 0;
  Object.values(repas).forEach(day => {
    if (day.PETIT_DEJ) {
      total += (parseInt(day.PETIT_DEJ.ADULTE || 0) * 6);
      total += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_12 || 0) * 5);
      total += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_5 || 0) * 4);
    }
    if (day.DEJEUNER) {
      total += (parseInt(day.DEJEUNER.ADULTE || 0) * 11.5);
      total += (parseInt(day.DEJEUNER.ENFANT_MOINS_12 || 0) * 9.5);
      total += (parseInt(day.DEJEUNER.ENFANT_MOINS_5 || 0) * 8);
    }
    if (day.DINER) {
      total += (parseInt(day.DINER.ADULTE || 0) * 14);
      total += (parseInt(day.DINER.ENFANT_MOINS_12 || 0) * 12);
      total += (parseInt(day.DINER.ENFANT_MOINS_5 || 0) * 10);
    }
  });
  return total;
}

// --- HELPER : Calculer le coût de revient des déjeuners et dîners (7.11€ / 6.23€) ---
function calculerCoutRepasServeur(repas) {
  if (!repas) return 0;
  let totalCout = 0;
  Object.values(repas).forEach(day => {
    if (day.DEJEUNER) {
      totalCout += (parseInt(day.DEJEUNER.ADULTE || 0) * 7.11);
      totalCout += (parseInt(day.DEJEUNER.ENFANT_MOINS_12 || 0) * 6.23);
      totalCout += (parseInt(day.DEJEUNER.ENFANT_MOINS_5 || 0) * 6.23);
    }
    if (day.DINER) {
      totalCout += (parseInt(day.DINER.ADULTE || 0) * 7.11);
      totalCout += (parseInt(day.DINER.ENFANT_MOINS_12 || 0) * 6.23);
      totalCout += (parseInt(day.DINER.ENFANT_MOINS_5 || 0) * 6.23);
    }
  });
  return Math.round(totalCout * 100) / 100;
}

// --- HELPER : Calculer le détail des revenus par type de repas ---
function calculerRevenuRepasServeur(repas) {
  if (!repas) return { total: 0, petitDej: 0, dejeuner: 0, diner: 0 };
  let petitDej = 0;
  let dejeuner = 0;
  let diner = 0;
  Object.values(repas).forEach(day => {
    if (day.PETIT_DEJ) {
      petitDej += (parseInt(day.PETIT_DEJ.ADULTE || 0) * 6);
      petitDej += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_12 || 0) * 5);
      petitDej += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_5 || 0) * 4);
    }
    if (day.DEJEUNER) {
      dejeuner += (parseInt(day.DEJEUNER.ADULTE || 0) * 11.5);
      dejeuner += (parseInt(day.DEJEUNER.ENFANT_MOINS_12 || 0) * 9.5);
      dejeuner += (parseInt(day.DEJEUNER.ENFANT_MOINS_5 || 0) * 8);
    }
    if (day.DINER) {
      diner += (parseInt(day.DINER.ADULTE || 0) * 14);
      diner += (parseInt(day.DINER.ENFANT_MOINS_12 || 0) * 12);
      diner += (parseInt(day.DINER.ENFANT_MOINS_5 || 0) * 10);
    }
  });
  return {
    total: Math.round((petitDej + dejeuner + diner) * 100) / 100,
    petitDej: Math.round(petitDej * 100) / 100,
    dejeuner: Math.round(dejeuner * 100) / 100,
    diner: Math.round(diner * 100) / 100
  };
}

// --- HELPER : Obtenir les coordonnées de l'admin validateur ---
async function getValidatingAdminDetails(validePar) {
  let admin = null;
  if (validePar && validePar.includes('@')) {
    try {
      admin = await prisma.adminAccount.findUnique({
        where: { email: validePar }
      });
    } catch (err) {
      console.error("Erreur getValidatingAdminDetails:", err);
    }
  }
  const isGeneric = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
  return {
    nom: isGeneric ? 'David Roujet' : admin.nom,
    email: admin ? admin.email : 'david.roujet@mucomnisports.fr',
    telephone: admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81'
  };
}

// --- HELPER : Générer la signature admin pour les e-mails ---
async function getAdminSignatureHTML(validePar) {
  const details = await getValidatingAdminDetails(validePar);
  return `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 14px; color: #555555; font-family: sans-serif;">
      <p style="margin: 0 0 5px 0; color: #666666; font-size: 12px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Votre conseiller pour ce séjour :</p>
      <p style="margin: 0 0 3px 0; font-weight: bold; color: #004B93; font-size: 16px;">${details.nom}</p>
      <p style="margin: 0 0 3px 0;">✉ Email : <a href="mailto:${details.email}" style="color: #004B93; text-decoration: none;">${details.email}</a></p>
      <p style="margin: 0;">📞 Tél : <a href="tel:${details.telephone.replace(/\s+/g, '')}" style="color: #004B93; text-decoration: none;">${details.telephone}</a></p>
    </div>
  `;
}

// --- HELPER : Générer le bloc de lien de modification de réservation ---
function getModificationLinkHTML(tokenModification) {
  if (!tokenModification) return '';
  const modificationLink = `${FRONTEND_URL}/reservation/modify?token=${tokenModification}`;
  return `
    <div style="background-color: #f1f5f9; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-top: 25px; font-family: sans-serif;">
      <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
        <strong>Modifier votre séjour :</strong> Vous pouvez à tout moment revoir et modifier les détails de votre réservation (dates, chambres, repas, options, occupants) en utilisant le lien sécurisé ci-dessous. Toute modification soumise sera validée par votre conseiller.
      </p>
      <p style="margin: 12px 0 0 0; text-align: center;">
        <a href="${modificationLink}" style="background-color: #004B93; color: white; padding: 8px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">Modifier ma réservation</a>
      </p>
    </div>
  `;
}

// --- HELPER : Générer la section Options, Repas et Salles pour les e-mails ---
function generateOptionsHTML(options, repas, salles) {
  let html = `<div style="margin-top: 30px; margin-bottom: 30px; padding: 20px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px;">
    <h3 style="color: #004B93; margin-top: 0; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #FDB913; padding-bottom: 8px; display: inline-block;">Options et Services sélectionnés</h3>`;
  
  let hasOptions = false;

  // Repas
  if (repas && Object.keys(repas).length > 0) {
    let repasDetails = [];
    Object.entries(repas).forEach(([dateStr, meals]) => {
      let selectedMeals = [];
      const addMealDetail = (type, label) => {
        if (!meals[type]) return;
        const a = parseInt(meals[type].ADULTE || 0);
        const e12 = parseInt(meals[type].ENFANT_MOINS_12 || 0);
        const e5 = parseInt(meals[type].ENFANT_MOINS_5 || 0);
        if (a > 0 || e12 > 0 || e5 > 0) {
          let parts = [];
          if (a > 0) parts.push(`${a} Adulte${a > 1 ? 's' : ''}`);
          if (e12 > 0) parts.push(`${e12} Enfant${e12 > 1 ? 's' : ''} (-12 ans)`);
          if (e5 > 0) parts.push(`${e5} Enfant${e5 > 1 ? 's' : ''} (-5 ans)`);
          selectedMeals.push(`${label} (${parts.join(', ')})`);
        } else {
          selectedMeals.push(label);
        }
      };
      
      addMealDetail('PETIT_DEJ', 'Petit-déjeuner');
      addMealDetail('DEJEUNER', 'Déjeuner');
      addMealDetail('DINER', 'Dîner');

      if (selectedMeals.length > 0) {
        const dateObj = new Date(dateStr);
        const dateLabel = isNaN(dateObj.getTime()) ? dateStr : dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        repasDetails.push(`<li style="margin-bottom: 5px;"><strong style="text-transform: capitalize;">${dateLabel} :</strong><br/><span style="margin-left: 10px; display: inline-block;">- ${selectedMeals.join('<br/>- ')}</span></li>`);
      }
    });
    if (repasDetails.length > 0) {
      hasOptions = true;
      html += `
        <h4 style="color: #333; margin-top: 15px; margin-bottom: 10px; font-size: 14px;">🍽️ Restauration</h4>
        <ul style="margin: 0; padding-left: 20px; color: #555;">
          ${repasDetails.join('')}
        </ul>
      `;
    }
  }

  // Salles
  if (salles) {
    let sallesSelected = [];
    if (salles.salle15) sallesSelected.push("Salle de réunion 15 places");
    if (salles.salle12) sallesSelected.push("Salle de réunion 12 places");
    if (sallesSelected.length > 0) {
      hasOptions = true;
      let dateString = "";
      if (salles.dateDebut && salles.dateFin) {
         dateString = ` (du ${new Date(salles.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} au ${new Date(salles.dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })})`;
      }
      html += `
        <h4 style="color: #333; margin-top: 15px; margin-bottom: 10px; font-size: 14px;">💼 Salles de réunion${dateString}</h4>
        <ul style="margin: 0; padding-left: 20px; color: #555;">
          ${sallesSelected.map(s => `<li style="margin-bottom: 5px;">${s}</li>`).join('')}
        </ul>
        <p style="margin: 5px 0 0 20px; font-size: 12px; font-style: italic; color: #777;">
          Note : La salle est disponible à  partir de 17h le jour d'arrivée, jusqu'à  minuit le jour du départ.
        </p>
      `;
    }
  }

  // Options Confort
  if (options) {
    let optionsSelected = [];
    if (options.litsFaits) optionsSelected.push("Lits faits à  l'arrivée");
    if (options.lingeFourni) optionsSelected.push("Linge de toilette fourni");
    if (options.menage) optionsSelected.push("Ménage fin de séjour");
    if (optionsSelected.length > 0) {
      hasOptions = true;
      html += `
        <h4 style="color: #333; margin-top: 15px; margin-bottom: 10px; font-size: 14px;">🛏️ Options de confort</h4>
        <ul style="margin: 0; padding-left: 20px; color: #555;">
          ${optionsSelected.map(o => `<li style="margin-bottom: 5px;">${o}</li>`).join('')}
        </ul>
      `;
    }
  }

  if (!hasOptions) {
    html += `<p style="margin: 0; color: #777; font-style: italic;">Aucune option sélectionnée.</p>`;
  }

  html += `</div>`;
  return html;
}

app.post('/api/reservations', async (req, res) => {
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, chambresDetails, options, structure } = req.body;

  // Recalculer le prix côté serveur pour sécurité
  const backendPrixTotal = await recalculerPrix(dateDebut, dateFin, chambres, chambresDetails, options, req.body.promoCode, req.body.repas, req.body.salles);
  const prixTotal = backendPrixTotal; // Alias de sécurité pour éviter les ReferenceError


  try {
    const reservation = await prisma.reservation.create({
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres,
        chambresDetails: chambresDetails || null,
        options: options || null,
        repas: req.body.repas || null,
        salles: req.body.salles || null,
        prixTotal: backendPrixTotal,
        codePromo: req.body.promoCode || null,
        isGroupe: false,
        structure: structure || null,
        client: {
          create: {
            nom,
            email,
            telephone,
            adressePostale: adressePostale || null
          }
        },
        occupants: occupants && occupants.length > 0 ? {
          create: occupants.map(occ => {
            const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
            let occNom = occ.nom;
            let occPrenom = occ.prenom;
            if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
              occNom = "Mineur";
              occPrenom = "";
            }
            const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
            let nationalite = occ.nationalite;
            if (nationalite === true || nationalite === 'true') {
              nationalite = 'Française';
            } else if (nationalite === false || nationalite === 'false') {
              nationalite = 'Étrangère';
            } else if (!nationalite) {
              nationalite = 'Française';
            }
            return {
              nom: occNom || '',
              prenom: occPrenom || '',
              estAdulte,
              age,
              nationalite
            };
          })
        } : undefined
      },
      include: { client: true, occupants: true }
    });

    const client = reservation.client;

    // Calculs
    const nbPersonnes = occupants ? occupants.length : 0;
    const nbNuits = Math.round((new Date(dateFin) - new Date(dateDebut)) / (1000 * 60 * 60 * 24));

    // Recherche des intervenants disponibles
    const availableIntervenants = await prisma.intervenant.findMany({
      where: {
        disponibilites: {
          some: {
            dateDebut: { lte: new Date(dateDebut) },
            dateFin: { gte: new Date(dateFin) }
          }
        }
      }
    });

    let intervenantsHTML = '';
    if (availableIntervenants && availableIntervenants.length > 0) {
      intervenantsHTML = `
        <div style="margin-top: 20px; padding: 15px; background-color: #e8f5e9; border-left: 4px solid #28a745; border-radius: 4px;">
          <h3 style="color: #155724; margin-top: 0; font-size: 16px;">✅ Intervenants disponibles sur cette période :</h3>
          <ul style="color: #155724; margin-bottom: 0; list-style-type: none; padding-left: 0;">
            ${availableIntervenants.map(inv => `<li style="margin-bottom: 5px;"><strong>${inv.prenom} ${inv.nom}</strong> (${inv.telephone})</li>`).join('')}
          </ul>
        </div>
      `;
    } else {
      intervenantsHTML = `
        <div style="margin-top: 20px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <p style="color: #856404; margin: 0;">⚠️ Aucun intervenant n'a renseigné de disponibilité couvrant entièrement cette période.</p>
        </div>
      `;
    }

    // Vérification dernière minute (moins de 3 jours)
    const isLastMinute = Math.round((new Date(dateDebut) - new Date()) / (1000 * 60 * 60 * 24)) < 3;

    const responseData = { ...reservation, isLastMinute };
    if (isLastMinute) {
      responseData.lastMinuteWarning = "Votre réservation a bien été enregistrée. Celle-ci étant effectuée moins de 3 jours avant la date d'arrivée, nous vous invitons à  contacter directement Philippe Morereau (07 52 62 79 62) ou David Roujet (06 67 99 36 81) afin de confirmer la bonne prise en compte de votre demande.";
    }

    // Envoyer mail d'alerte aux administrateurs
    const acceptLink = `${BACKEND_URL}/api/reservations/${reservation.id}/accept`;
    const rejectLink = `${BACKEND_URL}/api/reservations/${reservation.id}/reject`;

    let detailsChambresHTML = '';
    if (chambresDetails) {
      detailsChambresHTML = Object.entries(chambresDetails).map(([chId, details]) => 
        `<li>Chambre ${chId} : ${details.adultes} adulte(s), ${details.enfants} mineur(s)</li>`
      ).join('');
    }

    let occupantsHTML = '';
    if (occupants && occupants.length > 0) {
      occupantsHTML = `
        <p><strong>Occupants (${nbPersonnes} personnes) :</strong></p>
        <ul>
          ${occupants.map(occ => `<li>${occ.prenom} ${occ.nom} - ${occ.estAdulte ? 'Adulte' : `Mineur (${occ.age} ans)`}</li>`).join('')}
        </ul>
      `;
    }

    const optionsHTML = generateOptionsHTML(options, reservation.repas, reservation.salles);

    const adminEmails = await getAdminEmailsForPreference('notifNewReservation', ['david.roujet@mucomnisports.fr', 'philippe.morereau@mucomnisports.fr']);
    console.log(`Tentative d'envoi d'alerte admin à : ${adminEmails}`);
    
    await sendMail({
      to: adminEmails,
      subject: "Nouvelle demande de réservation - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0; font-size: 20px;">Nouvelle demande de réservation</h2>
                    <p style="margin-bottom: 20px;">Un nouveau prospect vient de soumettre une demande via le site internet.</p>
                    
                    <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin-bottom: 25px;">
                      <tr>
                        <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Client</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${client.nom}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">E-mail</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${client.email}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Téléphone</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${client.telephone}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Dates</td>
                        <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Chambres</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${reservation.chambres.join(', ')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold;">Montant Estimé</td>
                        <td style="font-size: 18px; font-weight: bold; color: #004B93;">${backendPrixTotal.toFixed(2)} €</td>
                      </tr>
                    </table>

                    ${occupantsHTML ? `<div style="margin-bottom: 20px;">${occupantsHTML}</div>` : ''}
                    ${optionsHTML ? `<div style="margin-bottom: 20px;">${optionsHTML}</div>` : ''}
                    
                    <div style="margin-bottom: 30px;">
                      ${intervenantsHTML}
                    </div>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background-color: #28a745; border-radius: 6px;">
                                <a href="${acceptLink}" style="display: inline-block; padding: 15px 25px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">ACCEPTER ET DEMANDER PAIEMENT</a>
                              </td>
                              <td width="20"></td>
                              <td style="background-color: #dc3545; border-radius: 6px;">
                                <a href="${rejectLink}" style="display: inline-block; padding: 15px 25px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">REFUSER</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #777777; border-top: 1px solid #eeeeee;">
                    <p style="margin: 0;">Ceci est une notification automatique du système de réservation du Gîte de La Maladrerie.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    // Envoyer le mail de confirmation au client
    await sendMail({
      to: email,
      subject: "Demande de réservation - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${nom},</h2>
                    <p>Nous avons bien reçu votre demande de réservation pour la période du <strong>${new Date(dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
                    ${generateOptionsHTML(options, req.body.repas, req.body.salles)}
                    <p>Notre équipe va étudier votre demande et vous répondra dans les plus brefs délais pour vous confirmer la disponibilité et vous envoyer les instructions de paiement.</p>
                    <p style="margin-top: 30px;">À très bientôt,<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.status(201).json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de la réservation' });
  }

});

// Accepter une réservation
app.get('/api/reservations/:id/accept', async (req, res) => {
  const { id } = req.params;
  try {
    const existingReservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!existingReservation) {
      return res.status(404).send("Réservation introuvable");
    }

    const checkInDate = new Date(existingReservation.dateDebut);
    const today = new Date();
    checkInDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((checkInDate - today) / (1000 * 60 * 60 * 24));
    const isLastMinuteStay = daysDiff < 10;

    let paymentLink = null;
    let stripeSessionId = null;
    
    // Calcul des montants
    const montantTotal = existingReservation.prixTotal || 0;
    const repasTotal = calculerTotalRepasServeur(existingReservation.repas);
    const montantHebergement = Math.max(0, montantTotal - repasTotal);
    const montantAcompte = Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    const montantSolde = Math.round((montantTotal - montantAcompte) * 100) / 100;

    const paymentType = isLastMinuteStay ? 'totalite' : 'acompte';
    const tokenModification = existingReservation.tokenModification || require('crypto').randomBytes(32).toString('hex');
    paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=${paymentType}`;

    let adminEmail = req.query.adminEmail || existingReservation.validePar || 'david.roujet@mucomnisports.fr';
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.email) {
          adminEmail = decoded.email;
        }
      } catch (jwtErr) {
        console.error("JWT decoding error in accept route:", jwtErr);
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statut: 'RESERVE',
        montantAcompte: isLastMinuteStay ? 0 : montantAcompte,
        montantSolde: isLastMinuteStay ? montantTotal : montantSolde,
        validePar: adminEmail,
        tokenModification: tokenModification
      },
      include: { client: true }
    });
    // Calculs
    const dDebutAccept = new Date(reservation.dateDebut);
    const dFinAccept = new Date(reservation.dateFin);
    const nbNuitsAccept = Math.round((dFinAccept - dDebutAccept) / (1000 * 60 * 60 * 24));
    
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: "Confirmation de votre réservation et Paiement - Gîte de La Maladrerie",
      attachments: getClientAttachments(),
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                    <p>Nous avons le plaisir de vous confirmer votre réservation pour votre séjour au <strong>Gîte de La Maladrerie</strong>.</p>
                    
                    <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin: 20px 0;">
                      <tr>
                        <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Période</td>
                        <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Durée</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${nbNuitsAccept} nuit(s)</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Chambres</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${reservation.chambres.join(', ')}</td>
                      </tr>
                      ${reservation.prixTotal ? `
                      <tr>
                        <td style="font-weight: bold;">Montant Total</td>
                        <td style="font-weight: bold; color: #004B93;">${reservation.prixTotal.toFixed(2)} €</td>
                      </tr>` : ''}
                    </table>

                    ${existingReservation.occupants && existingReservation.occupants.length > 0 ? `
                      <p style="font-weight: bold; margin-bottom: 10px;">Occupants inscrits (${existingReservation.occupants.length} personnes) :</p>
                      <ul style="padding-left: 20px; margin-bottom: 25px;">
                        ${existingReservation.occupants.map(occ => `<li>${occ.nom} ${occ.prenom} - ${occ.estAdulte ? 'Adulte' : `Mineur (${occ.age} ans)`}</li>`).join('')}
                      </ul>
                    ` : ''}

                    ${generateOptionsHTML(existingReservation.options, existingReservation.repas, existingReservation.salles)}

                    <p style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; font-size: 13px; color: #166534; margin: 25px 0;">
                      📎 <strong>Pièces jointes obligatoires :</strong> Vous trouverez en pièces jointes les <strong>CGV (PDF)</strong>, l'<strong>Inventaire</strong> et l'<strong>État des lieux</strong> du gîte. Le présent contrat est complété par l'état des lieux et l'inventaire en annexe. Il appartient aux occupants d'en vérifier l'exactitude dès leur arrivée. Tout écart doit impérativement nous être signalé dans les premières heures de l'entrée dans les lieux.
                    </p>
                    <p style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 8px; font-size: 13px; color: #1e3a8a; margin: 25px 0;">
                      📝 <strong>Émargement à l'arrivée :</strong> Afin de valider la remise des clés, l'état des lieux et l'inventaire devront être émargés en ligne le jour de votre arrivée à partir de 17h00 (via un lien reçu par e-mail ou en scannant le QR code de l'intervenant sur place).
                    </p>
                    ${getRulesVignettesHTML()}

                    ${(!isLastMinuteStay && montantSolde > 0) ? `
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px; margin: 20px 0; font-size: 13px; border-left: 4px solid #10b981;">
                      <p style="margin-top: 0; font-weight: bold; color: #10b981; font-size: 14px;">🙋‍♂️ Souhaitez-vous régler le solde à votre arrivée ?</p>
                      <p style="margin-bottom: 15px; color: #475569;">Si vous préférez régler le solde restant (${montantSolde.toFixed(2)} €) directement le jour de votre arrivée sur les lieux (chèque, espèces), merci de nous l'indiquer d'un simple clic ci-dessous pour enregistrer votre choix et stopper les relances e-mail :</p>
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: center;">
                        <tr>
                          <td>
                            <a href="${BACKEND_URL}/api/payment/pay-on-arrival/${tokenModification}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">Je réglerai mon solde sur place à l'arrivée</a>
                          </td>
                        </tr>
                      </table>
                    </div>
                    ` : ''}

                    ${paymentLink ? `
                      <div style="background-color: #fff8e1; border: 1px solid #ffe082; padding: 25px; border-radius: 8px; text-align: center; margin: 30px 0;">
                        <p style="font-weight: bold; margin: 0 0 15px 0;">
                          ${isLastMinuteStay 
                            ? "Celle-ci étant effectuée moins de 10 jours avant la date d'arrivée, le règlement de la totalité du séjour est requis pour confirmer définitivement votre réservation :" 
                            : "Pour finaliser votre réservation, veuillez procéder au règlement de l'Acompte (30% Hébergement + 100% Repas) :"}
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center">
                              <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">
                                ${isLastMinuteStay 
                                  ? `Régler la totalité de ${montantTotal.toFixed(2)} €` 
                                  : `Payer l'acompte de ${montantAcompte.toFixed(2)} €`}
                              </a>
                            </td>
                          </tr>
                        </table>
                        ${!isLastMinuteStay ? `<p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">Le solde de ${montantSolde.toFixed(2)} € sera à régler une semaine avant votre arrivée.</p>` : ''}
                      </div>
                    ` : '<p>Votre réservation est confirmée. Le règlement se fera selon les modalités convenues.</p>'}
                    
                    ${modificationLinkHTML}
                    
                    <p style="margin-top: 30px;">À très bientôt !</p>
                    
                    ${adminSignatureHTML}
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.send(generateFeedbackHTML(
      "Réservation acceptée !",
      `Le client <strong>${reservation.client.nom}</strong> a été prévenu par e-mail avec un lien de paiement Stripe.`,
      true
    ));
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de l'acceptation");
  }
});

// Refuser une réservation
app.get('/api/reservations/:id/reject', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statut: 'REFUSEE',
        validePar: req.user?.email || 'Admin'
      },
      include: { client: true }
    });

    // Optionnel : Envoyer un mail de refus au client
    await sendMail({
      to: reservation.client.email,
      subject: "Information concernant votre demande de réservation - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #333333; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                    <p>Nous avons bien reçu votre demande de réservation pour la période du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
                    <p>Malheureusement, nous ne sommes pas en mesure d'y donner une suite favorable pour le moment (indisponibilité ou gîte déjà  complet).</p>
                    <p>Nous vous remercions de votre intérêt et espérons avoir le plaisir de vous accueillir une prochaine fois.</p>
                    <p style="margin-top: 30px;">Cordialement,<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #dc3545; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.send(generateFeedbackHTML(
      "Réservation refusée",
      `Le client <strong>${reservation.client.nom}</strong> a été informé par e-mail.`,
      false
    ));
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors du refus");
  }
});

const saveDevisHistory = async (reservationId, adminEmail = null) => {
  try {
    const res = await prisma.reservation.findUnique({
      where: { id: parseInt(reservationId) },
      include: { occupants: true }
    });
    if (!res) return;

    // Calculer le prochain numéro de version
    const lastHistory = await prisma.devisHistory.findFirst({
      where: { reservationId: res.id },
      orderBy: { version: 'desc' }
    });
    const nextVersion = lastHistory ? lastHistory.version + 1 : 1;

    // Calcul des occupants
    let totalAdultes = 0;
    let totalEnfants = 0;
    if (res.occupants && res.occupants.length > 0) {
      totalAdultes = res.occupants.filter(o => o.estAdulte).length;
      totalEnfants = res.occupants.filter(o => !o.estAdulte).length;
    } else if (res.chambresDetails) {
      Object.values(res.chambresDetails).forEach(ch => {
        totalAdultes += parseInt(ch.adultes || 0);
        totalEnfants += parseInt(ch.mineurs || ch.enfants || 0);
      });
    }

    // Calcul des repas
    let totalPtitDej = 0;
    let totalDiner = 0;
    if (res.repas) {
      Object.values(res.repas).forEach(r => {
        if (r.PETIT_DEJ) {
          totalPtitDej += (parseInt(r.PETIT_DEJ.ADULTE) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_12) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_5) || 0);
        }
        if (r.DINER) {
          totalDiner += (parseInt(r.DINER.ADULTE) || 0) + (parseInt(r.DINER.ENFANT_MOINS_12) || 0) + (parseInt(r.DINER.ENFANT_MOINS_5) || 0);
        }
      });
    }

    const detailsSnapshot = {
      dateDebut: res.dateDebut,
      dateFin: res.dateFin,
      chambres: res.chambres,
      chambresDetails: res.chambresDetails || {},
      options: res.options || {},
      repas: res.repas || {},
      salles: res.salles || {},
      prixTotal: res.prixTotal || 0,
      montantAcompte: res.montantAcompte || 0,
      statutPaiement: res.statutPaiement || 'EN_ATTENTE',
      codePromo: res.codePromo,
      // Propriétés formatées pour le frontend
      adultes: totalAdultes,
      enfants: totalEnfants,
      repasCount: totalPtitDej,
      dinersCount: totalDiner,
      optionsDetails: res.options || {},
      totalPrice: res.prixTotal || 0,
      acomptePrice: res.montantAcompte || 0,
      acomptePayed: res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE'
    };

    await prisma.devisHistory.create({
      data: {
        reservationId: res.id,
        numeroDevis: res.numeroDevis || 'DEVIS',
        version: nextVersion,
        dateDebut: res.dateDebut,
        dateFin: res.dateFin,
        codePromo: res.codePromo,
        chambres: res.chambres,
        chambresDetails: res.chambresDetails || {},
        options: res.options || {},
        repas: res.repas || {},
        salles: res.salles || {},
        prixTotal: res.prixTotal || 0,
        modifiePar: adminEmail,
        details: detailsSnapshot
      }
    });

    // Mettre à jour versionActuelle sur la réservation
    await prisma.reservation.update({
      where: { id: res.id },
      data: { versionActuelle: nextVersion }
    });
    console.log(`[DEVIS HISTORY] Version enregistrée pour le devis #${res.id} (N° ${res.numeroDevis}) par ${adminEmail || 'système'}`);
  } catch (err) {
    console.error("Erreur lors de la sauvegarde de l'historique du devis :", err);
  }
};

// ===== GESTION DES DEVIS (PROSPECTS) =====

// Créer un devis
app.post('/api/admin/devis', checkAuth, async (req, res) => {
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, chambresDetails, options, promoCode, structure, repas, salles } = req.body;

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    // 1. Trouver l'administrateur pour ses coordonnées
    const admin = await prisma.adminAccount.findUnique({
      where: { email: req.user.email }
    });

    // Fallback : si le nom admin est générique ("admin", vide, etc.), afficher "David Roujet"
    const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
    const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
    const resolvedAdminEmail = admin ? admin.email : 'david.roujet@mucomnisports.fr';
    const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';

    // 2. Calculer le montant
    const backendPrixTotal = await recalculerPrix(dateDebut, dateFin, chambres, chambresDetails, options, promoCode, repas, salles);
    
    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    let taxeSejourCalculee = 0;
    
    chambres.forEach(chId => {
      const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
      taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;
    
    const prixSejour = totalPrixBase;

    // 3. Générer le numéro de devis séquentiel (sécurisé contre les collisions)
    const existingDevis = await prisma.reservation.findMany({
      where: {
        numeroDevis: { startsWith: `D-${year}-` }
      },
      select: {
        numeroDevis: true
      }
    });

    let maxDevisSuffix = 0;
    existingDevis.forEach(d => {
      if (d.numeroDevis) {
        const parts = d.numeroDevis.split('-');
        if (parts.length === 3) {
          const suffixNum = parseInt(parts[2], 10);
          if (!isNaN(suffixNum) && suffixNum > maxDevisSuffix) {
            maxDevisSuffix = suffixNum;
          }
        }
      }
    });
    const numeroDevis = `D-${year}-${String(maxDevisSuffix + 1).padStart(3, '0')}`;

    const token = require('crypto').randomBytes(24).toString('hex');
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 48);

    // 4. Créer la réservation/devis en base
    const devis = await prisma.reservation.create({
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres,
        chambresDetails: chambresDetails || null,
        options: options || null,
        repas: req.body.repas || null,
        salles: req.body.salles || null,
        prixTotal: backendPrixTotal,
        codePromo: promoCode || null,
        statut: 'DEVIS_EN_ATTENTE',
        tokenDevis: token,
        expireLe: expiration,
        numeroDevis: numeroDevis,
        validePar: resolvedAdminEmail,
        structure: structure || null,
        client: {
          create: { 
            nom, 
            email, 
            telephone, 
            adressePostale: adressePostale || null 
          }
        },
        occupants: occupants && occupants.length > 0 ? {
          create: occupants.map(occ => {
            const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
            let occNom = occ.nom;
            let occPrenom = occ.prenom;
            if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
              occNom = "Mineur";
              occPrenom = "";
            }
            const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
            let nationalite = occ.nationalite;
            if (nationalite === true || nationalite === 'true') {
              nationalite = 'Française';
            } else if (nationalite === false || nationalite === 'false') {
              nationalite = 'Étrangère';
            } else if (!nationalite) {
              nationalite = 'Française';
            }
            return {
              nom: occNom || '',
              prenom: occPrenom || '',
              estAdulte,
              age,
              nationalite
            };
          })
        } : undefined
      },
      include: { client: true }
    });

    // Enregistrer dans l'historique
    await saveDevisHistory(devis.id, resolvedAdminEmail);

    const refClient = `C-${year}-${devis.clientId}`;

    // 5. Générer le PDF avec détails
    const pdfBuffer = await generateDevisPDF({
      numeroDevis,
      refClient,
      dateDebut,
      dateFin,
      expireLe: expiration,
      clientNom: nom,
      clientEmail: email,
      clientTel: telephone,
      clientAdresse: adressePostale,
      adminNom: resolvedAdminNom,
      adminEmail: resolvedAdminEmail,
      adminTel: resolvedAdminTel,
      chambres: chambres.map(id => CHAMBRES_NAMES[id] || `Chambre ${id}`),
      nuits,
      detailsLignes: (() => {
        const lignes = chambres.map(chId => {
          const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || 0);
          const occupantsCount = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupantsCount >= capacite ? 22 : 25;
          return {
            designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
            nbPersonnes: occupantsCount,
            tarifParPersonne: tarifPers,
            nuits: nuits,
            total: occupantsCount * tarifPers * nuits
          };
        });

        // Ajouter les salles
        if (salles) {
          let nuitsSalles = nuits;
          let datesSuffix = "";
          if (salles.dateDebut && salles.dateFin) {
            const startS = new Date(salles.dateDebut);
            const endS = new Date(salles.dateFin);
            nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
            const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            datesSuffix = ` (du ${strD} au ${strF})`;
          }
          const prixSalle = chambres.length > 0 ? 100 : 150;
          if (salles.salle15) {
            lignes.push({
              designation: `Location Salle 15 personnes${datesSuffix}`,
              nbPersonnes: 1,
              tarifParPersonne: prixSalle,
              nuits: nuitsSalles,
              total: prixSalle * nuitsSalles
            });
          }
          if (salles.salle12) {
            lignes.push({
              designation: `Location Salle 12 personnes${datesSuffix}`,
              nbPersonnes: 1,
              tarifParPersonne: prixSalle,
              nuits: nuitsSalles,
              total: prixSalle * nuitsSalles
            });
          }
        }

        // Ajouter les repas
        if (repas) {
          let totalPDJ = { adulte: 0, enfant12: 0, enfant5: 0 };
          let totalDEJ = { adulte: 0, enfant12: 0, enfant5: 0 };
          let totalDIN = { adulte: 0, enfant12: 0, enfant5: 0 };

          Object.values(repas).forEach(dayRepas => {
            if (dayRepas.PETIT_DEJ) {
              totalPDJ.adulte += parseInt(dayRepas.PETIT_DEJ.ADULTE || 0);
              totalPDJ.enfant12 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12 || 0);
              totalPDJ.enfant5 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5 || 0);
            }
            if (dayRepas.DEJEUNER) {
              totalDEJ.adulte += parseInt(dayRepas.DEJEUNER.ADULTE || 0);
              totalDEJ.enfant12 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12 || 0);
              totalDEJ.enfant5 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5 || 0);
            }
            if (dayRepas.DINER) {
              totalDIN.adulte += parseInt(dayRepas.DINER.ADULTE || 0);
              totalDIN.enfant12 += parseInt(dayRepas.DINER.ENFANT_MOINS_12 || 0);
              totalDIN.enfant5 += parseInt(dayRepas.DINER.ENFANT_MOINS_5 || 0);
            }
          });

          if (totalPDJ.adulte > 0) lignes.push({ designation: 'Petits-déjeuners (Adulte)', nbPersonnes: totalPDJ.adulte, tarifParPersonne: 6, nuits: 1, total: totalPDJ.adulte * 6 });
          if (totalPDJ.enfant12 > 0) lignes.push({ designation: 'Petits-déjeuners (Enfant -12 ans)', nbPersonnes: totalPDJ.enfant12, tarifParPersonne: 5, nuits: 1, total: totalPDJ.enfant12 * 5 });
          if (totalPDJ.enfant5 > 0) lignes.push({ designation: 'Petits-déjeuners (Enfant -5 ans)', nbPersonnes: totalPDJ.enfant5, tarifParPersonne: 4, nuits: 1, total: totalPDJ.enfant5 * 4 });

          if (totalDEJ.adulte > 0) lignes.push({ designation: 'Déjeuners (Adulte)', nbPersonnes: totalDEJ.adulte, tarifParPersonne: 11.5, nuits: 1, total: totalDEJ.adulte * 11.5 });
          if (totalDEJ.enfant12 > 0) lignes.push({ designation: 'Déjeuners (Enfant -12 ans)', nbPersonnes: totalDEJ.enfant12, tarifParPersonne: 9.5, nuits: 1, total: totalDEJ.enfant12 * 9.5 });
          if (totalDEJ.enfant5 > 0) lignes.push({ designation: 'Déjeuners (Enfant -5 ans)', nbPersonnes: totalDEJ.enfant5, tarifParPersonne: 8, nuits: 1, total: totalDEJ.enfant5 * 8 });

          if (totalDIN.adulte > 0) lignes.push({ designation: 'Dîners (Adulte)', nbPersonnes: totalDIN.adulte, tarifParPersonne: 14, nuits: 1, total: totalDIN.adulte * 14 });
          if (totalDIN.enfant12 > 0) lignes.push({ designation: 'Dîners (Enfant -12 ans)', nbPersonnes: totalDIN.enfant12, tarifParPersonne: 12, nuits: 1, total: totalDIN.enfant12 * 12 });
          if (totalDIN.enfant5 > 0) lignes.push({ designation: 'Dîners (Enfant -5 ans)', nbPersonnes: totalDIN.enfant5, tarifParPersonne: 10, nuits: 1, total: totalDIN.enfant5 * 10 });
        }

        return lignes;
      })(),
      taxeSejourDetails: {
        adultes: totalAdultes,
        taux: 0.044,
        nuits: nuits,
        base: tarifMoyen,
        total: taxeSejourCalculee
      },
      options: options ? Object.entries(options).filter(([k,v]) => v).map(([k,v]) => {
        let optPrix = 0;
        let optNom = '';
        let qte = 1;
        if (k === 'menage') {
          optNom = 'Ménage fin de séjour';
          optPrix = 50;
          qte = chambres.length;
        } else if (k === 'litsFaits') {
          optNom = 'Lits faits à  l\'arrivée';
          optPrix = 5;
          qte = (occupants && occupants.length) || 1;
        } else if (k === 'lingeFourni') {
          optNom = 'Linge de toilette fourni';
          optPrix = 5;
          qte = (occupants && occupants.length) || 1;
        }
        return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
      }) : [],
      prixTotal: backendPrixTotal,
      montantAcompte: Math.round((Math.max(0, backendPrixTotal - calculerTotalRepasServeur(repas)) * 0.3 + calculerTotalRepasServeur(repas)) * 100) / 100,
      promoMontant: 0,
      codePromo: promoCode
    });

    const validationLink = `${FRONTEND_URL}/devis/validate?token=${token}`;

    // 6. Envoyer le mail avec le PDF attaché
    await sendMail({
      to: email,
      subject: `Votre devis personnalisé ${numeroDevis} - Gîte de La Maladrerie`,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          name: `Devis_${numeroDevis}.pdf`
        }
      ],
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${nom},</h2>
                    <p>Suite à votre demande, nous avons le plaisir de vous transmettre notre proposition tarifaire pour votre séjour au gîte.</p>
                    <p>Veuillez trouver ci-joint votre devis détaillé au format PDF, incluant nos conditions générales de vente.</p>

                    <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin: 25px 0;">
                      <tr>
                        <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">N° de devis</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${numeroDevis}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Période</td>
                        <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold;">Montant Total</td>
                        <td style="font-size: 18px; font-weight: bold; color: #004B93;">${backendPrixTotal.toFixed(2)} €</td>
                      </tr>
                    </table>

                    <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; font-size: 14px; color: #856404; margin-bottom: 25px;">
                      ⚠️ <strong>Important :</strong> Ce devis et la disponibilité associée ne sont garantis que pendant <strong>48 heures</strong>. Passé ce délai, le créneau pourra être réservé par un autre client.
                    </div>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <a href="${validationLink}" style="background-color: #28a745; color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">Valider et Confirmer mon séjour</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin-top: 30px;">Pour confirmer, vous pouvez cliquer sur le bouton ci-dessus ou nous renvoyer le devis signé.</p>
                    <p>Cordialement,<br><strong>${resolvedAdminNom}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    // 7. Notifier l'administrateur
    const targetAdminEmail = await getAdminEmailsForPreference('notifNewDevis');
    await sendMail({
      to: targetAdminEmail,
      subject: `Nouveau devis émis : ${numeroDevis} - ${nom}`,
      html: `
        <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: center;">
          <table width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: left;" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background-color: #004B93; padding: 30px; text-align: center; border-bottom: 4px solid #FDB913;">
                <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">NOUVEAU DEVIS ÉMIS</h2>
                <p style="color: #e2e8f0; margin: 10px 0 0 0; font-size: 14px;">Une nouvelle proposition a été envoyée au client.</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-bottom: 25px; border-bottom: 1px solid #e2e8f0;">
                      <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Numéro de devis</p>
                      <p style="margin: 5px 0 0 0; color: #0f172a; font-size: 18px; font-weight: bold;">${numeroDevis}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 25px 0; border-bottom: 1px solid #e2e8f0;">
                      <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Informations Client</p>
                      <p style="margin: 5px 0 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${nom}</p>
                      <p style="margin: 2px 0 0 0; color: #3b82f6; font-size: 14px; text-decoration: none;">${email}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 25px 0; border-bottom: 1px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="50%" valign="top">
                            <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Période du séjour</p>
                            <p style="margin: 5px 0 0 0; color: #0f172a; font-size: 15px; font-weight: 500;">Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} <br>au ${new Date(dateFin).toLocaleDateString('fr-FR')}</p>
                          </td>
                          <td width="50%" valign="top">
                            <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Montant Total</p>
                            <p style="margin: 5px 0 0 0; color: #004B93; font-size: 20px; font-weight: 900;">${backendPrixTotal.toFixed(2)} €</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 25px 0; border-bottom: 1px solid #e2e8f0;">
                      <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Émis par</p>
                      <p style="margin: 5px 0 0 0; color: #0f172a; font-size: 15px; font-weight: 500;">${admin ? admin.nom : req.user.email}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top: 25px; text-align: center;">
                      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px;">
                        <p style="margin: 0; color: #dc2626; font-size: 14px; font-weight: bold;">⚠️ Ce devis expire le ${expiration.toLocaleString('fr-FR')}</p>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f1f5f9; padding: 20px; text-align: center;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px;">Cet email est généré automatiquement par l'application Gîte de la Maladrerie.</p>
              </td>
            </tr>
          </table>
        </div>
      `
    });

    res.json(devis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création du devis' });
  }
});

// Récupérer l'historique des versions d'un devis
app.get('/api/admin/devis/:id/history', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const history = await prisma.devisHistory.findMany({
      where: { reservationId: parseInt(id) },
      orderBy: { version: 'desc' }
    });
    const formattedHistory = history.map(h => ({
      ...h,
      modifierEmail: h.modifiePar,
      modifiedAt: h.dateCreation
    }));
    res.json(formattedHistory);
  } catch (error) {
    console.error("Erreur récupération historique devis:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de l'historique du devis." });
  }
});

// Restaurer une version de devis
app.post('/api/admin/devis/:id/history/:historyId/restore', checkAuth, async (req, res) => {
  const { id, historyId } = req.params;
  try {
    const historyEntry = await prisma.devisHistory.findUnique({
      where: { id: parseInt(historyId) }
    });
    if (!historyEntry || historyEntry.reservationId !== parseInt(id)) {
      return res.status(404).json({ error: "Version d'historique introuvable." });
    }
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 48);

    const reservationUpdated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: {
        dateDebut: historyEntry.dateDebut,
        dateFin: historyEntry.dateFin,
        chambres: historyEntry.chambres,
        chambresDetails: historyEntry.chambresDetails,
        options: historyEntry.options,
        repas: historyEntry.repas,
        salles: historyEntry.salles,
        prixTotal: historyEntry.prixTotal,
        codePromo: historyEntry.codePromo,
        statut: 'DEVIS_EN_ATTENTE',
        expireLe: expiration
      },
      include: { client: true }
    });
    await saveDevisHistory(reservationUpdated.id, req.user.email);
    res.json(reservationUpdated);
  } catch (error) {
    console.error("Erreur lors de la restauration du devis:", error);
    res.status(500).json({ error: "Erreur lors de la restauration du devis." });
  }
});

// Mettre à jour un devis existant (Admin)
app.put('/api/admin/devis/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, email, telephone, adressePostale, dateDebut, dateFin, chambres, chambresDetails, options, salles, repas, repasGlobal, prixTotal, prixHebergement, totalRepas, modeRestauration, sendEmail } = req.body;

  try {
    const devisExistant = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!devisExistant || (devisExistant.statut !== 'DEVIS_EN_ATTENTE' && devisExistant.statut !== 'DEVIS_EXPIRE')) {
      return res.status(400).json({ error: "Devis introuvable ou déjà validé." });
    }

    await prisma.client.update({
      where: { id: devisExistant.clientId },
      data: { nom, email, telephone, adressePostale }
    });
    
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 48);
    
    const devisUpdate = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres: chambres || [],
        chambresDetails: chambresDetails || {},
        options: options || {},
        salles: salles || {},
        repas: repas || {},
        prixTotal: prixTotal || 0,
        statut: 'DEVIS_EN_ATTENTE',
        expireLe: expiration
      },
      include: { client: true }
    });

    await saveDevisHistory(devisUpdate.id, req.user.email);

    if (sendEmail !== false) {
      try {
        const { generateDevisPDF } = require('./utils/generateDevisPDF');
        const devisFinal = await prisma.reservation.findUnique({
          where: { id: parseInt(id) },
          include: { client: true, occupants: true }
        });
        
        const start = new Date(devisFinal.dateDebut);
        const end = new Date(devisFinal.dateFin);
        const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const year = new Date(devisFinal.createdAt).getFullYear();
        const refClient = `C-${year}-${devisFinal.clientId}`;
        
        const adminEmail = devisFinal.validePar || req.user.email;
        const admin = await prisma.adminAccount.findUnique({ where: { email: adminEmail } });
        const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
        const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
        const resolvedAdminEmail = admin ? admin.email : adminEmail;
        const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';
        
        let totalAdultes = 0;
        let totalMineurs = 0;
        let totalPrixBase = 0;
        let taxeSejourCalculee = 0;
        
        const chDetails = devisFinal.chambresDetails || {};
        devisFinal.chambres.forEach(chId => {
          const details = chDetails[chId] || { adultes: 0, enfants: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || 0);
          const occupantsCount = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupantsCount >= capacite ? 22 : 25;
          
          totalAdultes += nbAdultes;
          totalMineurs += nbMineurs;
          totalPrixBase += occupantsCount * tarifPers * nuits;
          taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
        });

        const totalPersonnes = totalAdultes + totalMineurs;
        const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;

        const detailsLignes = devisFinal.chambres.map(chId => {
          const details = chDetails[chId] || { adultes: 0, enfants: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || 0);
          const occupantsCount = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupantsCount >= capacite ? 22 : 25;
          return {
            designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
            nbPersonnes: occupantsCount,
            tarifParPersonne: tarifPers,
            nuits: nuits,
            total: occupantsCount * tarifPers * nuits
          };
        });

        if (devisFinal.salles) {
          let nuitsSalles = nuits;
          let datesSuffix = "";
          if (devisFinal.salles.dateDebut && devisFinal.salles.dateFin) {
            const startS = new Date(devisFinal.salles.dateDebut);
            const endS = new Date(devisFinal.salles.dateFin);
            nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
            const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            datesSuffix = ` (du ${strD} au ${strF})`;
          }
          const prixSalle = devisFinal.chambres.length > 0 ? 100 : 150;
          if (devisFinal.salles.salle15) detailsLignes.push({ designation: `Location Salle 15 personnes${datesSuffix}`, nbPersonnes: 1, tarifParPersonne: prixSalle, nuits: nuitsSalles, total: prixSalle * nuitsSalles });
          if (devisFinal.salles.salle12) detailsLignes.push({ designation: `Location Salle 12 personnes${datesSuffix}`, nbPersonnes: 1, tarifParPersonne: prixSalle, nuits: nuitsSalles, total: prixSalle * nuitsSalles });
        }

        if (devisFinal.repas) {
          let totalPDJ = { adulte: 0, enfant12: 0, enfant5: 0 };
          let totalDEJ = { adulte: 0, enfant12: 0, enfant5: 0 };
          let totalDIN = { adulte: 0, enfant12: 0, enfant5: 0 };

          Object.values(devisFinal.repas).forEach(dayRepas => {
            if (dayRepas.PETIT_DEJ) { totalPDJ.adulte += parseInt(dayRepas.PETIT_DEJ.ADULTE||0); totalPDJ.enfant12 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12||0); totalPDJ.enfant5 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5||0); }
            if (dayRepas.DEJEUNER) { totalDEJ.adulte += parseInt(dayRepas.DEJEUNER.ADULTE||0); totalDEJ.enfant12 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12||0); totalDEJ.enfant5 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5||0); }
            if (dayRepas.DINER) { totalDIN.adulte += parseInt(dayRepas.DINER.ADULTE||0); totalDIN.enfant12 += parseInt(dayRepas.DINER.ENFANT_MOINS_12||0); totalDIN.enfant5 += parseInt(dayRepas.DINER.ENFANT_MOINS_5||0); }
          });
          if (totalPDJ.adulte > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Adulte)', nbPersonnes: totalPDJ.adulte, tarifParPersonne: 6, nuits: 1, total: totalPDJ.adulte * 6 });
          if (totalPDJ.enfant12 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -12 ans)', nbPersonnes: totalPDJ.enfant12, tarifParPersonne: 5, nuits: 1, total: totalPDJ.enfant12 * 5 });
          if (totalPDJ.enfant5 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -5 ans)', nbPersonnes: totalPDJ.enfant5, tarifParPersonne: 4, nuits: 1, total: totalPDJ.enfant5 * 4 });
          if (totalDEJ.adulte > 0) detailsLignes.push({ designation: 'Déjeuners (Adulte)', nbPersonnes: totalDEJ.adulte, tarifParPersonne: 11.5, nuits: 1, total: totalDEJ.adulte * 11.5 });
          if (totalDEJ.enfant12 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -12 ans)', nbPersonnes: totalDEJ.enfant12, tarifParPersonne: 9.5, nuits: 1, total: totalDEJ.enfant12 * 9.5 });
          if (totalDEJ.enfant5 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -5 ans)', nbPersonnes: totalDEJ.enfant5, tarifParPersonne: 8, nuits: 1, total: totalDEJ.enfant5 * 8 });
          if (totalDIN.adulte > 0) detailsLignes.push({ designation: 'Dîners (Adulte)', nbPersonnes: totalDIN.adulte, tarifParPersonne: 14, nuits: 1, total: totalDIN.adulte * 14 });
          if (totalDIN.enfant12 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -12 ans)', nbPersonnes: totalDIN.enfant12, tarifParPersonne: 12, nuits: 1, total: totalDIN.enfant12 * 12 });
          if (totalDIN.enfant5 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -5 ans)', nbPersonnes: totalDIN.enfant5, tarifParPersonne: 10, nuits: 1, total: totalDIN.enfant5 * 10 });
        }

        const devisOptions = devisFinal.options ? Object.entries(devisFinal.options).filter(([k,v]) => v).map(([k,v]) => {
          let optPrix = 0, optNom = '', qte = 1;
          if (k === 'menage') { optNom = 'Ménage fin de séjour'; optPrix = 50; qte = devisFinal.chambres.length; }
          else if (k === 'litsFaits') { optNom = 'Lits faits à l\'arrivée'; optPrix = 5; qte = devisFinal.occupants?.length || 1; }
          else if (k === 'lingeFourni') { optNom = 'Linge de toilette fourni'; optPrix = 5; qte = devisFinal.occupants?.length || 1; }
          return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
        }) : [];

        const pdfBuffer = await generateDevisPDF({
          numeroDevis: devisFinal.numeroDevis,
          refClient,
          dateDebut: devisFinal.dateDebut,
          dateFin: devisFinal.dateFin,
          expireLe: devisFinal.expireLe,
          clientNom: devisFinal.client.nom,
          clientEmail: devisFinal.client.email,
          clientTel: devisFinal.client.telephone,
          clientAdresse: devisFinal.client.adressePostale,
          adminNom: resolvedAdminNom,
          adminEmail: resolvedAdminEmail,
          adminTel: resolvedAdminTel,
          chambres: devisFinal.chambres.map(cid => CHAMBRES_NAMES[cid] || `Chambre ${cid}`),
          nuits,
          detailsLignes,
          taxeSejourDetails: { adultes: totalAdultes, taux: 0.044, nuits, base: tarifMoyen, total: taxeSejourCalculee },
          options: devisOptions,
          prixTotal: devisFinal.prixTotal,
          montantAcompte: Math.round((Math.max(0, devisFinal.prixTotal - calculerTotalRepasServeur(devisFinal.repas)) * 0.3 + calculerTotalRepasServeur(devisFinal.repas)) * 100) / 100,
          promoMontant: 0,
          codePromo: devisFinal.codePromo
        });
        
        const validationLink = `${FRONTEND_URL}/devis/validate?token=${devisFinal.tokenDevis}`;
        
        await sendMail({
          to: devisFinal.client.email,
          subject: `Mise à jour de votre devis ${devisFinal.numeroDevis} - Gîte de La Maladrerie`,
          attachments: [
            {
              content: pdfBuffer.toString('base64'),
              name: `Devis_${devisFinal.numeroDevis}.pdf`
            }
          ],
          html: `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                    <tr>
                      <td style="background-color: #004B93; padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px; color: #333333; line-height: 1.6;">
                        <h2 style="color: #004B93; margin-top: 0;">Bonjour ${devisFinal.client.nom},</h2>
                        <p>Suite à votre demande de modification, nous avons mis à jour votre devis pour votre séjour au gîte.</p>
                        <p>Veuillez trouver ci-joint votre devis actualisé au format PDF, incluant nos conditions générales de vente.</p>

                        <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin: 25px 0;">
                          <tr>
                            <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">N° de devis</td>
                            <td style="border-bottom: 1px solid #eeeeee;">${devisFinal.numeroDevis}</td>
                          </tr>
                          <tr>
                            <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Période</td>
                            <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(devisFinal.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(devisFinal.dateFin).toLocaleDateString('fr-FR')}</td>
                          </tr>
                          <tr>
                            <td style="font-weight: bold;">Nouveau Montant</td>
                            <td style="font-size: 18px; font-weight: bold; color: #004B93;">${devisFinal.prixTotal.toFixed(2)} €</td>
                          </tr>
                        </table>

                        <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; font-size: 14px; color: #856404; margin-bottom: 25px;">
                          ⚠️ <strong>Important :</strong> Ce devis annule et remplace le précédent. La disponibilité n'est garantie que jusqu'au <strong>${new Date(devisFinal.expireLe).toLocaleDateString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</strong>.
                        </div>

                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center">
                              <a href="${validationLink}" style="background-color: #28a745; color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">Valider et Confirmer mon séjour</a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin-top: 30px;">Pour confirmer, vous pouvez cliquer sur le bouton ci-dessus ou nous renvoyer le devis signé.</p>
                        <p>Cordialement,<br><strong>${resolvedAdminNom}</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          `
        });
      } catch(err) {
        console.error("Erreur envoi email devis update:", err);
      }
    }

    res.json(devisUpdate);
  } catch (error) {
    console.error("Erreur màj devis:", error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du devis' });
  }
});

// Prolonger la validité d'un devis
app.post('/api/admin/devis/:id/prolong', checkAuth, async (req, res) => {
  const { id } = req.params;
  const hours = parseInt(req.body.hours) || 48;

  try {
    const devis = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!devis || (devis.statut !== 'DEVIS_EN_ATTENTE' && devis.statut !== 'DEVIS_EXPIRE')) {
      return res.status(400).json({ error: "Devis introuvable, déjà validé ou impossible à prolonger." });
    }

    const expiration = new Date();
    expiration.setHours(expiration.getHours() + hours);

    const devisUpdated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: {
        statut: 'DEVIS_EN_ATTENTE',
        expireLe: expiration
      },
      include: { client: true }
    });

    await saveDevisHistory(devisUpdated.id, req.user.email);

    res.json(devisUpdated);
  } catch (error) {
    console.error("Erreur prolongation devis:", error);
    res.status(500).json({ error: 'Erreur lors de la prolongation du devis.' });
  }
});

app.get('/api/admin/devis/:id/pdf', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const devis = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!devis) {
      return res.status(404).json({ error: "Devis introuvable" });
    }

    const { generateDevisPDF } = require('./utils/generateDevisPDF');

    const start = new Date(devis.dateDebut);
    const end = new Date(devis.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const year = new Date(devis.createdAt).getFullYear();
    const refClient = `C-${year}-${devis.clientId}`;

    // Trouver l'administrateur
    const adminEmail = devis.validePar || req.user.email;
    const admin = await prisma.adminAccount.findUnique({
      where: { email: adminEmail }
    });
    const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
    const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
    const resolvedAdminEmail = admin ? admin.email : adminEmail;
    const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';

    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    let taxeSejourCalculee = 0;
    
    const chambresDetails = devis.chambresDetails || {};
    devis.chambres.forEach(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
      taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;

    const detailsLignes = devis.chambres.map(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      return {
        designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
        nbPersonnes: occupantsCount,
        tarifParPersonne: tarifPers,
        nuits: nuits,
        total: occupantsCount * tarifPers * nuits
      };
    });

    // Salles
    if (devis.salles) {
      let nuitsSalles = nuits;
      let datesSuffix = "";
      if (devis.salles.dateDebut && devis.salles.dateFin) {
        const startS = new Date(devis.salles.dateDebut);
        const endS = new Date(devis.salles.dateFin);
        nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
        const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        datesSuffix = ` (du ${strD} au ${strF})`;
      }
      const prixSalle = devis.chambres.length > 0 ? 100 : 150;
      if (devis.salles.salle15) {
        detailsLignes.push({
          designation: `Location Salle 15 personnes${datesSuffix}`,
          nbPersonnes: 1,
          tarifParPersonne: prixSalle,
          nuits: nuitsSalles,
          total: prixSalle * nuitsSalles
        });
      }
      if (devis.salles.salle12) {
        detailsLignes.push({
          designation: `Location Salle 12 personnes${datesSuffix}`,
          nbPersonnes: 1,
          tarifParPersonne: prixSalle,
          nuits: nuitsSalles,
          total: prixSalle * nuitsSalles
        });
      }
    }

    // Repas
    if (devis.repas) {
      let totalPDJ = { adulte: 0, enfant12: 0, enfant5: 0 };
      let totalDEJ = { adulte: 0, enfant12: 0, enfant5: 0 };
      let totalDIN = { adulte: 0, enfant12: 0, enfant5: 0 };

      Object.values(devis.repas).forEach(dayRepas => {
        if (dayRepas.PETIT_DEJ) {
          totalPDJ.adulte += parseInt(dayRepas.PETIT_DEJ.ADULTE || 0);
          totalPDJ.enfant12 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12 || 0);
          totalPDJ.enfant5 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5 || 0);
        }
        if (dayRepas.DEJEUNER) {
          totalDEJ.adulte += parseInt(dayRepas.DEJEUNER.ADULTE || 0);
          totalDEJ.enfant12 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12 || 0);
          totalDEJ.enfant5 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5 || 0);
        }
        if (dayRepas.DINER) {
          totalDIN.adulte += parseInt(dayRepas.DINER.ADULTE || 0);
          totalDIN.enfant12 += parseInt(dayRepas.DINER.ENFANT_MOINS_12 || 0);
          totalDIN.enfant5 += parseInt(dayRepas.DINER.ENFANT_MOINS_5 || 0);
        }
      });

      if (totalPDJ.adulte > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Adulte)', nbPersonnes: totalPDJ.adulte, tarifParPersonne: 6, nuits: 1, total: totalPDJ.adulte * 6 });
      if (totalPDJ.enfant12 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -12 ans)', nbPersonnes: totalPDJ.enfant12, tarifParPersonne: 5, nuits: 1, total: totalPDJ.enfant12 * 5 });
      if (totalPDJ.enfant5 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -5 ans)', nbPersonnes: totalPDJ.enfant5, tarifParPersonne: 4, nuits: 1, total: totalPDJ.enfant5 * 4 });

      if (totalDEJ.adulte > 0) detailsLignes.push({ designation: 'Déjeuners (Adulte)', nbPersonnes: totalDEJ.adulte, tarifParPersonne: 11.5, nuits: 1, total: totalDEJ.adulte * 11.5 });
      if (totalDEJ.enfant12 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -12 ans)', nbPersonnes: totalDEJ.enfant12, tarifParPersonne: 9.5, nuits: 1, total: totalDEJ.enfant12 * 9.5 });
      if (totalDEJ.enfant5 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -5 ans)', nbPersonnes: totalDEJ.enfant5, tarifParPersonne: 8, nuits: 1, total: totalDEJ.enfant5 * 8 });

      if (totalDIN.adulte > 0) detailsLignes.push({ designation: 'Dîners (Adulte)', nbPersonnes: totalDIN.adulte, tarifParPersonne: 14, nuits: 1, total: totalDIN.adulte * 14 });
      if (totalDIN.enfant12 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -12 ans)', nbPersonnes: totalDIN.enfant12, tarifParPersonne: 12, nuits: 1, total: totalDIN.enfant12 * 12 });
      if (totalDIN.enfant5 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -5 ans)', nbPersonnes: totalDIN.enfant5, tarifParPersonne: 10, nuits: 1, total: totalDIN.enfant5 * 10 });
    }

    // Options
    const detailsOptions = devis.options ? Object.entries(devis.options).filter(([k,v]) => v).map(([k,v]) => {
      let optPrix = 0;
      let optNom = '';
      let qte = 1;
      if (k === 'menage') {
        optNom = 'Ménage fin de séjour';
        optPrix = 50;
        qte = devis.chambres.length;
      } else if (k === 'litsFaits') {
        optNom = 'Lits faits à l\'arrivée';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      } else if (k === 'lingeFourni') {
        optNom = 'Linge de toilette fourni';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      }
      return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
    }) : [];

    const taxeSejourDetails = {
      adultes: totalAdultes,
      taux: 0.044,
      nuits: nuits,
      base: tarifMoyen,
      total: taxeSejourCalculee
    };

    let promoMontant = 0;
    if (devis.codePromo) {
      const promo = await prisma.promoCode.findUnique({ where: { code: devis.codePromo.toUpperCase() } });
      if (promo && promo.actif) {
        if (promo.type === 'pourcentage') {
          const ratio = 1 - (promo.valeur / 100);
          if (ratio > 0) {
            const prixSansPromo = devis.prixTotal / ratio;
            promoMontant = prixSansPromo - devis.prixTotal;
          }
        } else {
          promoMontant = promo.valeur;
        }
      }
    }

    const pdfData = {
      numeroDevis: devis.numeroDevis,
      refClient,
      dateDebut: devis.dateDebut,
      dateFin: devis.dateFin,
      expireLe: devis.expireLe,
      clientNom: devis.client.nom,
      clientEmail: devis.client.email,
      clientTel: devis.client.telephone,
      clientAdresse: devis.client.adressePostale,
      adminNom: resolvedAdminNom,
      adminEmail: resolvedAdminEmail,
      adminTel: resolvedAdminTel,
      chambres: devis.chambres.map(id => CHAMBRES_NAMES[id] || `Chambre ${id}`),
      nuits,
      detailsLignes,
      options: detailsOptions,
      taxeSejourDetails,
      prixTotal: devis.prixTotal,
      montantAcompte: devis.montantAcompte || (Math.round((Math.max(0, devis.prixTotal - calculerTotalRepasServeur(devis.repas)) * 0.3 + calculerTotalRepasServeur(devis.repas)) * 100) / 100),
      promoMontant,
      codePromo: devis.codePromo,
      devisSignature: devis.devisSignature,
      valideLe: devis.valideLe
    };

    const pdfBuffer = await generateDevisPDF(pdfData);
    
    const safeNomClient = devis.client.nom.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const pdfFileName = `Devis_${devis.numeroDevis}_${safeNomClient}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur téléchargement PDF devis:", error);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

// Renvoyer le devis par e-mail (Admin)
app.post('/api/admin/devis/:id/send', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const devis = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!devis) {
      return res.status(404).json({ error: "Devis introuvable" });
    }

    const { generateDevisPDF } = require('./utils/generateDevisPDF');

    const start = new Date(devis.dateDebut);
    const end = new Date(devis.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const year = new Date(devis.createdAt).getFullYear();
    const refClient = `C-${year}-${devis.clientId}`;

    const adminEmail = devis.validePar || req.user.email;
    const admin = await prisma.adminAccount.findUnique({
      where: { email: adminEmail }
    });
    const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
    const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
    const resolvedAdminEmail = admin ? admin.email : adminEmail;
    const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';

    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    let taxeSejourCalculee = 0;
    
    const chambresDetails = devis.chambresDetails || {};
    devis.chambres.forEach(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
      taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;

    const detailsLignes = devis.chambres.map(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      return {
        designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
        nbPersonnes: occupantsCount,
        tarifParPersonne: tarifPers,
        nuits: nuits,
        total: occupantsCount * tarifPers * nuits
      };
    });

    if (devis.salles) {
      let nuitsSalles = nuits;
      let datesSuffix = "";
      if (devis.salles.dateDebut && devis.salles.dateFin) {
        const startS = new Date(devis.salles.dateDebut);
        const endS = new Date(devis.salles.dateFin);
        nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
        const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        datesSuffix = ` (du ${strD} au ${strF})`;
      }
      const prixSalle = devis.chambres.length > 0 ? 100 : 150;
      if (devis.salles.salle15) {
        detailsLignes.push({ designation: `Location Salle 15 personnes${datesSuffix}`, nbPersonnes: 1, tarifParPersonne: prixSalle, nuits: nuitsSalles, total: prixSalle * nuitsSalles });
      }
      if (devis.salles.salle12) {
        detailsLignes.push({ designation: `Location Salle 12 personnes${datesSuffix}`, nbPersonnes: 1, tarifParPersonne: prixSalle, nuits: nuitsSalles, total: prixSalle * nuitsSalles });
      }
    }

    if (devis.repas) {
      const categories = {
        petitDejeuner: "Petits-déjeuners",
        dejeuner: "Déjeuners",
        diner: "Dîners",
        gouter: "Goûters"
      };
      Object.entries(devis.repas).forEach(([key, val]) => {
        if (val && typeof val === 'object') {
          Object.entries(val).forEach(([day, count]) => {
            const parsedCount = parseInt(count || 0);
            if (parsedCount > 0) {
              const dayLabel = new Date(day).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
              const price = TARIF_REPAS[key] || 0;
              detailsLignes.push({
                designation: `Repas : ${categories[key] || key} du ${dayLabel}`,
                nbPersonnes: parsedCount,
                tarifParPersonne: price,
                nuits: 1,
                total: parsedCount * price
              });
            }
          });
        }
      });
    }

    const optionsLignes = devis.options ? Object.entries(devis.options).filter(([k, v]) => v).map(([k, v]) => {
      let optNom = k;
      let optPrix = 0;
      let qte = 1;
      if (k === 'menage') {
        optNom = 'Forfait ménage de fin de séjour';
        optPrix = 130;
      } else if (k === 'drapSimple') {
        optNom = 'Forfait paire de draps simples';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      } else if (k === 'drapDouble') {
        optNom = 'Forfait paire de draps doubles';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      } else if (k === 'lingeFourni') {
        optNom = 'Linge de toilette fourni';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      }
      return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
    }) : [];

    const taxeSejourDetails = {
      adultes: totalAdultes,
      taux: 0.044,
      nuits: nuits,
      base: tarifMoyen,
      total: taxeSejourCalculee
    };

    let promoMontant = 0;
    if (devis.codePromo) {
      const promo = await prisma.promoCode.findUnique({ where: { code: devis.codePromo.toUpperCase() } });
      if (promo && promo.actif) {
        if (promo.type === 'pourcentage') {
          const ratio = 1 - (promo.valeur / 100);
          if (ratio > 0) {
            const prixSansPromo = devis.prixTotal / ratio;
            promoMontant = prixSansPromo - devis.prixTotal;
          }
        } else {
          promoMontant = promo.valeur;
        }
      }
    }

    const pdfData = {
      numeroDevis: devis.numeroDevis,
      refClient,
      dateDebut: devis.dateDebut,
      dateFin: devis.dateFin,
      expireLe: devis.expireLe,
      clientNom: devis.client.nom,
      clientEmail: devis.client.email,
      clientTel: devis.client.telephone || '',
      clientAdresse: devis.client.adressePostale || '',
      adminNom: resolvedAdminNom,
      adminEmail: resolvedAdminEmail,
      adminTel: resolvedAdminTel,
      chambres: devis.chambres.map(id => CHAMBRES_NAMES[id] || `Chambre ${id}`),
      nuits,
      detailsLignes,
      options: optionsLignes,
      taxeSejourDetails,
      recalculerTaxeSejour: false,
      prixTotal: devis.prixTotal,
      montantAcompte: devis.montantAcompte || (Math.round((Math.max(0, devis.prixTotal - calculerTotalRepasServeur(devis.repas)) * 0.3 + calculerTotalRepasServeur(devis.repas)) * 100) / 100),
      promoCode: devis.codePromo || null,
      promoMontant
    };

    const pdfBuffer = await generateDevisPDF(pdfData);
    const token = devis.tokenDevis || devis.tokenModification || require('crypto').randomBytes(24).toString('hex');
    
    // S'assurer qu'un token existe
    if (!devis.tokenDevis) {
      await prisma.reservation.update({
        where: { id: devis.id },
        data: { tokenDevis: token }
      });
    }

    const validationLink = `${process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173')}/devis/validate?token=${token}`;

    await sendMail({
      to: devis.client.email,
      subject: `Votre devis personnalisé ${devis.numeroDevis} - Gîte de La Maladrerie`,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          name: `Devis_${devis.numeroDevis}.pdf`
        }
      ],
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${devis.client.nom},</h2>
                    <p>Suite à votre demande, nous avons le plaisir de vous transmettre notre proposition tarifaire pour votre séjour au gîte.</p>
                    <p>Veuillez trouver ci-joint votre devis détaillé au format PDF, incluant nos conditions générales de vente.</p>

                    <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin: 25px 0;">
                      <tr>
                        <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">N° de devis</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${devis.numeroDevis}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Période</td>
                        <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(devis.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(devis.dateFin).toLocaleDateString('fr-FR')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold;">Montant Total</td>
                        <td style="font-size: 18px; font-weight: bold; color: #004B93;">${devis.prixTotal.toFixed(2)} €</td>
                      </tr>
                    </table>

                    <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; font-size: 14px; color: #856404; margin-bottom: 25px;">
                      ⚠️ <strong>Important :</strong> Ce devis et la disponibilité associée ne sont garantis que pendant <strong>48 heures</strong>. Passé ce délai, le créneau pourra être réservé par un autre client.
                    </div>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <a href="${validationLink}" style="background-color: #28a745; color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block; box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2);">Valider et Confirmer mon séjour</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin-top: 30px;">Pour confirmer votre réservation, vous pouvez cliquer sur le bouton ci-dessus pour procéder au règlement sécurisé de l'acompte (30%), ou nous retourner le devis signé par e-mail.</p>
                    
                    <p>À très bientôt !</p>
                    <p>L'équipe du Gîte de la Maladrerie - MUC Omnisports</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.json({ success: true, message: "Devis renvoyé avec succès" });
  } catch (error) {
    console.error("Erreur renvoi devis:", error);
    res.status(500).json({ error: 'Erreur lors du renvoi du devis par e-mail' });
  }
});

// Télécharger le PDF d'un devis par son token (Client - Public)
app.get('/api/devis/pdf/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const devis = await prisma.reservation.findUnique({
      where: { tokenDevis: token },
      include: { client: true, occupants: true }
    });

    if (!devis) {
      return res.status(404).json({ error: "Devis introuvable" });
    }

    const { generateDevisPDF } = require('./utils/generateDevisPDF');

    const start = new Date(devis.dateDebut);
    const end = new Date(devis.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const year = new Date(devis.createdAt).getFullYear();
    const refClient = `C-${year}-${devis.clientId}`;

    // Trouver l'administrateur
    const adminEmail = devis.validePar || 'david.roujet@mucomnisports.fr';
    const admin = await prisma.adminAccount.findUnique({
      where: { email: adminEmail }
    });
    const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
    const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
    const resolvedAdminEmail = admin ? admin.email : adminEmail;
    const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';

    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    let taxeSejourCalculee = 0;
    
    const chambresDetails = devis.chambresDetails || {};
    devis.chambres.forEach(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
      taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;

    const detailsLignes = devis.chambres.map(chId => {
      const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      return {
        designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
        nbPersonnes: occupantsCount,
        tarifParPersonne: tarifPers,
        nuits: nuits,
        total: occupantsCount * tarifPers * nuits
      };
    });

    // Salles
    if (devis.salles) {
      let nuitsSalles = nuits;
      let datesSuffix = "";
      if (devis.salles.dateDebut && devis.salles.dateFin) {
        const startS = new Date(devis.salles.dateDebut);
        const endS = new Date(devis.salles.dateFin);
        nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
        const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        datesSuffix = ` (du ${strD} au ${strF})`;
      }
      const prixSalle = devis.chambres.length > 0 ? 100 : 150;
      if (devis.salles.salle15) {
        detailsLignes.push({
          designation: `Location Salle 15 personnes${datesSuffix}`,
          nbPersonnes: 1,
          tarifParPersonne: prixSalle,
          nuits: nuitsSalles,
          total: prixSalle * nuitsSalles
        });
      }
      if (devis.salles.salle12) {
        detailsLignes.push({
          designation: `Location Salle 12 personnes${datesSuffix}`,
          nbPersonnes: 1,
          tarifParPersonne: prixSalle,
          nuits: nuitsSalles,
          total: prixSalle * nuitsSalles
        });
      }
    }

    // Repas
    if (devis.repas) {
      let totalPDJ = { adulte: 0, enfant12: 0, enfant5: 0 };
      let totalDEJ = { adulte: 0, enfant12: 0, enfant5: 0 };
      let totalDIN = { adulte: 0, enfant12: 0, enfant5: 0 };

      Object.values(devis.repas).forEach(dayRepas => {
        if (dayRepas.PETIT_DEJ) {
          totalPDJ.adulte += parseInt(dayRepas.PETIT_DEJ.ADULTE || 0);
          totalPDJ.enfant12 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12 || 0);
          totalPDJ.enfant5 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5 || 0);
        }
        if (dayRepas.DEJEUNER) {
          totalDEJ.adulte += parseInt(dayRepas.DEJEUNER.ADULTE || 0);
          totalDEJ.enfant12 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12 || 0);
          totalDEJ.enfant5 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5 || 0);
        }
        if (dayRepas.DINER) {
          totalDIN.adulte += parseInt(dayRepas.DINER.ADULTE || 0);
          totalDIN.enfant12 += parseInt(dayRepas.DINER.ENFANT_MOINS_12 || 0);
          totalDIN.enfant5 += parseInt(dayRepas.DINER.ENFANT_MOINS_5 || 0);
        }
      });

      if (totalPDJ.adulte > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Adulte)', nbPersonnes: totalPDJ.adulte, tarifParPersonne: 6, nuits: 1, total: totalPDJ.adulte * 6 });
      if (totalPDJ.enfant12 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -12 ans)', nbPersonnes: totalPDJ.enfant12, tarifParPersonne: 5, nuits: 1, total: totalPDJ.enfant12 * 5 });
      if (totalPDJ.enfant5 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -5 ans)', nbPersonnes: totalPDJ.enfant5, tarifParPersonne: 4, nuits: 1, total: totalPDJ.enfant5 * 4 });

      if (totalDEJ.adulte > 0) detailsLignes.push({ designation: 'Déjeuners (Adulte)', nbPersonnes: totalDEJ.adulte, tarifParPersonne: 11.5, nuits: 1, total: totalDEJ.adulte * 11.5 });
      if (totalDEJ.enfant12 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -12 ans)', nbPersonnes: totalDEJ.enfant12, tarifParPersonne: 9.5, nuits: 1, total: totalDEJ.enfant12 * 9.5 });
      if (totalDEJ.enfant5 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -5 ans)', nbPersonnes: totalDEJ.enfant5, tarifParPersonne: 8, nuits: 1, total: totalDEJ.enfant5 * 8 });

      if (totalDIN.adulte > 0) detailsLignes.push({ designation: 'Dîners (Adulte)', nbPersonnes: totalDIN.adulte, tarifParPersonne: 14, nuits: 1, total: totalDIN.adulte * 14 });
      if (totalDIN.enfant12 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -12 ans)', nbPersonnes: totalDIN.enfant12, tarifParPersonne: 12, nuits: 1, total: totalDIN.enfant12 * 12 });
      if (totalDIN.enfant5 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -5 ans)', nbPersonnes: totalDIN.enfant5, tarifParPersonne: 10, nuits: 1, total: totalDIN.enfant5 * 10 });
    }

    // Options
    const detailsOptions = devis.options ? Object.entries(devis.options).filter(([k,v]) => v).map(([k,v]) => {
      let optPrix = 0;
      let optNom = '';
      let qte = 1;
      if (k === 'menage') {
        optNom = 'Ménage fin de séjour';
        optPrix = 50;
        qte = devis.chambres.length;
      } else if (k === 'litsFaits') {
        optNom = 'Lits faits à l\'arrivée';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      } else if (k === 'lingeFourni') {
        optNom = 'Linge de toilette fourni';
        optPrix = 5;
        qte = (devis.occupants && devis.occupants.length) || totalPersonnes || 1;
      }
      return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
    }) : [];

    const taxeSejourDetails = {
      adultes: totalAdultes,
      taux: 0.044,
      nuits: nuits,
      base: tarifMoyen,
      total: taxeSejourCalculee
    };

    let promoMontant = 0;
    if (devis.codePromo) {
      const promo = await prisma.promoCode.findUnique({ where: { code: devis.codePromo.toUpperCase() } });
      if (promo && promo.actif) {
        if (promo.type === 'pourcentage') {
          const ratio = 1 - (promo.valeur / 100);
          if (ratio > 0) {
            const prixSansPromo = devis.prixTotal / ratio;
            promoMontant = prixSansPromo - devis.prixTotal;
          }
        } else {
          promoMontant = promo.valeur;
        }
      }
    }

    const pdfData = {
      numeroDevis: devis.numeroDevis,
      refClient,
      dateDebut: devis.dateDebut,
      dateFin: devis.dateFin,
      expireLe: devis.expireLe,
      clientNom: devis.client.nom,
      clientEmail: devis.client.email,
      clientTel: devis.client.telephone,
      clientAdresse: devis.client.adressePostale,
      adminNom: resolvedAdminNom,
      adminEmail: resolvedAdminEmail,
      adminTel: resolvedAdminTel,
      chambres: devis.chambres.map(id => CHAMBRES_NAMES[id] || `Chambre ${id}`),
      nuits,
      detailsLignes,
      options: detailsOptions,
      taxeSejourDetails,
      prixTotal: devis.prixTotal,
      montantAcompte: devis.montantAcompte || (Math.round((Math.max(0, devis.prixTotal - calculerTotalRepasServeur(devis.repas)) * 0.3 + calculerTotalRepasServeur(devis.repas)) * 100) / 100),
      promoMontant,
      codePromo: devis.codePromo,
      devisSignature: devis.devisSignature,
      valideLe: devis.valideLe
    };

    const pdfBuffer = await generateDevisPDF(pdfData);
    
    const safeNomClient = devis.client.nom.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const pdfFileName = `Devis_${devis.numeroDevis}_${safeNomClient}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur téléchargement PDF devis:", error);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

// --- HELPER : Générer le PDF de facture en mémoire (Buffer) ---
async function getInvoicePdfBuffer(reservationId, includeOccupants = false) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { client: true, occupants: true }
  });

  if (!reservation) {
    throw new Error("Réservation introuvable");
  }

  const { generateFacturePDF } = require('./utils/generateFacturePDF');

  const start = new Date(reservation.dateDebut);
  const end = new Date(reservation.dateFin);
  const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  let numeroFacture = reservation.numeroFacture;
  if (!numeroFacture) {
    numeroFacture = await getOrAssignNumeroFacture(reservation.id);
  }
  if (!numeroFacture) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    numeroFacture = `FA-${year}-${month}-${String(reservation.id).padStart(5, '0')}`;
  }

  // Trouver l'administrateur
  const adminEmail = reservation.validePar || 'david.roujet@mucomnisports.fr';
  const admin = await prisma.adminAccount.findUnique({
    where: { email: adminEmail }
  });
  const isGenericAdmin = !admin || !admin.nom || admin.nom.trim().toLowerCase() === 'admin';
  const resolvedAdminNom = isGenericAdmin ? 'David Roujet' : admin.nom;
  const resolvedAdminEmail = admin ? admin.email : adminEmail;
  const resolvedAdminTel = admin ? (admin.telephone || '06 67 99 36 81') : '06 67 99 36 81';

  let totalAdultes = 0;
  let totalMineurs = 0;
  let totalPrixBase = 0;
  let taxeSejourCalculee = 0;
  
  const chambresDetails = reservation.chambresDetails || {};
  reservation.chambres.forEach(chId => {
    const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
    const nbAdultes = parseInt(details.adultes || 0);
    const nbMineurs = parseInt(details.enfants || 0);
    const occupantsCount = nbAdultes + nbMineurs;
    const capacite = CHAMBRES_CAPACITE[chId] || 5;
    const tarifPers = occupantsCount >= capacite ? 22 : 25;
    
    totalAdultes += nbAdultes;
    totalMineurs += nbMineurs;
    totalPrixBase += occupantsCount * tarifPers * nuits;
    taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
  });

  const totalPersonnes = totalAdultes + totalMineurs;
  const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;

  const detailsLignes = reservation.chambres.map(chId => {
    const details = chambresDetails[chId] || { adultes: 0, enfants: 0 };
    const nbAdultes = parseInt(details.adultes || 0);
    const nbMineurs = parseInt(details.enfants || 0);
    const occupantsCount = nbAdultes + nbMineurs;
    const capacite = CHAMBRES_CAPACITE[chId] || 5;
    const tarifPers = occupantsCount >= capacite ? 22 : 25;
    return {
      designation: `${CHAMBRES_NAMES[chId] || `Chambre ${chId}`} (${nbAdultes} ad. + ${nbMineurs} enf.)`,
      nbPersonnes: occupantsCount,
      tarifParPersonne: tarifPers,
      nuits: nuits,
      total: occupantsCount * tarifPers * nuits
    };
  });

  // Salles
  if (reservation.salles) {
    let nuitsSalles = nuits;
    let datesSuffix = "";
    if (reservation.salles.dateDebut && reservation.salles.dateFin) {
      const startS = new Date(reservation.salles.dateDebut);
      const endS = new Date(reservation.salles.dateFin);
      nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
      const strD = startS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const strF = endS.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      datesSuffix = ` (du ${strD} au ${strF})`;
    }
    const prixSalle = reservation.chambres.length > 0 ? 100 : 150;
    if (reservation.salles.salle15) {
      detailsLignes.push({
        designation: `Location Salle 15 personnes${datesSuffix}`,
        nbPersonnes: 1,
        tarifParPersonne: prixSalle,
        nuits: nuitsSalles,
        total: prixSalle * nuitsSalles
      });
    }
    if (reservation.salles.salle12) {
      detailsLignes.push({
        designation: `Location Salle 12 personnes${datesSuffix}`,
        nbPersonnes: 1,
        tarifParPersonne: prixSalle,
        nuits: nuitsSalles,
        total: prixSalle * nuitsSalles
      });
    }
  }

  // Repas
  if (reservation.repas) {
    let totalPDJ = { adulte: 0, enfant12: 0, enfant5: 0 };
    let totalDEJ = { adulte: 0, enfant12: 0, enfant5: 0 };
    let totalDIN = { adulte: 0, enfant12: 0, enfant5: 0 };

    Object.values(reservation.repas).forEach(dayRepas => {
      if (dayRepas.PETIT_DEJ) {
        totalPDJ.adulte += parseInt(dayRepas.PETIT_DEJ.ADULTE || 0);
        totalPDJ.enfant12 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_12 || 0);
        totalPDJ.enfant5 += parseInt(dayRepas.PETIT_DEJ.ENFANT_MOINS_5 || 0);
      }
      if (dayRepas.DEJEUNER) {
        totalDEJ.adulte += parseInt(dayRepas.DEJEUNER.ADULTE || 0);
        totalDEJ.enfant12 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12 || 0);
        totalDEJ.enfant5 += parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5 || 0);
      }
      if (dayRepas.DINER) {
        totalDIN.adulte += parseInt(dayRepas.DINER.ADULTE || 0);
        totalDIN.enfant12 += parseInt(dayRepas.DINER.ENFANT_MOINS_12 || 0);
        totalDIN.enfant5 += parseInt(dayRepas.DINER.ENFANT_MOINS_5 || 0);
      }
    });

    if (totalPDJ.adulte > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Adulte)', nbPersonnes: totalPDJ.adulte, tarifParPersonne: 6, nuits: 1, total: totalPDJ.adulte * 6 });
    if (totalPDJ.enfant12 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -12 ans)', nbPersonnes: totalPDJ.enfant12, tarifParPersonne: 5, nuits: 1, total: totalPDJ.enfant12 * 5 });
    if (totalPDJ.enfant5 > 0) detailsLignes.push({ designation: 'Petits-déjeuners (Enfant -5 ans)', nbPersonnes: totalPDJ.enfant5, tarifParPersonne: 4, nuits: 1, total: totalPDJ.enfant5 * 4 });

    if (totalDEJ.adulte > 0) detailsLignes.push({ designation: 'Déjeuners (Adulte)', nbPersonnes: totalDEJ.adulte, tarifParPersonne: 11.5, nuits: 1, total: totalDEJ.adulte * 11.5 });
    if (totalDEJ.enfant12 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -12 ans)', nbPersonnes: totalDEJ.enfant12, tarifParPersonne: 9.5, nuits: 1, total: totalDEJ.enfant12 * 9.5 });
    if (totalDEJ.enfant5 > 0) detailsLignes.push({ designation: 'Déjeuners (Enfant -5 ans)', nbPersonnes: totalDEJ.enfant5, tarifParPersonne: 8, nuits: 1, total: totalDEJ.enfant5 * 8 });

    if (totalDIN.adulte > 0) detailsLignes.push({ designation: 'Dîners (Adulte)', nbPersonnes: totalDIN.adulte, tarifParPersonne: 14, nuits: 1, total: totalDIN.adulte * 14 });
    if (totalDIN.enfant12 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -12 ans)', nbPersonnes: totalDIN.enfant12, tarifParPersonne: 12, nuits: 1, total: totalDIN.enfant12 * 12 });
    if (totalDIN.enfant5 > 0) detailsLignes.push({ designation: 'Dîners (Enfant -5 ans)', nbPersonnes: totalDIN.enfant5, tarifParPersonne: 10, nuits: 1, total: totalDIN.enfant5 * 10 });
  }

  // Options
  const detailsOptions = reservation.options ? Object.entries(reservation.options).filter(([k,v]) => v).map(([k,v]) => {
    let optPrix = 0;
    let optNom = '';
    let qte = 1;
    if (k === 'menage') {
      optNom = 'Ménage fin de séjour';
      optPrix = 50;
      qte = reservation.chambres.length;
    } else if (k === 'litsFaits') {
      optNom = 'Lits faits à l\'arrivée';
      optPrix = 5;
      qte = totalPersonnes || 1;
    } else if (k === 'lingeFourni') {
      optNom = 'Linge de toilette fourni';
      optPrix = 5;
      qte = totalPersonnes || 1;
    }
    return { nom: optNom, pu: optPrix, qte: qte, total: optPrix * qte };
  }) : [];

  const taxeSejourDetails = {
    adultes: totalAdultes,
    taux: 0.044,
    nuits: nuits,
    base: tarifMoyen,
    total: taxeSejourCalculee
  };

  let promoMontant = 0;
  if (reservation.codePromo) {
    const promo = await prisma.promoCode.findUnique({ where: { code: reservation.codePromo.toUpperCase() } });
    if (promo && promo.actif) {
      if (promo.type === 'pourcentage') {
        const ratio = 1 - (promo.valeur / 100);
        if (ratio > 0) {
          const prixSansPromo = reservation.prixTotal / ratio;
          promoMontant = prixSansPromo - reservation.prixTotal;
        }
      } else {
        promoMontant = promo.valeur;
      }
    }
  }

  const acompteVal = reservation.montantAcompte || (Math.round((Math.max(0, reservation.prixTotal - calculerTotalRepasServeur(reservation.repas)) * 0.3 + calculerTotalRepasServeur(reservation.repas)) * 100) / 100);
  const soldeVal = reservation.prixTotal - acompteVal;

  const pdfData = {
    numeroFacture,
    reservationId: reservation.id,
    dateEmission: new Date(),
    dateDebut: reservation.dateDebut,
    dateFin: reservation.dateFin,
    clientNom: reservation.client.nom,
    clientEmail: reservation.client.email,
    clientTel: reservation.client.telephone,
    clientAdresse: reservation.client.adressePostale,
    structure: reservation.structure,
    adminNom: resolvedAdminNom,
    adminEmail: resolvedAdminEmail,
    adminTel: resolvedAdminTel,
    chambres: reservation.chambres.map(id => CHAMBRES_NAMES[id] || `Chambre ${id}`),
    nuits,
    detailsLignes,
    options: detailsOptions,
    taxeSejourDetails,
    prixTotal: reservation.prixTotal,
    montantAcompte: acompteVal,
    montantSolde: soldeVal,
    statutPaiement: reservation.statutPaiement,
    modePaiement: reservation.modePaiement,
    payeLe: reservation.payeLe,
    promoMontant,
    codePromo: reservation.codePromo,
    occupants: includeOccupants ? reservation.occupants : undefined
  };

  const pdfBuffer = await generateFacturePDF(pdfData);
  const safeNomClient = reservation.client.nom.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return { pdfBuffer, pdfFileName: `Facture_${numeroFacture}_${safeNomClient}.pdf` };
}

// --- ENDPOINT POUR TÉLÉCHARGER LA FACTURE PDF D'UNE RÉSERVATION ---
app.get('/api/admin/reservations/:id/facture-pdf', checkAuth, async (req, res) => {
  const { id } = req.params;
  const includeOccupants = req.query.includeOccupants === 'true';
  try {
    const { pdfBuffer, pdfFileName } = await getInvoicePdfBuffer(parseInt(id), includeOccupants);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur génération facture PDF:", error);
    res.status(500).json({ error: error.message || 'Erreur lors de la génération de la facture.' });
  }
});

// --- ENDPOINT POUR ENVOYER LA FACTURE PAR EMAIL ---
app.post('/api/admin/reservations/:id/send-facture', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { includeOccupants } = req.body;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }

    const { pdfBuffer, pdfFileName } = await getInvoicePdfBuffer(parseInt(id), includeOccupants);

    const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173');
    
    await sendMail({
      to: reservation.client.email,
      subject: `Votre facture - Réservation #${reservation.id} - Gîte de la Maladrerie`,
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <img src="${FRONTEND_URL}/logo-muc.png" alt="MUC Omnisports" style="max-height: 60px; margin-bottom: 15px;" />
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0; font-size: 22px;">Votre facture est disponible</h2>
                    <p style="font-size: 16px;">Bonjour <strong>${reservation.client.nom}</strong>,</p>
                    <p style="font-size: 16px;">Veuillez trouver ci-joint la facture correspondant à votre séjour au Gîte de la Maladrerie.</p>
                    
                    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; border-left: 4px solid #004B93; margin: 25px 0;">
                      <ul style="margin-bottom: 0; padding-left: 0; font-size: 15px; list-style-type: none;">
                        <li style="margin-bottom: 8px;"><strong>Réservation :</strong> #${reservation.id}</li>
                        <li><strong>Montant Total :</strong> <span style="color: #004B93; font-weight: bold;">${reservation.prixTotal.toFixed(2)} €</span></li>
                      </ul>
                    </div>
                    
                    <p style="font-size: 16px;">Nous vous remercions pour votre confiance et restons à votre entière disposition.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `,
      attachments: [{
        name: pdfFileName,
        content: pdfBuffer.toString('base64')
      }]
    });

    res.json({ message: "Facture envoyée avec succès." });
  } catch (error) {
    console.error("Erreur envoi facture email:", error);
    res.status(500).json({ error: "Erreur lors de l'envoi de la facture." });
  }
});

// Télécharger la facture PDF par son token (Client - Public)
app.get('/api/reservation/facture-pdf/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findFirst({
      where: {
        OR: [
          { tokenDevis: token },
          { tokenModification: token }
        ]
      }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable" });
    }

    const estConfirmee = ['RESERVE', 'TERMINE'].includes(reservation.statut) || 
                         ['ACOMPTE_PAYE', 'PAYE'].includes(reservation.statutPaiement);
    if (!estConfirmee) {
      return res.status(400).json({ error: "La facture n'est pas encore disponible." });
    }

    const { pdfBuffer, pdfFileName } = await getInvoicePdfBuffer(reservation.id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur téléchargement PDF facture:", error);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

// Récupérer les informations d'un devis par son token (Client)
app.get('/api/devis/info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const devis = await prisma.reservation.findUnique({
      where: { tokenDevis: token },
      include: { 
        client: true,
        occupants: true
      }
    });

    if (!devis) return res.status(404).json({ error: "Devis introuvable ou expiré." });
    if (devis.statut !== 'DEVIS_EN_ATTENTE') return res.status(400).json({ error: "Ce devis a déjà  été traité." });
    if (devis.expireLe && devis.expireLe < new Date()) {
       await prisma.reservation.update({ where: { id: devis.id }, data: { statut: 'DEVIS_EXPIRE' } });
       return res.status(400).json({ error: "Ce devis a expiré (validité de 48h dépassée)." });
    }

    res.json(devis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des détails du devis' });
  }
});

// Valider un devis avec saisie des occupants (Client - POST)
app.post('/api/devis/validate/:token', async (req, res) => {
  const { token } = req.params;
  const { occupants, paymentMethod, signature } = req.body;

  try {
    const devis = await prisma.reservation.findUnique({
      where: { tokenDevis: token },
      include: { client: true }
    });

    if (!devis) return res.status(404).json({ error: "Devis introuvable ou expiré." });
    if (devis.statut !== 'DEVIS_EN_ATTENTE') return res.status(400).json({ error: "Ce devis a déjà  été traité." });
    if (devis.expireLe && devis.expireLe < new Date()) {
       await prisma.reservation.update({ where: { id: devis.id }, data: { statut: 'DEVIS_EXPIRE' } });
       return res.status(400).json({ error: "Ce devis a expiré (validité de 48h dépassée)." });
    }

    // 1. Mettre à  jour les occupants si fournis
    if (occupants && Array.isArray(occupants)) {
      // Supprimer les occupants fictifs existants
      await prisma.occupant.deleteMany({
        where: { reservationId: devis.id }
      });

      // Créer les nouveaux occupants
      await prisma.occupant.createMany({
        data: occupants.map(occ => {
          const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
          let occNom = occ.nom;
          let occPrenom = occ.prenom;
          // Si mineur et nom/prénom vides, mettre des valeurs par défaut
          if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
            occNom = "Mineur";
            occPrenom = "";
          }
          const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
          let nationalite = occ.nationalite;
          if (nationalite === true || nationalite === 'true') {
            nationalite = 'Française';
          } else if (nationalite === false || nationalite === 'false') {
            nationalite = 'Étrangère';
          } else if (!nationalite) {
            nationalite = 'Française';
          }

          return {
            reservationId: devis.id,
            nom: occNom || '',
            prenom: occPrenom || '',
            estAdulte,
            age,
            nationalite
          };
        })
      });
    }

    // 2. Convertir en demande de réservation classique (RESERVE)
    const repasTotal = calculerTotalRepasServeur(devis.repas);
    const montantHebergement = Math.max(0, devis.prixTotal - repasTotal);
    const montantAcompte = Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    const montantSolde = Math.round((devis.prixTotal - montantAcompte) * 100) / 100;

    let sessionUrl = null;
    let bankDetails = null;
    let reference = null;

    if (paymentMethod === 'virement') {
      const uniqueRef = `MUC-${devis.id}-ACOMPTE`;
      reference = uniqueRef;
      bankDetails = {
        iban: process.env.BANK_IBAN || 'FR76 1027 8089 6300 0201 6890 992',
        bic: process.env.BANK_BIC || 'CMCIFR2A',
        holder: process.env.BANK_HOLDER || 'MUC Omnisport',
        bankName: process.env.BANK_NAME || 'Crédit Mutuel - CCM Montpellier Opera'
      };

      await prisma.reservation.update({
        where: { id: devis.id },
        data: { 
          statut: 'RESERVE', 
          tokenDevis: null,
          montantAcompte: montantAcompte,
          montantSolde: montantSolde,
          modePaiement: 'VIREMENT',
          devisSignature: signature,
          devisSignatureDate: new Date(),
          devisSignatureIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
          valideLe: new Date()
        }
      });

      // Envoyer l'email d'intention de virement au client
      const adminEmailForSignature = devis.validePar || 'dr.mucomnisports@gmail.com';
      const adminSignatureHTML = await getAdminSignatureHTML(adminEmailForSignature);
      await sendMail({
        to: devis.client.email,
        subject: `Confirmation de réservation et RIB - Gîte de La Maladrerie (Réf: ${uniqueRef})`,
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
              <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
              <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
                <h2 style="color: #004B93; margin-top: 0;">Bonjour ${devis.client.nom},</h2>
                <p>Nous vous confirmons que votre devis <strong>${devis.numeroDevis}</strong> a été validé et que votre séjour est bien enregistré.</p>
                <p>Afin de confirmer définitivement vos dates de séjour, veuillez procéder au règlement de l'acompte par virement bancaire.</p>
                
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin-top: 0; font-weight: bold; color: #004B93;">Détails de l'acompte :</p>
                  <table width="100%" style="font-size: 14px;">
                    <tr><td style="padding: 5px 0;"><strong>Montant de l'acompte :</strong></td><td style="font-weight: bold; font-size: 16px; color: #004B93;">${montantAcompte.toFixed(2)} €</td></tr>
                    <tr><td style="padding: 5px 0;"><strong>Libellé/Référence obligatoire :</strong></td><td style="font-weight: bold; color: #d97706; background-color: #fef3c7; padding: 2px 6px; border-radius: 4px;">${uniqueRef}</td></tr>
                    <tr><td colspan="2" style="padding: 10px 0 5px 0; border-top: 1px dashed #e2e8f0;"><strong>Coordonnées bancaires :</strong></td></tr>
                    <tr><td style="padding: 3px 0;">Titulaire du compte :</td><td><strong>${bankDetails.holder}</strong></td></tr>
                    <tr><td style="padding: 3px 0;">IBAN :</td><td><strong style="font-family: monospace; font-size: 13px;">${bankDetails.iban}</strong></td></tr>
                    <tr><td style="padding: 3px 0;">BIC :</td><td><strong style="font-family: monospace; font-size: 13px;">${bankDetails.bic}</strong></td></tr>
                    <tr><td style="padding: 3px 0;">Banque :</td><td>${bankDetails.bankName}</td></tr>
                  </table>
                </div>

                <p style="font-size: 13px; color: #666; font-style: italic;">
                  ⚠️ <strong>Important :</strong> Veuillez indiquer exactement la référence <strong>${uniqueRef}</strong> dans le motif ou libellé de votre virement afin que nous puissions valider votre réservation.
                </p>

                <p>Dès réception des fonds, vous recevrez un e-mail de confirmation finale.</p>
                
                ${adminSignatureHTML}
              </td></tr>
            </table></td></tr>
          </table>
        `
      });

      // Envoyer un mail de notification à l'admin pour le virement
      const targetAdminEmail = await getAdminEmailsForPreference('notifDevisValidation');
      const recipientEmails = `${targetAdminEmail}, valerie.hostein@mucomnisports.fr, johanna.journet@mucomnisports.fr`;
      await sendMail({
        to: recipientEmails,
        subject: `🏦 [VIREMENT DEVIS] ${devis.structure ? devis.structure + ' / ' : ''}${devis.client.nom} - Devis ${devis.numeroDevis} - ${montantAcompte.toFixed(2)} €`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
            <!-- Header banner with logo text / colors -->
            <div style="background-color: #004B93; padding: 24px; text-align: center; border-bottom: 4px solid #FFD700;">
              <span style="color: #FFD700; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">Gîte de la Maladrerie</span>
              <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">🏦 Devis validé par virement</h2>
            </div>
            
            <div style="padding: 24px;">
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
                Bonjour,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                Le devis <strong>${devis.numeroDevis}</strong> du client <strong>${devis.client.nom}</strong>${devis.structure ? ` (Structure: <strong>${devis.structure}</strong>)` : ''} a été validé avec succès par virement bancaire.
              </p>

              <div style="margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                <h4 style="margin: 0 0 15px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Informations du Virement :</h4>
                <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #334155;">
                  <tr>
                    <td width="40%" style="padding: 6px 0; color: #64748b; font-weight: bold;">Client :</td>
                    <td style="padding: 6px 0; font-weight: bold;">${devis.client.nom}</td>
                  </tr>
                  ${devis.structure ? `
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Structure :</td>
                    <td style="padding: 6px 0; font-weight: bold;">${devis.structure}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">N° Devis :</td>
                    <td style="padding: 6px 0; font-weight: bold; font-family: monospace;">${devis.numeroDevis}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Acompte attendu :</td>
                    <td style="padding: 6px 0; font-weight: 800; color: #004B93; font-size: 15px;">${montantAcompte.toFixed(2)} €</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Référence obligatoire :</td>
                    <td style="padding: 6px 0;"><span style="font-weight: bold; color: #b45309; background-color: #fef3c7; padding: 3px 8px; border-radius: 4px; border: 1px solid #fde68a; font-family: monospace;">${uniqueRef}</span></td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 14px; line-height: 1.6; color: #475569; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin-bottom: 24px;">
                💡 <strong>Action attendue :</strong> Veuillez surveiller votre compte bancaire pour réceptionner ce virement. Une fois reçu, cliquez sur le bouton ci-dessous pour valider le virement directement dans le système, ou accédez au Tableau de Bord.
              </p>
              
              <p style="text-align: center; margin-top: 25px; margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
                <a href="${BACKEND_URL}/api/payment/virement/validate-by-link?token=${devis.tokenModification}&type=acompte" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">✅ Valider le paiement (Marquer comme payé)</a>
                <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.2); margin-top: 10px;">Accéder au Tableau de Bord Admin</a>
              </p>
            </div>
            
            <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
              Cet e-mail automatique est envoyé par le système de réservation du Gîte de la Maladrerie.
            </div>
          </div>
        `
      });

    } else {
      const stripeCustomerPL = await getOrCreateStripeCustomer(devis.client.email, devis.client.nom);
      const plParams = {
        payment_method_types: ['card'],
        allow_promotion_codes: true,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { 
              name: repasTotal > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie',
              description: getStripeDescription(devis)
            },
            unit_amount: Math.round(montantAcompte * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        billing_address_collection: 'required',
        success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/payment-cancel`,
        metadata: { reservationId: devis.id.toString(), paymentType: 'ACOMPTE' }
      };
      if (stripeCustomerPL) plParams.customer = stripeCustomerPL;
      else if (devis.client.email && devis.client.email !== 'N/A') plParams.customer_email = devis.client.email;
      
      const session = await stripe.checkout.sessions.create(plParams);
      sessionUrl = session.url;

      await prisma.reservation.update({
        where: { id: devis.id },
        data: { 
          statut: 'RESERVE', 
          tokenDevis: null,
          montantAcompte: montantAcompte,
          montantSolde: montantSolde,
          stripeSessionId: session.id,
          devisSignature: signature,
          devisSignatureDate: new Date(),
          devisSignatureIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
          valideLe: new Date()
        }
      });
    }

    // Envoyer un e-mail à l'admin créateur du devis pour l'alerter, ainsi qu'aux admins abonnés
    try {
      const recipientEmails = await getAdminEmailsForPreference('notifDevisValidation', 
        (devis.validePar && devis.validePar !== 'Admin' && devis.validePar.includes('@')) ? [devis.validePar] : []
      );
      await sendMail({
        to: recipientEmails,
        subject: `⚡ Devis ${devis.numeroDevis} validé par le client !`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eeeeee; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
              <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #004B93; margin: 0;">Gîte de la Maladrerie</h1>
                <p style="color: #555555; font-size: 14px; margin-top: 5px;">MUC Omnisports</p>
              </div>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin-bottom: 20px;" />
              <h2 style="color: #28a745; margin-bottom: 15px;">Félicitations ! Le client a validé votre devis.</h2>
              <p>Bonjour,</p>
              <p>Le devis <strong>${devis.numeroDevis}</strong> que vous avez créé a été validé par le client <strong>${devis.client.nom}</strong>.</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #004B93; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Détails du séjour :</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Dates :</strong> du ${new Date(devis.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(devis.dateFin).toLocaleDateString('fr-FR')}</li>
                  <li><strong>Chambres :</strong> ${devis.chambres?.length > 0 ? devis.chambres.join(', ') : 'Aucune'}</li>
                  <li><strong>Prix Total :</strong> ${devis.prixTotal} €</li>
                </ul>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #856404;">🧹 Action Requise : Affectation d'un Intervenant</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #666666;">
                  Veuillez vous connecter à  l'espace d'administration pour affecter un <strong>agent de ménage / accueil</strong> pour ce séjour.
                </p>
              </div>
              
              <p style="text-align: center; margin-top: 30px;">
                <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accéder à  l'administration</a>
              </p>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin-top: 30px; margin-bottom: 20px;" />
              <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
                Ceci est une notification automatique générée par le système du Gîte de la Maladrerie.
              </p>
            </div>
          `
        });
      } catch (mailErr) {
        console.error("Erreur envoi notification mail à  l'admin créateur du devis:", mailErr);
      }

    res.json({ success: true, url: sessionUrl, method: paymentMethod, bankDetails, reference, amount: montantAcompte });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la validation du devis." });
  }
});

// Valider un devis (Client - Fallback GET)
app.get('/api/devis/validate/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const devis = await prisma.reservation.findUnique({
      where: { tokenDevis: token },
      include: { client: true }
    });

    if (!devis) return res.status(404).send("Devis introuvable ou expiré.");
    if (devis.statut !== 'DEVIS_EN_ATTENTE') return res.status(400).send("Ce devis a déjà  été traité.");
    if (devis.expireLe && devis.expireLe < new Date()) {
       await prisma.reservation.update({ where: { id: devis.id }, data: { statut: 'DEVIS_EXPIRE' } });
       return res.status(400).send("Ce devis a expiré (validité de 48h dépassée).");
    }

    // Convertir en demande de réservation classique (RESERVE)
    const repasTotal = calculerTotalRepasServeur(devis.repas);
    const montantHebergement = Math.max(0, devis.prixTotal - repasTotal);
    const montantAcompte = Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    const montantSolde = Math.round((devis.prixTotal - montantAcompte) * 100) / 100;

    const stripeCustomerPL = await getOrCreateStripeCustomer(devis.client.email, devis.client.nom);
    const plParams = {
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: repasTotal > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie',
            description: getStripeDescription(devis)
          },
          unit_amount: Math.round(montantAcompte * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
        billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: devis.id.toString(), paymentType: 'ACOMPTE' }
    };
    if (stripeCustomerPL) plParams.customer = stripeCustomerPL;
    else if (devis.client.email && devis.client.email !== 'N/A') plParams.customer_email = devis.client.email;
    
    const session = await stripe.checkout.sessions.create(plParams);

    await prisma.reservation.update({
      where: { id: devis.id },
      data: { 
        statut: 'RESERVE', 
        tokenDevis: null,
        montantAcompte: montantAcompte,
        montantSolde: montantSolde,
        stripeSessionId: session.id
      }
    });

    // Envoyer un e-mail à l'admin créateur du devis pour l'alerter, ainsi qu'aux admins abonnés
    try {
      const recipientEmails = await getAdminEmailsForPreference('notifDevisValidation', 
        (devis.validePar && devis.validePar !== 'Admin' && devis.validePar.includes('@')) ? [devis.validePar] : []
      );
      await sendMail({
        to: recipientEmails,
        subject: `⚡ Devis ${devis.numeroDevis} validé par le client !`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eeeeee; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
              <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #004B93; margin: 0;">Gîte de la Maladrerie</h1>
                <p style="color: #555555; font-size: 14px; margin-top: 5px;">MUC Omnisports</p>
              </div>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin-bottom: 20px;" />
              <h2 style="color: #28a745; margin-bottom: 15px;">Félicitations ! Le client a validé votre devis.</h2>
              <p>Bonjour,</p>
              <p>Le devis <strong>${devis.numeroDevis}</strong> que vous avez créé a été validé par le client <strong>${devis.client.nom}</strong>.</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #004B93; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Détails du séjour :</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>Dates :</strong> du ${new Date(devis.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(devis.dateFin).toLocaleDateString('fr-FR')}</li>
                  <li><strong>Chambres :</strong> ${devis.chambres?.length > 0 ? devis.chambres.join(', ') : 'Aucune'}</li>
                  <li><strong>Prix Total :</strong> ${devis.prixTotal} €</li>
                </ul>
              </div>
              
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #856404;">🧹 Action Requise : Affectation d'un Intervenant</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #666666;">
                  Veuillez vous connecter à  l'espace d'administration pour affecter un <strong>agent de ménage / accueil</strong> pour ce séjour.
                </p>
              </div>
              
              <p style="text-align: center; margin-top: 30px;">
                <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accéder à  l'administration</a>
              </p>
              <hr style="border: 0; border-top: 1px solid #eeeeee; margin-top: 30px; margin-bottom: 20px;" />
              <p style="font-size: 11px; color: #999999; text-align: center; margin: 0;">
                Ceci est une notification automatique générée par le système du Gîte de la Maladrerie.
              </p>
            </div>
          `
        });
        console.log(`Notification envoyée à  l'admin créateur du devis: ${devis.validePar}`);
      } catch (mailErr) {
        console.error("Erreur envoi notification mail à  l'admin créateur du devis:", mailErr);
      }

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #28a745;">Devis validé !</h1>
        <p>Votre demande a été confirmée.</p>
        <p>Pour finaliser votre réservation, veuillez procéder au paiement de l'Acompte ${calculerTotalRepasServeur(devis.repas) > 0 ? '(30% Hébergement + 100% Repas)' : '(30% Hébergement)'}.</p>
        <div style="margin-top: 30px;">
          <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">Payer l'acompte en ligne</a>
        </div>
      </div>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de la validation du devis.");
  }
});

// Cron job pour expirer les devis (réutilisable pour Vercel Crons)
const executeHourlyDevisCheck = async () => {
  const now = new Date();
  const expired = await prisma.reservation.updateMany({
    where: {
      statut: 'DEVIS_EN_ATTENTE',
      expireLe: { lte: now }
    },
    data: { statut: 'DEVIS_EXPIRE' }
  });
  if (expired.count > 0) console.log(`${expired.count} devis expirés.`);
  return expired.count;
};

cron.schedule('0 * * * *', async () => {
  try {
    await executeHourlyDevisCheck();
  } catch (err) {
    console.error("Erreur cron devis:", err);
  }
});

app.get('/api/cron/devis', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isValidToken = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !isValidToken && process.env.NODE_ENV === 'production') {
    return res.status(401).send('Non autorisé');
  }
  try {
    const count = await executeHourlyDevisCheck();
    res.json({ success: true, expired: count });
  } catch (err) {
    console.error("Erreur HTTP cron devis:", err);
    res.status(500).json({ error: err.message });
  }
});




// Annuler la caution
app.post('/api/reservations/:id/cancel-caution', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reser = await prisma.reservation.findUnique({ where: { id: parseInt(id) } });
    if (!reser || !reser.stripeCautionId) return res.status(404).json({ error: 'Empreinte introuvable' });

    await stripe.paymentIntents.cancel(reser.stripeCautionId);
    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { statutCaution: 'RESTITUEE' }
    });

    res.json({ success: true, message: 'Caution annulée/restituée avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

// Générer et envoyer le lien pour le solde (70%)

// Générer et envoyer le lien pour les arrhes (acompte 30%)
app.post('/api/reservations/:id/acompte', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation introuvable' });

    const montantAcompteCalcule = reservation.montantAcompte ? reservation.montantAcompte : Math.round((reservation.prixTotal || 0) * 0.3 * 100) / 100;

    if (montantAcompteCalcule <= 0) return res.status(400).json({ error: 'L\'acompte est de 0€' });

    let tokenModification = reservation.tokenModification;
    if (!tokenModification) {
      tokenModification = require('crypto').randomBytes(32).toString('hex');
    }

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        tokenModification: tokenModification,
        validePar: adminEmail
      }
    });

    const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=acompte`;
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: 'Paiement de l\'acompte de votre séjour - Gîte de La Maladrerie',
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
              <p>Afin de confirmer votre réservation pour le séjour du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>, veuillez procéder au règlement de l'acompte.</p>
              <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                <tr><td><a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Procéder au règlement de ${montantAcompteCalcule.toFixed(2)} €</a></td></tr>
              </table>
              
              ${modificationLinkHTML}
 
              <p>À très bientôt !</p>
              
              ${adminSignatureHTML}
            </td></tr>
          </table></td></tr>
        </table>
      `
    });

    res.json({ message: 'Lien d\'acompte envoyé', url: paymentLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\'acompte' });
  }
});

// Générer et envoyer le lien pour la totalité
app.post('/api/reservations/:id/totalite', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation introuvable' });

    const montantTotal = reservation.prixTotal || 0;
    if (montantTotal <= 0) return res.status(400).json({ error: 'Le montant total est de 0€' });

    let tokenModification = reservation.tokenModification;
    if (!tokenModification) {
      tokenModification = require('crypto').randomBytes(32).toString('hex');
    }

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        montantAcompte: 0,
        montantSolde: montantTotal,
        tokenModification: tokenModification,
        validePar: adminEmail
      }
    });

    const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=totalite`;
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: 'Paiement de la totalité de votre séjour - Gîte de La Maladrerie',
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
              <p>Afin de confirmer et régler l'intégralité de votre séjour du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>, veuillez procéder au règlement total.</p>
              <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                <tr><td><a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Procéder au règlement de ${montantTotal.toFixed(2)} €</a></td></tr>
              </table>
              
              ${modificationLinkHTML}

              <p>À très bientôt !</p>
              
              ${adminSignatureHTML}
            </td></tr>
          </table></td></tr>
        </table>
      `
    });

    res.json({ message: 'Lien de totalité envoyé', url: paymentLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération du paiement total' });
  }
});

app.post('/api/reservations/:id/solde', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable" });
    }

    const montantSoldeCalcule = reservation.montantSolde ? reservation.montantSolde : ((reservation.prixTotal || 0) - (reservation.montantAcompte || 0));

    if (montantSoldeCalcule <= 0) {
      return res.status(400).json({ error: "Le solde est de 0€ (déjà  réglé ou prix total non défini)" });
    }

    let tokenModification = reservation.tokenModification;
    if (!tokenModification) {
      tokenModification = require('crypto').randomBytes(32).toString('hex');
    }

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        tokenModification: tokenModification,
        validePar: adminEmail
      }
    });

    const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=solde`;
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: "Paiement du solde de votre séjour - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                    <p>Votre séjour approche à  grands pas (arrivée prévue le <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong>).</p>
                    <p>Afin de finaliser votre réservation, veuillez procéder au règlement du solde de votre séjour.</p>
                    
                    <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                      <tr>
                        <td>
                          <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer le solde de ${montantSoldeCalcule.toFixed(2)} €</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p>Nous restons à  votre disposition pour toute question.</p>
                    
                    ${modificationLinkHTML}

                    <p>À très bientôt !</p>
                    
                    ${adminSignatureHTML}
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.json({ message: "Lien de solde envoyé", url: paymentLink });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la génération du solde" });
  }
});

// Générer et envoyer le lien pour la caution (Empreinte bancaire de 500€)
app.post('/api/reservations/:id/caution', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable" });
    }

    const stripeCustomerCaution = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const cautionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Caution - Empreinte bancaire (Gîte de La Maladrerie)',
            description: getStripeDescription(reservation, true),
          },
          unit_amount: 50000, // 500€
        },
        quantity: 1,
      }],
      mode: 'payment',
        billing_address_collection: 'required',
      payment_intent_data: {
        capture_method: 'manual', // Autorise sans capturer
      },
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: {
        reservationId: reservation.id.toString(),
        paymentType: 'caution'
      }
    };
    if (stripeCustomerCaution) {
      cautionParams.customer = stripeCustomerCaution;
    } else if (reservation.client.email && reservation.client.email !== 'N/A') {
      cautionParams.customer_email = reservation.client.email;
    }
    const session = await stripe.checkout.sessions.create(cautionParams);

    let tokenModification = reservation.tokenModification;
    if (!tokenModification) {
      tokenModification = require('crypto').randomBytes(32).toString('hex');
    }

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        stripeCautionId: session.id,
        tokenModification: tokenModification,
        validePar: adminEmail
      }
    });

    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: "Dépôt de garantie (Caution) - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                    <p>Nous vous remercions pour votre réservation au Gîte de La Maladrerie.</p>
                    <p>Afin de finaliser les préparatifs de votre séjour prévu du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>, et conformément à  nos Conditions Générales de Vente, un dépôt de garantie de 500 € est requis.</p>
                    
                    <table width="100%" cellpadding="20" cellspacing="0" border="0" style="background-color: #f8f9fa; border-left: 4px solid #004B93; margin: 25px 0; border-radius: 0 8px 8px 0;">
                      <tr>
                        <td style="padding: 15px;">
                          <p style="margin: 0;"><strong>Veuillez noter :</strong> Il s'agit d'une simple <strong>empreinte bancaire</strong> sécurisée. Aucun montant ne sera débité de votre compte. Cette somme est uniquement bloquée temporairement et sera automatiquement libérée après votre départ, sous réserve de l'état des lieux.</p>
                        </td>
                      </tr>
                    </table>

                    <p>Nous vous invitons à  procéder à  l'enregistrement de cette garantie en cliquant sur le lien sécurisé ci-dessous :</p>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center">
                          <a href="${session.url}" style="background-color: #004B93; color: #ffffff; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; display: inline-block;">Enregistrer la garantie de 500 €</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin-top: 30px;">Si vous avez la moindre question, n'hésitez pas à  nous contacter.</p>

                    ${modificationLinkHTML}

                    <p>Cordialement,</p>
                    
                    ${adminSignatureHTML}
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.json({ message: "Lien de caution envoyé", url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la génération de la caution" });
  }
});
// ===== ROUTES ADMINISTRATEUR =====

// Authentification simple
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
  }
  const cleanEmail = email.trim().toLowerCase();

  try {
    // 1. Check SuperAdmin (Env Var) - Toujours prioritaire pour le dépannage
    if (cleanEmail === ADMIN_EMAIL.trim().toLowerCase() && password === ADMIN_PASSWORD) {
      let dbAdmin = await prisma.adminAccount.findUnique({ where: { email: cleanEmail } });
      if (!dbAdmin) {
        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          dbAdmin = await prisma.adminAccount.create({
            data: {
              email: cleanEmail,
              password: hashedPassword,
              nom: 'David ROUJET',
              telephone: '',
              notifNewReservation: true,
              notifNewDevis: true,
              notifDevisValidation: true,
              notifPaymentReceived: true,
              notifModificationRequest: true,
              notifIntervenantMissions: true
            }
          });
        } catch (dbErr) {
          console.error("Erreur creation auto SuperAdmin dans DB:", dbErr);
        }
      }
      const token = jwt.sign({ id: dbAdmin ? dbAdmin.id : 0, email: cleanEmail, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, token, role: 'admin' });
    }

    // 2. Check Database Admin
    const dbAdmin = await prisma.adminAccount.findUnique({ where: { email: cleanEmail } });
    if (dbAdmin) {
      const isMatch = await bcrypt.compare(password, dbAdmin.password);
      if (isMatch) {
        const token = jwt.sign({ id: dbAdmin.id, email: dbAdmin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, token, role: 'admin' });
      }
    }

    // 3. Check Intervenant
    const intervenant = await prisma.intervenant.findUnique({
      where: { email: cleanEmail }
    });

    if (intervenant) {
      // Pour l'instant, on accepte un mot de passe par défaut si non défini
      // Ou on compare avec le mot de passe haché
      let isMatch = false;
      if (!intervenant.password) {
        // Premier login ou password non défini
        if (password === 'equipe2024') isMatch = true;
      } else {
        isMatch = await bcrypt.compare(password, intervenant.password);
      }

      if (isMatch) {
        const token = jwt.sign({ id: intervenant.id, email: intervenant.email, role: 'intervenant' }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, token, role: 'intervenant' });
      }
    }

    res.status(401).json({ success: false, error: 'Identifiants incorrects' });
  } catch (error) {
    console.error("Erreur login:", error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/admin/auth', async (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    let dbAdmin = await prisma.adminAccount.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!dbAdmin) {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        dbAdmin = await prisma.adminAccount.create({
          data: {
            email: ADMIN_EMAIL,
            password: hashedPassword,
            nom: 'David ROUJET',
            telephone: '',
            notifNewReservation: true,
            notifNewDevis: true,
            notifDevisValidation: true,
            notifPaymentReceived: true,
            notifModificationRequest: true,
            notifIntervenantMissions: true
          }
        });
      } catch (dbErr) {
        console.error("Erreur creation auto SuperAdmin dans DB (admin/auth):", dbErr);
      }
    }
    const token = jwt.sign({ id: dbAdmin ? dbAdmin.id : 0, email: ADMIN_EMAIL, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
  }
});

// Middleware simple pour vérifier le token (très basique pour l'exemple)
// Obtenir TOUTES les réservations (pour le dashboard)
app.get('/api/admin/reservations', checkAuth, async (req, res) => {
  try {
    const reservations = await prisma.reservation.findMany({
      include: { 
        client: true,
        occupants: true,
        missions: {
          include: { intervenant: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 7, 5: 7, 6: 5 };
    
    // Trier temporairement par ordre chronologique de début de séjour (croissant) 
    // pour garantir une attribution cohérente lors des mises à niveau
    reservations.sort((a, b) => new Date(a.dateDebut) - new Date(b.dateDebut));
    
    // Assurer l'existence d'un numéro de facture pour toutes les réservations confirmées/payées
    const processedReservations = [];
    for (let r of reservations) {
      const estConfirmee = ['RESERVE', 'TERMINE'].includes(r.statut) || 
                           ['ACOMPTE_PAYE', 'PAYE'].includes(r.statutPaiement);
      if (estConfirmee && !r.numeroFacture) {
        r.numeroFacture = await getOrAssignNumeroFacture(r.id);
      }
      processedReservations.push(r);
    }

    // Remettre dans l'ordre chronologique décroissant pour le tableau de bord admin
    processedReservations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const reservationsWithTaxe = processedReservations.map(r => {
      let taxe = 0;
      if (r.dateDebut && r.dateFin && r.chambres && r.chambres.length > 0) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const detailsSource = r.chambresDetails || {};
        
        r.chambres.forEach(chId => {
          const details = detailsSource[chId] || { adultes: 0, enfants: 0, mineurs: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || details.mineurs || 0);
          const occupants = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupants >= capacite ? 22 : 25;
          taxe += nbAdultes * tarifPers * nuits * 0.044;
        });
      }
      return { ...r, taxeSejour: Math.round(taxe * 100) / 100 };
    });
    
    res.json(reservationsWithTaxe);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' });
  }
});

// ===== MISSIONS INTERVENANTS =====

// Ajouter une ou plusieurs missions à  une réservation (batch) + notification automatique
app.post('/api/admin/reservations/:id/missions', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { intervenantId, missions: missionsArray } = req.body;
  
  // Support ancien format (une seule mission) et nouveau format (tableau)
  let missionsToCreate = [];
  if (missionsArray && Array.isArray(missionsArray)) {
    missionsToCreate = missionsArray;
  } else {
    // Ancien format rétrocompatible
    const { typeMission, montant, date } = req.body;
    missionsToCreate = [{ typeMission, montant, date }];
  }

  if (!intervenantId || missionsToCreate.length === 0) {
    return res.status(400).json({ error: 'Intervenant et au moins une mission requis' });
  }
  
  try {
    const createdMissions = [];
    for (const m of missionsToCreate) {
      const mission = await prisma.mission.create({
        data: {
          reservationId: parseInt(id),
          intervenantId: parseInt(intervenantId),
          typeMission: m.typeMission,
          montant: parseFloat(m.montant),
          date: m.date ? new Date(m.date) : null
        },
        include: { intervenant: true }
      });
      createdMissions.push(mission);
    }

    // Envoi automatique de la notification à  l'intervenant
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: {
        client: true
      }
    });

    const intervenant = await prisma.intervenant.findUnique({
      where: { id: parseInt(intervenantId) }
    });

    if (reservation && intervenant && createdMissions.length > 0) {
      const dateDebut = new Date(reservation.dateDebut);
      const dateFin = new Date(reservation.dateFin);
      const veilleDateDebut = new Date(dateDebut);
      veilleDateDebut.setDate(veilleDateDebut.getDate() - 1);

      const missionsHtml = createdMissions.map(m => `<li style="margin-bottom: 12px;">${getMissionDetail(m, reservation.dateDebut, reservation.dateFin)}</li>`).join('');
      const totalRemuneration = createdMissions.reduce((sum, m) => sum + m.montant, 0);

      const backendUrl = process.env.BACKEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5000');
      const acceptUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/accept`;
      const rejectUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/reject`;

      await sendMail({
        to: intervenant.email,
        subject: `Missions assignées — Séjour du ${dateDebut.toLocaleDateString('fr-FR')} au ${dateFin.toLocaleDateString('fr-FR')}`,
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #004B93; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                      <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0 0; font-size: 14px;">Notification de missions</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0;">Bonjour ${intervenant.prenom},</h2>
                      <p>De nouvelles missions vous ont été confiées pour un séjour programmé au gîte.</p>
                      
                      <table width="100%" cellpadding="15" cellspacing="0" border="0" style="background-color: #fff8e1; border-left: 4px solid #FDB913; margin: 25px 0; border-radius: 0 8px 8px 0;">
                        <tr>
                          <td>
                            <p style="margin: 0 0 5px 0; font-weight: bold; color: #004B93;">📅 Période du séjour</p>
                            <p style="margin: 0; font-size: 16px;">Du <strong>${dateDebut.toLocaleDateString('fr-FR')}</strong> au <strong>${dateFin.toLocaleDateString('fr-FR')}</strong></p>
                          </td>
                        </tr>
                      </table>

                      <p style="font-weight: bold; margin-bottom: 10px;">Détails des missions :</p>
                      <ul style="padding-left: 20px; margin-bottom: 25px;">
                        ${missionsHtml}
                      </ul>
                      
                      <table width="100%" cellpadding="15" cellspacing="0" border="0" style="background-color: #e8f5e9; border-radius: 8px; margin-bottom: 25px; text-align: center;">
                        <tr>
                          <td>
                            <p style="margin: 0; font-size: 18px; font-weight: bold; color: #2e7d32;">Rémunération totale : ${totalRemuneration.toFixed(2)} €</p>
                          </td>
                        </tr>
                      </table>

                      <p>Veuillez confirmer votre disponibilité en cliquant sur l'un des boutons ci-dessous :</p>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <table cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td style="background-color: #28a745; border-radius: 6px;">
                                  <a href="${acceptUrl}" style="display: inline-block; padding: 15px 30px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">✓ J'accepte</a>
                                </td>
                                <td width="20"></td>
                                <td style="background-color: #dc3545; border-radius: 6px;">
                                  <a href="${rejectUrl}" style="display: inline-block; padding: 15px 30px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">✗ Je décline</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #FDB913; height: 5px;"></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });

      res.json(createdMissions);
    } else {
      res.json(createdMissions);
    }
  } catch (error) {
    console.error("Erreur assignation missions:", error);
    res.status(500).json({ error: "Erreur lors de la création des missions" });
  }
});

function calculerDetailsFinanciersReservation(res) {
    let taxeSejour = 0;
    let totalSalles = 0;
    if (res.dateDebut && res.dateFin) {
        const start = new Date(res.dateDebut);
        const end = new Date(res.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        if (nuits > 0) {
            let nbAdultes = 0;
            let nbOccupants = 0;
            if (res.occupants && res.occupants.length > 0) {
                nbAdultes = res.occupants.filter(o => o.estAdulte).length;
                nbOccupants = res.occupants.length;
            } else if (res.chambresDetails && Object.keys(res.chambresDetails).length > 0) {
                Object.values(res.chambresDetails).forEach(room => {
                    nbAdultes += parseInt(room.adultes || 0);
                    nbOccupants += parseInt(room.adultes || 0) + parseInt(room.enfants || 0);
                });
            }
            if (nbAdultes > 0 && res.chambres && res.chambres.length > 0) {
                const tarifPers = (nbOccupants >= res.chambres.length * 4) ? 22 : 25;
                taxeSejour = nbAdultes * tarifPers * nuits * 0.044;
            }
            
            if (res.salles) {
                let nuitsSalles = nuits;
                if (res.salles.dateDebut && res.salles.dateFin) {
                    const startS = new Date(res.salles.dateDebut);
                    const endS = new Date(res.salles.dateFin);
                    nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
                }
                const prixSalle = (res.chambres && res.chambres.length > 0) ? 100 : 150;
                if (res.salles.salle15) totalSalles += prixSalle * nuitsSalles;
                if (res.salles.salle12) totalSalles += prixSalle * nuitsSalles;
            }
        }
    }
    
    return {
        taxeSejour: Math.round(taxeSejour * 100) / 100,
        totalSalles: Math.round(totalSalles * 100) / 100
    };
}


// Déclencher manuellement l'envoi du rapport mensuel de taxe de séjour par e-mail
app.post('/api/admin/finances/send-monthly-tax-report', checkAuth, async (req, res) => {
  const { month, year } = req.body;
  try {
    const today = new Date();
    
    // Déterminer le mois cible
    let targetMonth = (month !== undefined && month !== null) ? parseInt(month) : today.getMonth() - 1;
    let targetYear = (year !== undefined && year !== null) ? parseInt(year) : today.getFullYear();
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    }

    const prevMonthStart = new Date(targetYear, targetMonth, 1);
    const prevMonthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] },
        dateDebut: {
          gte: prevMonthStart,
          lte: prevMonthEnd
        }
      },
      include: { occupants: true }
    });

    let totalTaxeSejour = 0;
    let nbAdultesTotal = 0;
    let nbNuitsTotal = 0;

    reservations.forEach(r => {
      const { taxeSejour } = calculerDetailsFinanciersReservation(r);
      totalTaxeSejour += taxeSejour;

      if (r.dateDebut && r.dateFin) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        nbNuitsTotal += nuits;

        let nbAdultes = 0;
        if (r.occupants && r.occupants.length > 0) {
          nbAdultes = r.occupants.filter(o => o.estAdulte).length;
        } else if (r.chambresDetails && typeof r.chambresDetails === 'object') {
          Object.values(r.chambresDetails).forEach(room => {
            nbAdultes += parseInt(room.adultes || 0);
          });
        }
        nbAdultesTotal += nbAdultes;
      }
    });

    totalTaxeSejour = Math.round(totalTaxeSejour * 100) / 100;

    const monthNames = [
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    const prevMonthLabel = monthNames[targetMonth];
    const currentYearLabel = targetYear;

    const toEmails = 'valerie.hostein@mucomnisports.fr, johanna.journet@mucomnisports.fr';

    await sendMail({
      to: toEmails,
      subject: `📊 [TAXE DE SÉJOUR] Déclaration mensuelle - ${prevMonthLabel} ${currentYearLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
          <div style="background-color: #004B93; padding: 24px; text-align: center; border-bottom: 4px solid #FFD700;">
            <span style="color: #FFD700; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">Gîte de la Maladrerie</span>
            <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">📊 Taxe de Séjour à Déclarer</h2>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">Bonjour,</p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Voici le récapitulatif de la taxe de séjour collectée pour les séjours ayant débuté durant le mois de <strong>${prevMonthLabel} ${currentYearLabel}</strong> :
            </p>
            <div style="margin: 24px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; text-align: center;">
              <span style="color: #166534; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Montant Total à Déclarer</span>
              <span style="font-size: 32px; font-weight: 900; color: #15803d;">${totalTaxeSejour.toFixed(2)} €</span>
            </div>
            <div style="margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px;">
              <h4 style="margin: 0 0 12px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Détails de la période (${prevMonthLabel} ${currentYearLabel}) :</h4>
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #334155;">
                <tr>
                  <td width="50%" style="padding: 6px 0; color: #64748b;">Nombre de réservations :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${reservations.length}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Adultes cumulés :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${nbAdultesTotal}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Nuits cumulées :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${nbNuitsTotal}</td>
                </tr>
              </table>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
              Veuillez déclarer ce montant sur la plateforme extranet officielle de la taxe de séjour en cliquant sur le bouton vert ci-dessous :
            </p>
            <p style="text-align: center; margin-top: 25px; margin-bottom: 15px;">
              <a href="https://taxe.3douest.com/extranet/accueil.php" target="_blank" style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">Accéder à la plateforme de déclaration</a>
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
            Cet e-mail a été renvoyé manuellement par un administrateur depuis le Tableau de Bord Financier.
          </div>
        </div>
      `
    });

    res.json({ success: true, to: toEmails, month: prevMonthLabel, year: currentYearLabel, totalTaxeSejour });
  } catch (error) {
    console.error("Erreur envoi manuel rapport taxe:", error);
    res.status(500).json({ error: "Erreur lors de l'envoi du rapport de taxe de séjour." });
  }
});

app.get('/api/admin/finances', checkAuth, async (req, res) => {
  try {
    // 1. Chiffre d'affaires encaissé
    const reservationsPayees = await prisma.reservation.findMany({
      where: {
        statutPaiement: { in: ['ACOMPTE_PAYE', 'PAYE', 'SOLDE_PAYE'] }
      },
      include: { client: true, occupants: true }
    });
    
    let caEnquaisse = 0;
    let caHebergementEncaisse = 0;
    let caRestaurationEncaisse = 0;

    reservationsPayees.forEach(r => {
      const { total: totalRepas } = calculerRevenuRepasServeur(r.repas);
      if (r.statutPaiement === 'PAYE') {
        caEnquaisse += (r.prixTotal || 0);
        caRestaurationEncaisse += totalRepas;
        caHebergementEncaisse += Math.max(0, (r.prixTotal || 0) - totalRepas);
      } else if (r.statutPaiement === 'SOLDE_PAYE') {
        caEnquaisse += (r.montantSolde || 0);
        caHebergementEncaisse += (r.montantSolde || 0);
      } else if (r.statutPaiement === 'ACOMPTE_PAYE') {
        caEnquaisse += (r.montantAcompte || 0);
        // L'acompte inclut 100% des repas s'il y en a + 30% hébergement.
        if (totalRepas >= (r.montantAcompte || 0)) {
          caRestaurationEncaisse += (r.montantAcompte || 0);
        } else {
          caRestaurationEncaisse += totalRepas;
          caHebergementEncaisse += ((r.montantAcompte || 0) - totalRepas);
        }
      }
    });

    // 2. Reste à encaisser (Acompte en attente ou Solde en attente)
    const reservationsEnAttente = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' }
      },
      include: { client: true }
    });

    let resteAEncaisser = 0;
    reservationsEnAttente.forEach(r => {
      if (r.statutPaiement === 'EN_ATTENTE') {
        resteAEncaisser += (r.prixTotal || 0);
      } else if (r.statutPaiement === 'ACOMPTE_PAYE') {
        resteAEncaisser += (r.montantSolde || 0);
      } else if (r.statutPaiement === 'SOLDE_PAYE') {
        resteAEncaisser += (r.montantAcompte || 0);
      }
    });

    // 3. Rémunération des intervenants (toutes les missions)
    const missions = await prisma.mission.findMany({
      include: { intervenant: true, reservation: { include: { client: true } } }
    });
    
    const ADMIN_EMAILS = ['philippe.morereau@mucomnisports.fr', 'david.roujet@mucomnisports.fr', 'mireille.chelly@mucomnisports.fr'];
    const getMissionCoutReel = (m) => {
      return m.montant;
    };

    const remunerationTotale = missions.reduce((sum, m) => sum + getMissionCoutReel(m), 0);

    // Groupement par intervenant
    const remunerationParIntervenant = {};
    missions.forEach(m => {
      const nom = `${m.intervenant.prenom} ${m.intervenant.nom}`;
      if (!remunerationParIntervenant[nom]) remunerationParIntervenant[nom] = 0;
      remunerationParIntervenant[nom] += getMissionCoutReel(m);
    });

    const missionsDetails = missions.map(m => ({
        id: m.id,
        date: m.date || (m.reservation ? m.reservation.dateDebut : new Date()),
        intervenant: `${m.intervenant.prenom} ${m.intervenant.nom}`,
        intervenantStatut: m.intervenant.statut,
        typeMission: m.typeMission,
        montant: getMissionCoutReel(m),
        clientNom: m.reservation?.client?.nom || 'Inconnu',
        reservationId: m.reservationId,
        statut: m.statut
    })).sort((a, b) => new Date(b.date) - new Date(a.date));

    // 4. Prochains paiements attendus
    const prochainsPaiements = reservationsEnAttente.map(r => ({
      reservationId: r.id,
      clientNom: r.client?.nom || 'Inconnu',
      dateDebut: r.dateDebut,
      typeAttendu: r.statutPaiement === 'EN_ATTENTE' ? (calculerTotalRepasServeur(r.repas) > 0 ? 'Acompte (30% Hébergement + 100% Repas)' : 'Acompte (30%)') : 'SOLDE (70%)',
      montant: r.statutPaiement === 'EN_ATTENTE' ? r.montantAcompte : r.montantSolde
    })).sort((a, b) => new Date(a.dateDebut) - new Date(b.dateDebut));

    // 5. Récupération des dépenses manuelles et commissions Stripe automatiques
    const expenses = await prisma.expense.findMany({
      orderBy: { date: 'desc' }
    });

    // 6. Calcul automatique du coût des repas (Déjeuners & Dîners) pour les réservations confirmées/terminées
    const reservationsMangeants = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] }
      },
      include: { client: true }
    });

    let totalCoutRepasCalcules = 0;
    const repasCoutsDetailles = [];

    reservationsMangeants.forEach(r => {
      const cost = calculerCoutRepasServeur(r.repas);
      if (cost > 0) {
        totalCoutRepasCalcules += cost;
        repasCoutsDetailles.push({
          id: `repas-res-${r.id}`,
          date: r.dateDebut,
          label: `Coût repas (Déj/Dîn) - Réservation #${r.id} (${r.client?.nom || 'Client'})`,
          montant: cost,
          categorie: "Coût d'achat des repas (Restauration)",
          comptePcg: "601",
          description: `Calcul automatique: Déjeuners/Dîners pour la résa #${r.id}`
        });
      }
    });

    // 7. Consolidation des Recettes détaillées avec ventilation Salles / Taxe de Séjour / Hébergement
    const recettesDetaillees = reservationsPayees.map(r => {
      const { total: totalRepas } = calculerRevenuRepasServeur(r.repas);
      const { taxeSejour, totalSalles } = calculerDetailsFinanciersReservation(r);
      let montantPaye = 0;
      if (r.statutPaiement === 'PAYE') {
        montantPaye = r.prixTotal || 0;
      } else if (r.statutPaiement === 'SOLDE_PAYE') {
        montantPaye = r.montantSolde || 0;
      } else {
        montantPaye = r.montantAcompte || 0;
      }
      
      let partRestaurationEncaissee = 0;
      let partSallesEncaissee = 0;
      let partTaxeEncaissee = 0;
      let partHebergementEncaissee = 0;

      const totalTheoriqueApresRepas = Math.max(0, (r.prixTotal || 0) - totalRepas);
      const hebergementTheorique = Math.max(0, totalTheoriqueApresRepas - totalSalles - taxeSejour);

      if (r.statutPaiement === 'PAYE') {
        partRestaurationEncaissee = totalRepas;
        partSallesEncaissee = totalSalles;
        partTaxeEncaissee = taxeSejour;
        partHebergementEncaissee = hebergementTheorique;
      } else if (r.statutPaiement === 'SOLDE_PAYE') {
        if (r.prixTotal > 0) {
          const ratio = (r.montantSolde || 0) / r.prixTotal;
          partRestaurationEncaissee = Math.round(totalRepas * ratio * 100) / 100;
          partSallesEncaissee = Math.round(totalSalles * ratio * 100) / 100;
          partTaxeEncaissee = Math.round(taxeSejour * ratio * 100) / 100;
          partHebergementEncaissee = Math.round(hebergementTheorique * ratio * 100) / 100;
        }
      } else { // ACOMPTE_PAYE
        partRestaurationEncaissee = Math.min(montantPaye, totalRepas);
        const resteAcompte = Math.max(0, montantPaye - partRestaurationEncaissee);
        if (totalTheoriqueApresRepas > 0) {
            const ratio = resteAcompte / totalTheoriqueApresRepas;
            partSallesEncaissee = Math.round(totalSalles * ratio * 100) / 100;
            partTaxeEncaissee = Math.round(taxeSejour * ratio * 100) / 100;
            partHebergementEncaissee = Math.max(0, resteAcompte - partSallesEncaissee - partTaxeEncaissee);
        }
      }

      // Calcul du nombre de nuits
      let nuits = 0;
      if (r.dateDebut && r.dateFin) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      }

      // Calcul des adultes et mineurs
      let nbAdultes = 0;
      let nbMineurs = 0;
      if (r.occupants && r.occupants.length > 0) {
        nbAdultes = r.occupants.filter(o => o.estAdulte).length;
        nbMineurs = r.occupants.filter(o => !o.estAdulte).length;
      } else if (r.chambresDetails && typeof r.chambresDetails === 'object') {
        Object.values(r.chambresDetails).forEach(room => {
          nbAdultes += parseInt(room.adultes || 0);
          nbMineurs += parseInt(room.mineurs || 0);
        });
      }

      return {
        id: r.id,
        date: r.dateDebut,
        createdAt: r.createdAt,
        clientNom: r.client?.nom || 'Inconnu',
        typePaiement: r.statutPaiement,
        montantTotal: r.prixTotal,
        montantPaye,
        partRestauration: partRestaurationEncaissee,
        partSalles: partSallesEncaissee,
        partTaxeSejour: partTaxeEncaissee,
        partHebergement: partHebergementEncaissee,
        nbAdultes,
        nbMineurs,
        nuits
      };
    });

    res.json({
      caEnquaisse,
      caHebergementEncaisse,
      caRestaurationEncaisse,
      resteAEncaisser,
      remunerationTotale,
      remunerationParIntervenant,
      prochainsPaiements,
      expenses,
      repasCoutsDetailles,
      totalCoutRepasCalcules,
      recettesDetaillees,
      missionsDetails
    });

  } catch (error) {
    console.error("Erreur calcul finances:", error);
    res.status(500).json({ error: 'Erreur lors du calcul des données financières' });
  }
});

// Supprimer une réservation
app.delete('/api/admin/reservations/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.reservation.delete({
      where: { id: parseInt(id) }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression:", error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// Générer un lien de paiement Stripe pour une réservation manuelle
app.post('/api/admin/reservations/:id/payment-link', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation non trouvée' });
    if (!reservation.prixTotal) return res.status(400).json({ error: 'Le prix total doit être défini pour payer' });

    const repasTotal = calculerTotalRepasServeur(reservation.repas);
    const montantHebergement = Math.max(0, reservation.prixTotal - repasTotal);
    const montantAcompte = Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;

    const stripeCustomerPL = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const plParams = {
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: repasTotal > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie',
            description: getStripeDescription(reservation)
          },
          unit_amount: Math.round(montantAcompte * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
        billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reservation.id.toString(), paymentType: 'ACOMPTE' }
    };
    if (stripeCustomerPL) {
      plParams.customer = stripeCustomerPL;
    } else if (reservation.client.email && reservation.client.email !== 'N/A') {
      plParams.customer_email = reservation.client.email;
    }
    const session = await stripe.checkout.sessions.create(plParams);

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { stripeSessionId: session.id }
    });

    res.json({ paymentLink: session.url });
  } catch (error) {
    console.error("Erreur génération lien Stripe:", error);
    res.status(500).json({ error: 'Erreur lors de la génération du lien' });
  }
});

// Mettre à jour une réservation (ex: passage manuel en PAYE ou autre statut)
app.put('/api/admin/reservations/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const dataToUpdate = req.body;
  try {
    // Gérer valideLe et payeLe s'ils transitent ou si le statut change
    if (dataToUpdate.statut === 'RESERVE' || dataToUpdate.statut === 'ACCEPTEE') {
      if (!dataToUpdate.valideLe) {
        const existing = await prisma.reservation.findUnique({ where: { id: parseInt(id) } });
        if (existing && !existing.valideLe) {
          dataToUpdate.valideLe = new Date();
        }
      }
    }
    if (dataToUpdate.statutPaiement === 'PAYE' || dataToUpdate.statutPaiement === 'ACOMPTE_PAYE' || dataToUpdate.statutPaiement === 'SOLDE_PAYE') {
      if (!dataToUpdate.payeLe) {
        const existing = await prisma.reservation.findUnique({ where: { id: parseInt(id) } });
        if (existing && !existing.payeLe) {
          dataToUpdate.payeLe = new Date();
        }
      }
    }

    const updated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      include: { client: true }
    });
    // Désactivé : remplacé par l'envoi hebdomadaire groupé (cron cuisine du jeudi)
    // await sendCuisineEmailIfNeeded(updated.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à  jour' });
  }
});

// Enregistrer une fiche de police signée pour un occupant
app.post('/api/admin/reservations/:id/fiche-police', checkAuth, async (req, res) => {
  const { id } = req.params;
  const {
    occupantId,
    nom,
    prenom,
    dateNaissance,
    lieuNaissance,
    nationalite,
    domicile,
    telephone,
    email,
    signature, // base64 image
    dateArrivee,
    dateDepart
  } = req.body;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }

    let fiches = [];
    if (reservation.fichesPolice) {
      fiches = Array.isArray(reservation.fichesPolice) 
        ? reservation.fichesPolice 
        : JSON.parse(JSON.stringify(reservation.fichesPolice));
    }

    const newFiche = {
      occupantId: occupantId ? parseInt(occupantId) : null,
      nom,
      prenom,
      dateNaissance,
      lieuNaissance,
      nationalite,
      domicile,
      telephone,
      email,
      signature,
      dateArrivee,
      dateDepart,
      signedAt: new Date().toISOString()
    };

    // Rechercher si une fiche existe déjà pour cet occupant
    let updated = false;
    if (occupantId) {
      const idx = fiches.findIndex(f => f.occupantId === parseInt(occupantId));
      if (idx > -1) {
        fiches[idx] = newFiche;
        updated = true;
      }
    }
    
    // Si non trouvé ou pas d'id occupant, chercher par nom/prénom
    if (!updated) {
      const idx = fiches.findIndex(f => f.nom.toLowerCase() === nom.toLowerCase() && f.prenom.toLowerCase() === prenom.toLowerCase());
      if (idx > -1) {
        fiches[idx] = newFiche;
      } else {
        fiches.push(newFiche);
      }
    }

    const updatedRes = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { fichesPolice: fiches },
      include: { 
        client: true,
        occupants: true,
        missions: { include: { intervenant: true } }
      }
    });

    res.json(updatedRes);
  } catch (error) {
    console.error("Erreur enregistrement fiche police:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la fiche de police." });
  }
});

// Rembourser une réservation (Stripe ou manuel)
app.post('/api/admin/reservations/:id/refund', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { montant, mode, description } = req.body;

  if (!montant || isNaN(parseFloat(montant)) || parseFloat(montant) <= 0) {
    return res.status(400).json({ error: "Montant invalide." });
  }

  const amt = parseFloat(montant);

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }

    let stripeRefundId = null;

    if (mode === 'STRIPE') {
      const sessionId = reservation.stripeSoldeId || reservation.stripeAcompteId || reservation.stripeSessionId;
      if (!sessionId) {
        return res.status(400).json({ error: "Aucun identifiant de session Stripe trouvé pour cette réservation." });
      }

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (!session.payment_intent) {
          return res.status(400).json({ error: "Impossible de récupérer l'intention de paiement Stripe associée." });
        }

        const refund = await stripe.refunds.create({
          payment_intent: session.payment_intent,
          amount: Math.round(amt * 100), // convert to cents
          reason: 'requested_by_customer'
        });

        stripeRefundId = refund.id;
      } catch (stripeErr) {
        console.error("Stripe Refund Error:", stripeErr);
        return res.status(400).json({ error: `Erreur Stripe : ${stripeErr.message}` });
      }
    }

    // Enregistrer le remboursement comme une Dépense
    const pcgCode = "709"; // Rabais, remises, ristournes accordés (remboursements)
    const label = `Remboursement (${mode}) - Réservation #${reservation.id} - ${reservation.client.nom}`;
    const desc = description || `Remboursement partiel/total suite à modification ou annulation. Stripe Refund ID: ${stripeRefundId || 'N/A'}`;

    await prisma.expense.create({
      data: {
        label,
        montant: amt,
        categorie: "Remboursement client",
        comptePcg: pcgCode,
        description: desc
      }
    });

    res.json({ 
      success: true, 
      message: `Remboursement de ${amt.toFixed(2)} € enregistré avec succès (${mode}).`,
      stripeRefundId
    });

  } catch (error) {
    console.error("Refund Handler Error:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement du remboursement." });
  }
});

// Suppression du doublon cancel-caution car défini plus haut

// Notifier un intervenant pour ses missions sur une réservation
app.post('/api/admin/reservations/:id/notify-intervenant', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { intervenantId } = req.body;
  
  if (!intervenantId) return res.status(400).json({ error: 'Intervenant ID requis' });

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: {
        missions: { where: { intervenantId: parseInt(intervenantId) } }
      }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation non trouvée' });

    const intervenant = await prisma.intervenant.findUnique({
      where: { id: parseInt(intervenantId) }
    });

    if (!intervenant) return res.status(404).json({ error: 'Intervenant non trouvé' });
    if (reservation.missions.length === 0) return res.status(400).json({ error: 'Aucune mission pour cet intervenant sur cette réservation' });

    let missionsHtml = reservation.missions.map(m => `<li style="margin-bottom: 12px;">${getMissionDetail(m, reservation.dateDebut, reservation.dateFin)}</li>`).join('');
    const totalRemuneration = reservation.missions.reduce((sum, m) => sum + m.montant, 0);

    const backendUrl = process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'));
    const acceptUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/accept`;
    const rejectUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/reject`;

    await sendMail({
      to: intervenant.email,
      subject: "Nouvelles missions assignées - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${intervenant.prenom},</h2>
                    <p>De nouvelles missions vous ont été assignées pour la réservation du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
                    
                    <table width="100%" cellpadding="15" cellspacing="0" border="0" style="background-color: #fff8e1; border-left: 4px solid #FDB913; margin: 25px 0; border-radius: 0 8px 8px 0;">
                      <tr>
                        <td>
                          <p style="margin: 0; font-weight: bold; color: #004B93;">Vos missions :</p>
                          <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                            ${missionsHtml}
                          </ul>
                        </td>
                      </tr>
                    </table>
                    
                    <p>Veuillez confirmer si vous acceptez ces missions :</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background-color: #28a745; border-radius: 6px;">
                                <a href="${acceptUrl}" style="display: inline-block; padding: 15px 30px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">J'accepte</a>
                              </td>
                              <td width="20"></td>
                              <td style="background-color: #dc3545; border-radius: 6px;">
                                <a href="${rejectUrl}" style="display: inline-block; padding: 15px 30px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Je refuse</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <p>Cordialement,<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });

    res.json({ success: true, message: 'Notification envoyée avec succès.' });
  } catch (error) {
    console.error("Erreur notification:", error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification' });
  }
});

// Convertir un devis en réservation (Admin)
app.post('/api/admin/reservations/:id/convert-devis', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statut: 'RESERVE',
        validePar: req.user.email,
        valideLe: new Date()
      }
    });
    res.json({ success: true, reservation });
  } catch (error) {
    console.error("Erreur conversion devis:", error);
    res.status(500).json({ error: "Erreur lors de la conversion du devis." });
  }
});

// Enregistrer un paiement manuel (Admin)
app.post('/api/admin/reservations/:id/manual-payment', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { montant, mode, typePaiement } = req.body; // typePaiement: ACOMPTE or TOTAL

  try {
    const parsedMontant = parseFloat(montant) || 0;
    
    const existing = await prisma.reservation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }

    let targetStatus = existing.statutPaiement;
    const data = {
      modePaiement: mode
    };

    if (typePaiement === 'ACOMPTE') {
      data.montantAcompte = parsedMontant;
      if (existing.statutPaiement === 'SOLDE_PAYE') {
        targetStatus = 'PAYE';
      } else {
        targetStatus = 'ACOMPTE_PAYE';
      }
      if (!existing.montantSolde && existing.prixTotal) {
        data.montantSolde = Math.round((existing.prixTotal - parsedMontant) * 100) / 100;
      }
    } else if (typePaiement === 'SOLDE') {
      data.montantSolde = parsedMontant;
      if (existing.statutPaiement === 'ACOMPTE_PAYE') {
        targetStatus = 'PAYE';
      } else {
        targetStatus = 'SOLDE_PAYE';
      }
      if (!existing.montantAcompte && existing.prixTotal) {
        data.montantAcompte = Math.round((existing.prixTotal - parsedMontant) * 100) / 100;
      }
    } else {
      // TOTAL / TOTALITE
      targetStatus = 'PAYE';
      if (existing.prixTotal) {
        const acomptePart = existing.montantAcompte || Math.round(existing.prixTotal * 0.3 * 100) / 100;
        data.montantAcompte = acomptePart;
        data.montantSolde = Math.round((existing.prixTotal - acomptePart) * 100) / 100;
      }
    }

    data.statutPaiement = targetStatus;
    if (targetStatus === 'PAYE' || targetStatus === 'ACOMPTE_PAYE' || targetStatus === 'SOLDE_PAYE') {
      data.payeLe = existing.payeLe ? existing.payeLe : new Date();
    }
    
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data
    });
    
    res.json({ success: true, reservation });
  } catch (error) {
    console.error("Erreur paiement manuel:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement." });
  }
});

// --- CLIENT PAYMENT ROUTES ---

app.get('/api/payment/info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true, occupants: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien expiré." });
    }
    res.json({
      id: reservation.id,
      clientNom: reservation.client.nom,
      clientEmail: reservation.client.email,
      dateDebut: reservation.dateDebut,
      dateFin: reservation.dateFin,
      chambres: reservation.chambres,
      prixTotal: reservation.prixTotal,
      montantAcompte: reservation.montantAcompte,
      montantSolde: reservation.montantSolde,
      statutPaiement: reservation.statutPaiement,
      modePaiement: reservation.modePaiement,
      structure: reservation.structure,
      repas: reservation.repas
    });
  } catch (error) {
    console.error("Erreur payment info:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la réservation." });
  }
});

app.post('/api/payment/stripe/:token', async (req, res) => {
  const { token } = req.params;
  const { type } = req.body; // 'acompte', 'solde', 'totalite'
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien expiré." });
    }
    if (!reservation.prixTotal) {
      return res.status(400).json({ error: "Le prix total de la réservation n'est pas défini." });
    }

    let amount = 0;
    let productName = '';
    
    if (type === 'acompte') {
      const repasTotal = calculerTotalRepasServeur(reservation.repas);
      const montantHebergement = Math.max(0, reservation.prixTotal - repasTotal);
      amount = reservation.montantAcompte ? reservation.montantAcompte : Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
      productName = repasTotal > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie';
    } else if (type === 'solde') {
      amount = reservation.montantSolde ? reservation.montantSolde : (reservation.prixTotal - (reservation.montantAcompte || 0));
      productName = 'Solde du séjour - Gîte de La Maladrerie';
    } else {
      amount = reservation.prixTotal;
      productName = 'Paiement total du séjour - Gîte de La Maladrerie';
    }

    const stripeCustomer = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const plParams = {
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: productName,
            description: getStripeDescription(reservation)
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reservation.id.toString(), paymentType: type.toUpperCase() }
    };
    if (stripeCustomer) {
      plParams.customer = stripeCustomer;
    } else if (reservation.client.email && reservation.client.email !== 'N/A') {
      plParams.customer_email = reservation.client.email;
    }
    const session = await stripe.checkout.sessions.create(plParams);

    // Save session ID based on type
    const dataUpdate = {};
    if (type === 'acompte') dataUpdate.stripeAcompteId = session.id;
    else if (type === 'solde') dataUpdate.stripeSoldeId = session.id;
    else dataUpdate.stripeSessionId = session.id;

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: dataUpdate
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Erreur Stripe payment session creation:", error);
    res.status(500).json({ error: "Erreur lors de la génération de la session Stripe." });
  }
});

app.post('/api/payment/virement/:token', async (req, res) => {
  const { token } = req.params;
  const { type } = req.body; // 'acompte', 'solde', 'totalite'
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien expiré." });
    }
    if (!reservation.prixTotal) {
      return res.status(400).json({ error: "Le prix total de la réservation n'est pas défini." });
    }

    let amount = 0;
    let label = '';
    if (type === 'acompte') {
      const repasTotal = calculerTotalRepasServeur(reservation.repas);
      const montantHebergement = Math.max(0, reservation.prixTotal - repasTotal);
      amount = reservation.montantAcompte ? reservation.montantAcompte : Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
      label = "Acompte (30% Hébergement" + (repasTotal > 0 ? " + 100% Repas)" : ")");
    } else if (type === 'solde') {
      amount = reservation.montantSolde ? reservation.montantSolde : (reservation.prixTotal - (reservation.montantAcompte || 0));
      label = "Solde (70%)";
    } else {
      amount = reservation.prixTotal;
      label = "Totalité (100%)";
    }

    // Update reservation payment mode
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { modePaiement: 'VIREMENT' }
    });

    const reference = `MUC-${reservation.id}-${type.toUpperCase()}`;
    const bankDetails = {
      iban: process.env.BANK_IBAN || 'FR76 1027 8089 6300 0201 6890 992',
      bic: process.env.BANK_BIC || 'CMCIFR2A',
      holder: process.env.BANK_HOLDER || 'MUC Omnisport',
      bankName: process.env.BANK_NAME || 'Crédit Mutuel - CCM Montpellier Opera'
    };

    // Send email to client
    const adminEmail = reservation.validePar || 'dr.mucomnisports@gmail.com';
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const dateStr = new Date(reservation.dateDebut).toLocaleDateString('fr-FR') + " au " + new Date(reservation.dateFin).toLocaleDateString('fr-FR');

    await sendMail({
      to: reservation.client.email,
      subject: `Instructions de virement - Séjour Gîte de La Maladrerie (Réf: ${reference})`,
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
              <p>Vous avez choisi de régler le paiement de votre séjour par virement bancaire.</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin-top: 0; font-weight: bold; color: #004B93;">Détails du paiement (${label}) :</p>
                <table width="100%" style="font-size: 14px;">
                  <tr><td style="padding: 5px 0;"><strong>Montant :</strong></td><td style="font-weight: bold; font-size: 16px; color: #004B93;">${amount.toFixed(2)} €</td></tr>
                  <tr><td style="padding: 5px 0;"><strong>Libellé/Référence obligatoire :</strong></td><td style="font-weight: bold; color: #d97706; background-color: #fef3c7; padding: 2px 6px; border-radius: 4px;">${reference}</td></tr>
                  <tr><td colspan="2" style="padding: 10px 0 5px 0; border-top: 1px dashed #e2e8f0;"><strong>Coordonnées bancaires :</strong></td></tr>
                  <tr><td style="padding: 3px 0;">Titulaire du compte :</td><td><strong>${bankDetails.holder}</strong></td></tr>
                  <tr><td style="padding: 3px 0;">IBAN :</td><td><strong style="font-family: monospace; font-size: 13px;">${bankDetails.iban}</strong></td></tr>
                  <tr><td style="padding: 3px 0;">BIC :</td><td><strong style="font-family: monospace; font-size: 13px;">${bankDetails.bic}</strong></td></tr>
                  <tr><td style="padding: 3px 0;">Banque :</td><td>${bankDetails.bankName}</td></tr>
                </table>
              </div>

              <p style="font-size: 13px; color: #666; font-style: italic;">
                ⚠️ <strong>Important :</strong> Veuillez indiquer exactement la référence <strong>${reference}</strong> dans le motif ou libellé de votre virement afin que nous puissions identifier et valider votre paiement rapidement.
              </p>

              <p>Dès réception des fonds sur notre compte, votre paiement sera validé et vous recevrez un e-mail de confirmation.</p>
              
              ${adminSignatureHTML}
            </td></tr>
          </table></td></tr>
        </table>
      `
    });

    // Send email to admin
    const targetAdminEmail = await getAdminEmailsForPreference('notifPaymentReceived', ['dr.mucomnisports@gmail.com']);
    const recipientEmails = `${targetAdminEmail}, valerie.hostein@mucomnisports.fr, johanna.journet@mucomnisports.fr`;
    await sendMail({
      to: recipientEmails,
      subject: `🏦 [VIREMENT INTENTION] ${reservation.structure ? reservation.structure + ' / ' : ''}${reservation.client.nom} - ${amount.toFixed(2)} €`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
          <!-- Header banner with logo text / colors -->
          <div style="background-color: #004B93; padding: 24px; text-align: center; border-bottom: 4px solid #FFD700;">
            <span style="color: #FFD700; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">Gîte de la Maladrerie</span>
            <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">🏦 Intention de virement</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
              Bonjour,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Le client <strong>${reservation.client.nom}</strong> (${reservation.client.email})${reservation.structure ? ` (Structure: <strong>${reservation.structure}</strong>)` : ''} a indiqué son intention de régler par virement bancaire pour la réservation <strong>#${reservation.id}</strong> (séjour du ${dateStr}).
            </p>

            <div style="margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
              <h4 style="margin: 0 0 15px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Détails de la réservation :</h4>
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #334155;">
                <tr>
                  <td width="40%" style="padding: 6px 0; color: #64748b; font-weight: bold;">Client :</td>
                  <td style="padding: 6px 0; font-weight: bold;">${reservation.client.nom}</td>
                </tr>
                ${reservation.structure ? `
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Structure :</td>
                  <td style="padding: 6px 0; font-weight: bold;">${reservation.structure}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Réf. Réservation :</td>
                  <td style="padding: 6px 0; font-weight: bold;">#${reservation.id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Type de règlement :</td>
                  <td style="padding: 6px 0; font-weight: bold;">${label}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Montant attendu :</td>
                  <td style="padding: 6px 0; font-weight: 800; color: #004B93; font-size: 15px;">${amount.toFixed(2)} €</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Référence de virement :</td>
                  <td style="padding: 6px 0;"><span style="font-weight: bold; color: #b45309; background-color: #fef3c7; padding: 3px 8px; border-radius: 4px; border: 1px solid #fde68a; font-family: monospace;">${reference}</span></td>
                </tr>
              </table>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #475569; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin-bottom: 24px;">
              💡 <strong>Action attendue :</strong> Cette réservation est marquée comme "Virement attendu". Une fois le virement reçu sur votre compte bancaire, cliquez sur le bouton ci-dessous pour valider le virement directement dans le système, ou accédez au Tableau de Bord.
            </p>
            
            <p style="text-align: center; margin-top: 25px; margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
              <a href="${BACKEND_URL}/api/payment/virement/validate-by-link?token=${reservation.tokenModification}&type=${type}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">✅ Valider le paiement (Marquer comme payé)</a>
              <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.2); margin-top: 10px;">Accéder au Tableau de Bord Admin</a>
            </p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
            Cet e-mail automatique est envoyé par le système de réservation du Gîte de la Maladrerie.
          </div>
        </div>
      `
    });

    res.json({ success: true, reference, bankDetails, amount });
  } catch (error) {
    console.error("Erreur virement intent:", error);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de l'intention de virement." });
  }
});

// Choix paiement solde à l'arrivée par le client
app.get('/api/payment/pay-on-arrival/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).send("Réservation introuvable ou lien expiré.");
    }
    
    // Mettre à jour souhaitePayerSoldeArrivee
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { 
        souhaitePayerSoldeArrivee: true
      }
    });

    // Envoyer une notification e-mail à l'admin pour l'avertir
    try {
      const targetAdminEmail = await getAdminEmailsForPreference('notifPaymentReceived', ['dr.mucomnisports@gmail.com']);
      const recipientEmails = `${targetAdminEmail}, valerie.hostein@mucomnisports.fr, johanna.journet@mucomnisports.fr`;
      await sendMail({
        to: recipientEmails,
        subject: `🔔 [SOLDE SUR PLACE] Résa #${reservation.id} - ${reservation.client.nom} paiera sur place`,
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #004B93; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0; font-size: 22px;">Solde à l'arrivée choisi</h2>
                      <p style="font-size: 16px;">Bonjour,</p>
                      <p style="font-size: 16px;">Le client <strong>${reservation.client.nom}</strong> a indiqué qu'il souhaite <strong>régler le solde de son séjour le jour de son arrivée</strong> sur les lieux.</p>
                      
                      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; border-left: 4px solid #004B93; margin: 25px 0;">
                        <p style="margin-top: 0; font-weight: bold; color: #004B93;">Détails du séjour :</p>
                        <ul style="margin-bottom: 0; padding-left: 20px; font-size: 15px;">
                          <li><strong>Réservation :</strong> #${reservation.id}</li>
                          <li><strong>Dates :</strong> du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</li>
                          <li><strong>Montant du solde à collecter :</strong> ${(reservation.montantSolde || (reservation.prixTotal - (reservation.montantAcompte || 0))).toFixed(2)} €</li>
                        </ul>
                      </div>

                      <p style="font-size: 15px; color: #555555; font-style: italic;">Le système a désactivé les relances automatiques de solde pour cette réservation. Le solde sera à collecter le jour de l'arrivée.</p>
                      
                      <div style="text-align: center; margin-top: 40px;">
                        <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">Accéder au Tableau de Bord Admin</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
    } catch (mailErr) {
      console.error("Erreur envoi notification admin choix paiement arrivée:", mailErr);
    }

    // Rediriger le client vers le frontend avec un paramètre type=arrivee
    res.redirect(`${FRONTEND_URL}/payment-success?type=arrivee&token=${token}`);
  } catch (error) {
    console.error("Erreur lors du choix paiement sur place:", error);
    res.status(500).send("Une erreur est survenue lors de l'enregistrement de votre choix.");
  }
});

app.get('/api/payment/virement/validate-by-link', async (req, res) => {
  const { token, type } = req.query; // type: 'acompte', 'solde', 'totalite'
  
  if (!token || !type) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erreur de validation</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc; color: #1e293b; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; }
          h1 { color: #ef4444; font-size: 24px; font-weight: 800; margin-bottom: 10px; }
          p { font-size: 15px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size: 48px; margin-bottom: 15px;">❌</div>
          <h1>Paramètres manquants</h1>
          <p>Le jeton de validation ou le type de paiement est manquant.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true, intervenant: true }
    });

    if (!reservation) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Réservation introuvable</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc; color: #1e293b; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; }
            h1 { color: #ef4444; font-size: 24px; font-weight: 800; margin-bottom: 10px; }
            p { font-size: 15px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="font-size: 48px; margin-bottom: 15px;">❌</div>
            <h1>Réservation introuvable</h1>
            <p>La réservation associée à ce lien de validation n'a pas pu être trouvée.</p>
          </div>
        </body>
        </html>
      `);
    }

    let amount = 0;
    let label = '';
    let targetStatus = '';
    let nextPaymentType = '';

    if (type === 'acompte') {
      const repasTotal = calculerTotalRepasServeur(reservation.repas);
      const montantHebergement = Math.max(0, reservation.prixTotal - repasTotal);
      amount = reservation.montantAcompte ? reservation.montantAcompte : Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
      label = "Acompte (30% Hébergement" + (repasTotal > 0 ? " + 100% Repas)" : ")");
      targetStatus = reservation.statutPaiement === 'SOLDE_PAYE' ? 'PAYE' : 'ACOMPTE_PAYE';
      nextPaymentType = 'acompte';
    } else if (type === 'solde') {
      amount = reservation.montantSolde ? reservation.montantSolde : (reservation.prixTotal - (reservation.montantAcompte || 0));
      label = "Solde (70%)";
      targetStatus = reservation.statutPaiement === 'ACOMPTE_PAYE' ? 'PAYE' : 'SOLDE_PAYE';
      nextPaymentType = 'solde';
    } else {
      amount = reservation.prixTotal;
      label = "Totalité (100%)";
      targetStatus = 'PAYE';
      nextPaymentType = 'totalite';
    }

    if (reservation.statutPaiement === 'PAYE' || 
       (type === 'acompte' && reservation.statutPaiement === 'ACOMPTE_PAYE') || 
       (type === 'solde' && reservation.statutPaiement === 'SOLDE_PAYE')) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Paiement Déjà Validé</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc; color: #1e293b; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; }
            h1 { color: #0f172a; font-size: 24px; font-weight: 800; margin-bottom: 10px; }
            p { font-size: 15px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
            .badge { background-color: #fef3c7; color: #b45309; font-weight: bold; padding: 6px 12px; border-radius: 9999px; display: inline-block; font-size: 14px; margin-bottom: 20px; border: 1px solid #fde68a; }
            .btn { background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="font-size: 48px; margin-bottom: 15px;">ℹ️</div>
            <h1>Paiement Déjà Validé</h1>
            <p>Ce paiement par virement pour la réservation #${reservation.id} (${label}) a déjà été enregistré.</p>
            <div class="badge">Statut actuel : ${reservation.statutPaiement}</div>
            <br/>
            <a href="${FRONTEND_URL}/admin" class="btn">Aller au Tableau de Bord</a>
          </div>
        </body>
        </html>
      `);
    }

    let stripeSoldeId = undefined;
    let balancePaymentLink = '';
    if (targetStatus === 'ACOMPTE_PAYE') {
      try {
        const soldeSession = await createStripeSessionForReservation(reservation, 'solde');
        stripeSoldeId = soldeSession.id;
        balancePaymentLink = soldeSession.url;
      } catch (err) {
        console.error("Erreur génération lien solde lors de la validation par virement:", err);
      }
    }

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        statutPaiement: targetStatus,
        statut: 'RESERVE',
        stripeSoldeId: stripeSoldeId || undefined,
        modePaiement: 'VIREMENT',
        payeLe: reservation.payeLe ? reservation.payeLe : new Date()
      },
      include: { client: true, intervenant: true }
    });

    console.log(`Validation Virement par lien : Réservation #${reservation.id} mise à jour à ${targetStatus}`);
    // Désactivé : remplacé par l'envoi hebdomadaire groupé (cron cuisine du jeudi)
    // await sendCuisineEmailIfNeeded(reservation.id);
    await sendPaymentConfirmationEmails(updatedReservation, nextPaymentType, amount, balancePaymentLink);

    if (updatedReservation.codePromo) {
      try {
        await prisma.promoCode.update({
          where: { code: updatedReservation.codePromo.toUpperCase() },
          data: { usageActuel: { increment: 1 } }
        });
      } catch (promoErr) {
        console.error("Erreur incrémentation code promo:", promoErr);
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Paiement Validé avec Succès</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc; color: #1e293b; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; }
          h1 { color: #10b981; font-size: 24px; font-weight: 800; margin-bottom: 10px; }
          p { font-size: 15px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
          .details { background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: left; margin-bottom: 25px; }
          .details table { width: 100%; border-collapse: collapse; font-size: 14px; }
          .details td { padding: 8px 0; }
          .btn { background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
          <h1>Paiement Enregistré</h1>
          <p>Le virement de <strong>${amount.toFixed(2)} €</strong> (${label}) pour la réservation de <strong>${reservation.client.nom}</strong> (#${reservation.id}) a bien été validé.</p>
          
          <div class="details">
            <table>
              <tr><td style="color: #64748b;">Réservation :</td><td style="font-weight: bold; text-align: right;">#${reservation.id}</td></tr>
              <tr><td style="color: #64748b;">Client :</td><td style="font-weight: bold; text-align: right;">${reservation.client.nom}</td></tr>
              <tr><td style="color: #64748b;">Nouveau Statut :</td><td style="font-weight: bold; text-align: right; color: #10b981;">Payé (${targetStatus})</td></tr>
            </table>
          </div>
          
          <a href="${FRONTEND_URL}/admin" class="btn">Accéder au Tableau de Bord</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Erreur validation virement par lien:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erreur serveur</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f8fafc; color: #1e293b; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; }
          h1 { color: #ef4444; font-size: 24px; font-weight: 800; margin-bottom: 10px; }
          p { font-size: 15px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size: 48px; margin-bottom: 15px;">❌</div>
          <h1>Erreur interne</h1>
          <p>Une erreur est survenue lors de la validation du virement.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// --- CLIENT MODIFICATION ROUTES ---

app.get('/api/reservation/modify/info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true, occupants: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien expiré." });
    }
    res.json(reservation);
  } catch (error) {
    console.error("Erreur modify info:", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la réservation." });
  }
});

app.post('/api/reservation/modify/recalculate/:token', async (req, res) => {
  const { token } = req.params;
  const { dateDebut, dateFin, chambres, chambresDetails, options, repas, salles } = req.body;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    const newPrice = await recalculerPrix(
      dateDebut,
      dateFin,
      chambres,
      chambresDetails,
      options,
      reservation.codePromo,
      repas,
      salles
    );
    res.json({
      originalPrice: reservation.prixTotal,
      newPrice: newPrice,
      difference: Math.round((newPrice - reservation.prixTotal) * 100) / 100
    });
  } catch (error) {
    console.error("Erreur recalcul:", error);
    res.status(500).json({ error: "Erreur lors du calcul du prix." });
  }
});

app.post('/api/reservation/modify/:token', async (req, res) => {
  const { token } = req.params;
  const { dateDebut, dateFin, chambres, chambresDetails, options, repas, salles, occupants } = req.body;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenModification: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    const proposedPrice = await recalculerPrix(
      dateDebut,
      dateFin,
      chambres,
      chambresDetails,
      options,
      reservation.codePromo,
      repas,
      salles
    );

    const modificationProposed = {
      dateDebut,
      dateFin,
      chambres,
      chambresDetails,
      options,
      repas,
      salles,
      occupants,
      prixTotal: proposedPrice
    };

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        modificationProposed: modificationProposed
      }
    });

    const adminEmail = await getAdminEmailsForPreference('notifModificationRequest', [reservation.validePar]);
    const dDebutOld = new Date(reservation.dateDebut).toLocaleDateString('fr-FR');
    const dFinOld = new Date(reservation.dateFin).toLocaleDateString('fr-FR');
    const dDebutNew = new Date(dateDebut).toLocaleDateString('fr-FR');
    const dFinNew = new Date(dateFin).toLocaleDateString('fr-FR');

    const getYYYYMMDD = (d) => {
      if (!d) return '';
      try {
        return new Date(d).toISOString().split('T')[0];
      } catch (e) {
        return '';
      }
    };
    
    // Comparaison des dates
    const datesChanged = getYYYYMMDD(reservation.dateDebut) !== getYYYYMMDD(dateDebut) || getYYYYMMDD(reservation.dateFin) !== getYYYYMMDD(dateFin);

    // Comparaison des chambres et de la répartition
    const formatChambresDetails = (chambresList, details) => {
      if (!chambresList || chambresList.length === 0) return "Aucune chambre";
      return chambresList.map(chId => {
        const info = details?.[chId] || details?.[String(chId)] || {};
        const adults = info.adultes || 0;
        const kids = info.mineurs || info.enfants || 0;
        return `Chambre ${chId} (${adults} Ad. ${kids > 0 ? `, ${kids} Enf.` : ''})`;
      }).join(', ');
    };
    const chDetailsOld = formatChambresDetails(reservation.chambres, reservation.chambresDetails);
    const chDetailsNew = formatChambresDetails(chambres, chambresDetails);
    const chambresChanged = chDetailsOld !== chDetailsNew;

    // Comparaison des options
    const formatOptionsList = (opt) => {
      if (!opt) return "Aucun";
      const list = [];
      if (opt.litsFaits) list.push("Lits faits");
      if (opt.lingeFourni) list.push("Linge de toilette");
      if (opt.menage) list.push("Ménage");
      return list.join(', ') || "Aucun";
    };
    const optOld = formatOptionsList(reservation.options);
    const optNew = formatOptionsList(options);
    const optionsChanged = optOld !== optNew;

    // Comparaison des salles
    const formatSallesList = (sl) => {
      if (!sl) return "Aucune";
      const list = [];
      if (sl.salle15) list.push("Salle 15 pers.");
      if (sl.salle12) list.push("Salle 12 pers.");
      return list.join(', ') || "Aucune";
    };
    const sallesOld = formatSallesList(reservation.salles);
    const sallesNew = formatSallesList(salles);
    const sallesChanged = sallesOld !== sallesNew;

    // Comparaison des repas
    const formatMealsCount = (mealsObj) => {
      if (!mealsObj || Object.keys(mealsObj).length === 0) return "Aucun";
      let petitDej = 0, dej = 0, diner = 0;
      Object.values(mealsObj).forEach(day => {
        if (day.PETIT_DEJ) petitDej += (day.PETIT_DEJ.ADULTE || 0) + (day.PETIT_DEJ.ENFANT_MOINS_12 || 0) + (day.PETIT_DEJ.ENFANT_MOINS_5 || 0);
        if (day.DEJEUNER) dej += (day.DEJEUNER.ADULTE || 0) + (day.DEJEUNER.ENFANT_MOINS_12 || 0) + (day.DEJEUNER.ENFANT_MOINS_5 || 0);
        if (day.DINER) diner += (day.DINER.ADULTE || 0) + (day.DINER.ENFANT_MOINS_12 || 0) + (day.DINER.ENFANT_MOINS_5 || 0);
      });
      const parts = [];
      if (petitDej) parts.push(`${petitDej} P-Dej`);
      if (dej) parts.push(`${dej} Dej`);
      if (diner) parts.push(`${diner} Din`);
      return parts.join(', ') || "Aucun";
    };
    const repasOld = formatMealsCount(reservation.repas);
    const repasNew = formatMealsCount(repas);
    const repasChanged = repasOld !== repasNew;

    // Comparaison détaillée des Occupants
    const curOccList = reservation.occupants || [];
    const propOccList = occupants || [];
    const maxLen = Math.max(curOccList.length, propOccList.length);
    const occupantsDiffs = [];

    for (let i = 0; i < maxLen; i++) {
      const cur = curOccList[i];
      const prop = propOccList[i];
      
      if (cur && !prop) {
        occupantsDiffs.push({
          status: 'removed',
          text: `❌ Supprimé : ${cur.nom} ${cur.prenom} (${cur.estAdulte ? 'Adulte' : `${cur.age} ans`}) - ${cur.nationalite || 'Française'}`
        });
      } else if (!cur && prop) {
        const nationaliteStr = prop.nationalite === true || prop.nationalite === 'Française' ? 'Française' : (prop.nationalite === false || prop.nationalite === 'Étrangère' ? 'Étrangère' : prop.nationalite || 'Française');
        occupantsDiffs.push({
          status: 'added',
          text: `🟢 Ajouté : ${prop.nom} ${prop.prenom} (${prop.estAdulte ? 'Adulte' : `${prop.age} ans`}) - ${nationaliteStr}`
        });
      } else {
        const nationaliteCur = cur.nationalite || 'Française';
        const nationaliteProp = prop.nationalite === true || prop.nationalite === 'Française' ? 'Française' : (prop.nationalite === false || prop.nationalite === 'Étrangère' ? 'Étrangère' : prop.nationalite || 'Française');
        
        const curStr = `${cur.nom} ${cur.prenom} (${cur.estAdulte ? 'Adulte' : `${cur.age} ans`}) - ${nationaliteCur}`;
        const propStr = `${prop.nom} ${prop.prenom} (${prop.estAdulte ? 'Adulte' : `${prop.age} ans`}) - ${nationaliteProp}`;
        
        const nameChanged = cur.nom !== prop.nom || cur.prenom !== prop.prenom;
        const typeChanged = cur.estAdulte !== prop.estAdulte || cur.age !== prop.age;
        const natChanged = nationaliteCur !== nationaliteProp;
        
        if (nameChanged || typeChanged || natChanged) {
          const modfs = [];
          if (nameChanged) modfs.push(`Nom : ${prop.nom} ${prop.prenom} (était ${cur.nom} ${cur.prenom})`);
          if (typeChanged) modfs.push(`Type/Âge : ${prop.estAdulte ? 'Adulte' : `${prop.age} ans`} (était ${cur.estAdulte ? 'Adulte' : `${cur.age} ans`})`);
          if (natChanged) modfs.push(`Nat. : ${nationaliteProp} (était ${nationaliteCur})`);
          occupantsDiffs.push({
            status: 'changed',
            text: `🟠 Modifié : ${modfs.join(', ')}`
          });
        } else {
          occupantsDiffs.push({
            status: 'unchanged',
            text: `Identique : ${curStr}`
          });
        }
      }
    }

    const priceDifference = proposedPrice - (reservation.prixTotal || 0);
    const priceChanged = priceDifference !== 0;

    await sendMail({
      to: adminEmail,
      subject: `⚡ Demande de modification de réservation - ${reservation.client.nom}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
          <!-- Header banner with logo text / colors -->
          <div style="background-color: #004B93; padding: 24px; text-align: center; border-bottom: 4px solid #FFD700;">
            <span style="color: #FFD700; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">Gîte de la Maladrerie</span>
            <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Demande de modification de séjour</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
              Bonjour,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Le client <strong>${reservation.client.nom}</strong> a soumis une demande de modification pour sa réservation <strong>#${reservation.id}</strong>.
            </p>

            <div style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; padding: 16px; border: 1px dashed #e2e8f0;">
              <h4 style="margin: 0 0 10px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Résumé de la demande :</h4>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
                ${datesChanged ? '<li>📅 Dates modifiées</li>' : ''}
                ${chambresChanged ? '<li>🛌 Chambres ou répartition modifiée</li>' : ''}
                ${optionsChanged ? '<li>⚙ Options modifiées</li>' : ''}
                ${sallesChanged ? '<li>💼 Salles de réunion modifiées</li>' : ''}
                ${repasChanged ? '<li>🍽 Restauration modifiée</li>' : ''}
                ${occupantsDiffs.some(d => d.status !== 'unchanged') ? '<li>👥 Liste des voyageurs mise à jour</li>' : ''}
                ${priceChanged ? `<li>💰 Prix : <strong>${proposedPrice.toFixed(2)} €</strong> (Écart: <strong style="color: ${priceDifference > 0 ? '#b45309' : '#15803d'};">${priceDifference > 0 ? '+' : ''}${priceDifference.toFixed(2)} €</strong>)</li>` : '<li>💰 Tarif identique</li>'}
              </ul>
            </div>
            
            <h3 style="color: #004B93; font-size: 15px; font-weight: 800; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px;">Comparatif détaillé</h3>
            
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                  <th align="left" style="color: #475569; font-weight: bold;">Élément</th>
                  <th align="left" style="color: #475569; font-weight: bold;">Actuel</th>
                  <th align="left" style="color: #004B93; font-weight: bold;">Proposé</th>
                </tr>
              </thead>
              <tbody>
                <!-- Dates -->
                <tr style="border-bottom: 1px solid #e2e8f0; ${datesChanged ? 'background-color: #ecfdf5;' : ''}">
                  <td style="padding: 10px; font-weight: bold; color: #475569;">Dates</td>
                  <td style="padding: 10px; color: #64748b; ${datesChanged ? 'text-decoration: line-through;' : ''}">Du ${dDebutOld} au ${dFinOld}</td>
                  <td style="padding: 10px; font-weight: bold; color: ${datesChanged ? '#047857' : '#004B93'};">Du ${dDebutNew} au ${dFinNew}</td>
                </tr>
                <!-- Chambres -->
                <tr style="border-bottom: 1px solid #e2e8f0; ${chambresChanged ? 'background-color: #ecfdf5;' : ''}">
                  <td style="padding: 10px; font-weight: bold; color: #475569;">Chambres</td>
                  <td style="padding: 10px; color: #64748b; ${chambresChanged ? 'text-decoration: line-through;' : ''}">${chDetailsOld}</td>
                  <td style="padding: 10px; font-weight: bold; color: ${chambresChanged ? '#047857' : '#004B93'};">${chDetailsNew}</td>
                </tr>
                <!-- Salles -->
                <tr style="border-bottom: 1px solid #e2e8f0; ${sallesChanged ? 'background-color: #ecfdf5;' : ''}">
                  <td style="padding: 10px; font-weight: bold; color: #475569;">Salles</td>
                  <td style="padding: 10px; color: #64748b; ${sallesChanged ? 'text-decoration: line-through;' : ''}">${sallesOld}</td>
                  <td style="padding: 10px; font-weight: bold; color: ${sallesChanged ? '#047857' : '#004B93'};">${sallesNew}</td>
                </tr>
                <!-- Options -->
                <tr style="border-bottom: 1px solid #e2e8f0; ${optionsChanged ? 'background-color: #ecfdf5;' : ''}">
                  <td style="padding: 10px; font-weight: bold; color: #475569;">Options</td>
                  <td style="padding: 10px; color: #64748b; ${optionsChanged ? 'text-decoration: line-through;' : ''}">${optOld}</td>
                  <td style="padding: 10px; font-weight: bold; color: ${optionsChanged ? '#047857' : '#004B93'};">${optNew}</td>
                </tr>
                <!-- Repas -->
                <tr style="border-bottom: 1px solid #e2e8f0; ${repasChanged ? 'background-color: #ecfdf5;' : ''}">
                  <td style="padding: 10px; font-weight: bold; color: #475569;">Repas</td>
                  <td style="padding: 10px; color: #64748b; ${repasChanged ? 'text-decoration: line-through;' : ''}">${repasOld}</td>
                  <td style="padding: 10px; font-weight: bold; color: ${repasChanged ? '#047857' : '#004B93'};">${repasNew}</td>
                </tr>
                <!-- Prix total -->
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <td style="padding: 12px 10px; font-weight: 800; color: #334155;">Total TTC</td>
                  <td style="padding: 12px 10px; color: #64748b; font-weight: bold;">${(reservation.prixTotal || 0).toFixed(2)} €</td>
                  <td style="padding: 12px 10px; font-weight: 800; color: #004B93;">
                    ${proposedPrice.toFixed(2)} €
                    ${priceChanged ? `<span style="font-size: 11px; padding: 2px 6px; border-radius: 10px; margin-left: 6px; display: inline-block; font-weight: bold; background-color: ${priceDifference > 0 ? '#fef3c7; color: #b45309;' : '#d1fae5; color: #065f46;'}">${priceDifference > 0 ? '+' : ''}${priceDifference.toFixed(2)} €</span>` : ''}
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Occupants comparison details if any changes -->
            ${occupantsDiffs.some(d => d.status !== 'unchanged') ? `
              <h3 style="color: #004B93; font-size: 15px; font-weight: 800; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px;">Détails des Voyageurs</h3>
              <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 12px; border-collapse: collapse;">
                  <tbody>
                    ${occupantsDiffs.map((occ, i) => `
                      <tr style="border-bottom: 1px solid #f5f5f4; ${occ.status === 'added' ? 'background-color: #f0fdf4; color: #166534;' : occ.status === 'removed' ? 'background-color: #fef2f2; color: #991b1b; text-decoration: line-through;' : occ.status === 'changed' ? 'background-color: #fffbeb; color: #92400e;' : ''}">
                        <td style="padding: 6px 10px; font-weight: bold; width: 30px;">#${i+1}</td>
                        <td style="padding: 6px 10px;">${occ.text}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <p style="margin-top: 30px; margin-bottom: 25px; font-size: 14px; line-height: 1.6; color: #334155; border-top: 1px solid #f1f5f9; padding-top: 20px;">
              Veuillez vous connecter à l'espace administrateur pour valider ou refuser cette modification.
            </p>
            
            <p style="text-align: center; margin-top: 25px; margin-bottom: 15px;">
              <a href="${FRONTEND_URL}/admin" style="background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.2);">Accéder au Tableau de Bord Admin</a>
            </p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
            Cet e-mail automatique est envoyé par le système de réservation du Gîte de la Maladrerie.
          </div>
        </div>
      `
    });

    res.json({ success: true, message: "Demande de modification soumise à l'administrateur." });
  } catch (error) {
    console.error("Erreur soumission modify:", error);
    res.status(500).json({ error: "Erreur lors de la soumission de la modification." });
  }
});

// --- ADMIN MODIFICATION MANAGEMENT ROUTES ---

app.post('/api/admin/reservations/:id/accept-modification', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    if (!reservation.modificationProposed) {
      return res.status(400).json({ error: "Aucune modification proposée pour cette réservation." });
    }

    const proposed = reservation.modificationProposed;
    const newTotal = proposed.prixTotal;
    const repasTotal = calculerTotalRepasServeur(proposed.repas);
    const montantHebergement = Math.max(0, newTotal - repasTotal);
    const proposedAcompte = Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    const proposedSolde = Math.round((newTotal - proposedAcompte) * 100) / 100;

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        dateDebut: new Date(proposed.dateDebut),
        dateFin: new Date(proposed.dateFin),
        chambres: proposed.chambres,
        chambresDetails: proposed.chambresDetails,
        options: proposed.options,
        repas: proposed.repas,
        salles: proposed.salles,
        prixTotal: newTotal,
        montantAcompte: reservation.statutPaiement === 'PAYE' ? 0 : proposedAcompte,
        montantSolde: reservation.statutPaiement === 'PAYE' ? newTotal : proposedSolde,
        modificationProposed: null
      },
      include: { client: true }
    });

    await prisma.occupant.deleteMany({
      where: { reservationId: reservation.id }
    });

    if (proposed.occupants && proposed.occupants.length > 0) {
      await prisma.occupant.createMany({
        data: proposed.occupants.map(occ => {
          const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
          let occNom = occ.nom;
          let occPrenom = occ.prenom;
          if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
            occNom = "Mineur";
            occPrenom = "";
          }
          const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
          let nationalite = occ.nationalite || 'Française';
          return {
            reservationId: reservation.id,
            nom: occNom || '',
            prenom: occPrenom || '',
            estAdulte,
            age,
            nationalite
          };
        })
      });
    }

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(reservation.tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: "Confirmation de modification de votre séjour - Gîte de La Maladrerie",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #004B93; margin-top: 0;">Séjour mis à jour avec succès</h2>
          <p>Bonjour ${reservation.client.nom},</p>
          <p>Nous vous confirmons que votre demande de modification pour votre séjour au <strong>Gîte de La Maladrerie</strong> a été acceptée et enregistrée par votre conseiller.</p>
          
          <table width="100%" cellpadding="10" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; margin: 20px 0;">
            <tr>
              <td><strong>Période :</strong></td>
              <td>Du ${new Date(proposed.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(proposed.dateFin).toLocaleDateString('fr-FR')}</td>
            </tr>
            <tr>
              <td><strong>Chambres :</strong></td>
              <td>${proposed.chambres.join(', ')}</td>
            </tr>
            <tr>
              <td><strong>Nouveau montant total :</strong></td>
              <td style="font-weight: bold; color: #004B93;">${newTotal.toFixed(2)} €</td>
            </tr>
          </table>

          <p>Vos documents et échéances de paiement ont été mis à jour en conséquence. Si un ajustement de paiement est nécessaire, notre équipe prendra contact avec vous ou vous recevrez un lien dédié.</p>
          
          ${modificationLinkHTML}
          
          <p style="margin-top: 25px;">Nous restons à votre entière disposition.</p>
          
          ${adminSignatureHTML}
        </div>
      `
    });

    res.json({ success: true, reservation: updatedReservation });
  } catch (error) {
    console.error("Erreur accept modification:", error);
    res.status(500).json({ error: "Erreur lors de la validation de la modification." });
  }
});

app.post('/api/admin/reservations/:id/reject-modification', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    if (!reservation.modificationProposed) {
      return res.status(400).json({ error: "Aucune modification proposée pour cette réservation." });
    }

    const proposed = reservation.modificationProposed;

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        modificationProposed: null
      }
    });

    const adminEmail = reservation.validePar || req.user.email || 'david.roujet@mucomnisports.fr';
    const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
    const modificationLinkHTML = getModificationLinkHTML(reservation.tokenModification);

    await sendMail({
      to: reservation.client.email,
      subject: "Information concernant votre demande de modification - Gîte de La Maladrerie",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #dc2626; margin-top: 0;">Demande de modification non validée</h2>
          <p>Bonjour ${reservation.client.nom},</p>
          <p>Nous avons bien reçu votre demande de modification de séjour du <strong>${new Date(proposed.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(proposed.dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
          <p>Malheureusement, après étude de votre dossier par votre conseiller, cette modification n'a pas pu être validée (pour des raisons de disponibilité ou de contraintes logistiques).</p>
          <p>Votre réservation initiale reste <strong>active et inchangée</strong> aux conditions initialement prévues.</p>
          
          ${modificationLinkHTML}
          
          <p style="margin-top: 25px;">N'hésitez pas à contacter votre conseiller pour échanger sur vos besoins.</p>
          
          ${adminSignatureHTML}
        </div>
      `
    });

    res.json({ success: true, reservation: updatedReservation });
  } catch (error) {
    console.error("Erreur reject modification:", error);
    res.status(500).json({ error: "Erreur lors du rejet de la modification." });
  }
});

// ==== PORTAIL INTERVENANT ====

// Connexion Intervenant (vérification email)
app.post('/api/intervenant/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "L'e-mail est requis." });
  try {
    const intervenant = await prisma.intervenant.findFirst({
      where: { email: email.trim().toLowerCase() }
    });
    
    if (!intervenant) {
      return res.status(404).json({ error: "Aucun compte trouvé avec cet e-mail." });
    }
    
    res.json({ 
      success: true, 
      intervenant: { 
        id: intervenant.id, 
        nom: intervenant.nom, 
        prenom: intervenant.prenom, 
        email: intervenant.email 
      }
    });
  } catch (error) {
    console.error("Erreur login intervenant:", error);
    res.status(500).json({ error: "Erreur lors de la connexion." });
  }
});

// Récupérer les missions d'un intervenant
app.get('/api/intervenant/:id/missions', async (req, res) => {
  const { id } = req.params;
  try {
    const missions = await prisma.mission.findMany({
      where: { intervenantId: parseInt(id) },
      include: {
        reservation: {
          include: { client: true }
        }
      },
      orderBy: {
        reservation: { dateDebut: 'asc' }
      }
    });
    
    res.json(missions);
  } catch (error) {
    console.error("Erreur recup missions intervenant:", error);
    res.status(500).json({ error: "Erreur lors de la récupération des missions." });
  }
});

// Accepter toutes les missions d'un intervenant pour une réservation
app.get('/api/reservations/:id/intervenants/:intervenantId/accept', async (req, res) => {
  const { id, intervenantId } = req.params;
  try {
    await prisma.mission.updateMany({
      where: { 
        reservationId: parseInt(id),
        intervenantId: parseInt(intervenantId)
      },
      data: { statut: 'ACCEPTEE' }
    });
    const intervenant = await prisma.intervenant.findUnique({ where: { id: parseInt(intervenantId) }});
    const reservation = await prisma.reservation.findUnique({ where: { id: parseInt(id) }});

    // Envoyer mail à  l'admin
    try {
      const adminEmail = await getAdminEmailsForPreference('notifIntervenantMissions', 
        (reservation?.validePar && reservation.validePar.includes('@')) ? [reservation.validePar] : []
      );
      await sendMail({
        to: adminEmail,
        subject: `Missions acceptées par ${intervenant ? intervenant.prenom + ' ' + intervenant.nom : 'un intervenant'}`,
        html: `
          <div style="font-family: sans-serif;">
            <p>Bonjour,</p>
            <p>L'intervenant <strong>${intervenant ? intervenant.prenom + ' ' + intervenant.nom : ''}</strong> a accepté ses missions pour la réservation du <strong>${reservation ? new Date(reservation.dateDebut).toLocaleDateString('fr-FR') : ''} au ${reservation ? new Date(reservation.dateFin).toLocaleDateString('fr-FR') : ''}</strong>.</p>
            <p>Vous pouvez consulter les détails sur l'espace administration.</p>
          </div>
        `
      });
    } catch (err) {
      console.error("Erreur envoi email admin acceptation mission:", err);
    }

    res.send(generateFeedbackHTML(
      "Missions acceptées !",
      `Merci ${intervenant ? intervenant.prenom : ''}, toutes vos missions pour cette réservation ont bien été acceptées.`,
      true
    ));
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de l'acceptation");
  }
});

// Refuser toutes les missions d'un intervenant pour une réservation
app.get('/api/reservations/:id/intervenants/:intervenantId/reject', async (req, res) => {
  const { id, intervenantId } = req.params;
  try {
    await prisma.mission.updateMany({
      where: { 
        reservationId: parseInt(id),
        intervenantId: parseInt(intervenantId)
      },
      data: { statut: 'REFUSEE' }
    });
    const intervenant = await prisma.intervenant.findUnique({ where: { id: parseInt(intervenantId) }});
    const reservation = await prisma.reservation.findUnique({ where: { id: parseInt(id) }});

    // Envoyer mail à  l'admin
    try {
      const adminEmail = await getAdminEmailsForPreference('notifIntervenantMissions', 
        (reservation?.validePar && reservation.validePar.includes('@')) ? [reservation.validePar] : []
      );
      await sendMail({
        to: adminEmail,
        subject: `Missions refusées par ${intervenant ? intervenant.prenom + ' ' + intervenant.nom : 'un intervenant'}`,
        html: `
          <div style="font-family: sans-serif;">
            <p>Bonjour,</p>
            <p>L'intervenant <strong>${intervenant ? intervenant.prenom + ' ' + intervenant.nom : ''}</strong> a refusé ses missions pour la réservation du <strong>${reservation ? new Date(reservation.dateDebut).toLocaleDateString('fr-FR') : ''} au ${reservation ? new Date(reservation.dateFin).toLocaleDateString('fr-FR') : ''}</strong>.</p>
            <p>Veuillez consulter l'espace administration pour réassigner ces missions à  un autre intervenant.</p>
          </div>
        `
      });
    } catch (err) {
      console.error("Erreur envoi email admin refus mission:", err);
    }
    res.send(generateFeedbackHTML(
      "Missions refusées",
      `Merci ${intervenant ? intervenant.prenom : ''}, nous avons bien noté que vous déclinez les missions pour cette réservation.`,
      false
    ));
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors du refus");
  }
});

app.get('/api/admin/me', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  try {
    // Si on a un ID dans le token (cas d'un compte AdminAccount), on cherche dans la DB
    if (req.user && req.user.id) {
      const admin = await prisma.adminAccount.findUnique({
        where: { id: req.user.id },
        select: { 
          id: true, 
          email: true, 
          nom: true, 
          telephone: true,
          notifNewReservation: true,
          notifNewDevis: true,
          notifDevisValidation: true,
          notifPaymentReceived: true,
          notifModificationRequest: true,
          notifIntervenantMissions: true
        }
      });
      if (admin) {
        return res.json({
          ...admin,
          isSuperAdmin: admin.email === ADMIN_EMAIL
        });
      }
    }
    
    // Sinon on renvoie les infos par défaut de l'admin principal
    res.json({ 
      id: 0, 
      email: (req.user && req.user.email) || ADMIN_EMAIL, 
      nom: 'Administrateur MUC',
      isSuperAdmin: true,
      notifNewReservation: true,
      notifNewDevis: true,
      notifDevisValidation: true,
      notifPaymentReceived: true,
      notifModificationRequest: true,
      notifIntervenantMissions: true
    });
  } catch (err) {
    console.error("Erreur dans /api/admin/me:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mise à  jour du profil administrateur
app.put('/api/admin/profile', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  const { 
    nom, 
    prenom, 
    email, 
    telephone,
    notifNewReservation,
    notifNewDevis,
    notifDevisValidation,
    notifPaymentReceived,
    notifModificationRequest,
    notifIntervenantMissions
  } = req.body;

  try {
    // Construire le nom complet si prénom fourni
    const fullNom = prenom ? `${prenom} ${nom}` : nom;

    if (req.user && req.user.id) {
      const updated = await prisma.adminAccount.update({
        where: { id: req.user.id },
        data: {
          ...(fullNom && { nom: fullNom }),
          ...(email && { email }),
          ...(telephone !== undefined && { telephone }),
          ...(notifNewReservation !== undefined && { notifNewReservation }),
          ...(notifNewDevis !== undefined && { notifNewDevis }),
          ...(notifDevisValidation !== undefined && { notifDevisValidation }),
          ...(notifPaymentReceived !== undefined && { notifPaymentReceived }),
          ...(notifModificationRequest !== undefined && { notifModificationRequest }),
          ...(notifIntervenantMissions !== undefined && { notifIntervenantMissions })
        },
        select: { 
          id: true, 
          email: true, 
          nom: true, 
          telephone: true,
          notifNewReservation: true,
          notifNewDevis: true,
          notifDevisValidation: true,
          notifPaymentReceived: true,
          notifModificationRequest: true,
          notifIntervenantMissions: true
        }
      });
      return res.json(updated);
    }

    // Admin principal (id 0) — pas de compte en DB
    res.status(400).json({ error: "Le compte administrateur principal ne peut pas être modifié ici. Utilisez les variables d'environnement." });
  } catch (err) {
    console.error('Erreur PUT /api/admin/profile:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Cet email est déjà  utilisé par un autre compte.' });
    }
    res.status(500).json({ error: 'Erreur lors de la mise à  jour du profil.' });
  }
});

// Création manuelle d'une réservation
// Création manuelle d'une réservation
app.post('/api/admin/reservations', checkAuth, async (req, res) => {
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, chambresDetails, options, repas, salles, promoCode, prixTotal, structure, sendEmail, collectOccupantsEmail } = req.body;
  try {
    const token = collectOccupantsEmail ? require('crypto').randomBytes(24).toString('hex') : null;
    
    const reservation = await prisma.reservation.create({
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres: chambres, // Expecting array of ints
        chambresDetails: chambresDetails || null,
        options: options || null,
        repas: repas || null,
        salles: salles || null,
        codePromo: promoCode || null,
        prixTotal: prixTotal ? parseFloat(prixTotal) : null,
        montantAcompte: prixTotal ? Math.round(parseFloat(prixTotal) * 0.3 * 100) / 100 : null,
        montantSolde: prixTotal ? Math.round(parseFloat(prixTotal) * 0.7 * 100) / 100 : null,
        statut: 'RESERVE',
        statutPaiement: 'EN_ATTENTE',
        valideLe: new Date(),
        structure: structure || null,
        validePar: req.user.email,
        tokenDevis: token,
        tokenModification: require('crypto').randomBytes(32).toString('hex'),
        client: {
          create: { nom, email: email || 'N/A', telephone: telephone || 'N/A', adressePostale: adressePostale || null }
        },
        occupants: (!collectOccupantsEmail && occupants && occupants.length > 0) ? {
          create: occupants.map(occ => {
            const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
            let occNom = occ.nom;
            let occPrenom = occ.prenom;
            if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
              occNom = "Mineur";
              occPrenom = "";
            }
            const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
            let nationalite = occ.nationalite;
            if (nationalite === true || nationalite === 'true') {
              nationalite = 'Française';
            } else if (nationalite === false || nationalite === 'false') {
              nationalite = 'Étrangère';
            } else if (!nationalite) {
              nationalite = 'Française';
            }
            return {
              nom: occNom || '',
              prenom: occPrenom || '',
              estAdulte,
              age,
              nationalite
            };
          })
        } : undefined
      },
      include: { client: true, occupants: true }
    });

    let paymentLink = '';
    let updatedReservation = reservation;
    let montantAPayer = 0;
    let paymentLabel = '';
    
    if (sendEmail && email && email !== 'N/A') {
      try {
        const checkInDate = new Date(dateDebut);
        const today = new Date();
        checkInDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((checkInDate - today) / (1000 * 60 * 60 * 24));
        const isLastMinuteStay = daysDiff < 10;
        
        const paymentType = isLastMinuteStay ? 'totalite' : 'acompte';
        const session = await createStripeSessionForReservation(reservation, paymentType);
        paymentLink = session.url;
        
        if (isLastMinuteStay) {
          montantAPayer = reservation.prixTotal || 0;
          paymentLabel = 'la totalité';
          updatedReservation = await prisma.reservation.update({
            where: { id: reservation.id },
            data: { 
              stripeSoldeId: session.id,
              montantAcompte: 0,
              montantSolde: montantAPayer
            },
            include: { client: true, occupants: true }
          });
        } else {
          const repasTotal = calculerTotalRepasServeur(reservation.repas);
          const montantHebergement = Math.max(0, (reservation.prixTotal || 0) - repasTotal);
          montantAPayer = reservation.montantAcompte ? reservation.montantAcompte : Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
          paymentLabel = "l'acompte";
          updatedReservation = await prisma.reservation.update({
            where: { id: reservation.id },
            data: { 
              stripeAcompteId: session.id,
              montantAcompte: montantAPayer,
              montantSolde: Math.round(((reservation.prixTotal || 0) - montantAPayer) * 100) / 100
            },
            include: { client: true, occupants: true }
          });
        }
      } catch (stripeErr) {
        console.error("Erreur génération lien Stripe pour réservation manuelle:", stripeErr);
      }

      try {
        const frontendUrl = process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173');
        const checkInDate = new Date(dateDebut);
        const today = new Date();
        checkInDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const daysDiff = Math.ceil((checkInDate - today) / (1000 * 60 * 60 * 24));
        const isLastMinuteStay = daysDiff < 10;
        
        let paymentSectionHtml = '';
        if (paymentLink) {
          paymentSectionHtml = `
            <div style="background-color: #fff8e1; border: 1px solid #ffe082; padding: 25px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <p style="font-weight: bold; margin: 0 0 15px 0; color: #333;">
                ${isLastMinuteStay 
                  ? "Votre séjour étant prévu dans moins de 10 jours, le règlement de la totalité est requis pour confirmer définitivement votre réservation :" 
                  : "Afin de finaliser et confirmer votre réservation, veuillez procéder au règlement de l'acompte (30% Hébergement + 100% Repas) :"}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block;">
                      Régler ${paymentLabel} de ${montantAPayer.toFixed(2)} €
                    </a>
                  </td>
                </tr>
              </table>
              ${!isLastMinuteStay ? `<p style="margin: 15px 0 0 0; font-size: 13px; color: #666;">Le solde restant de ${((reservation.prixTotal || 0) - montantAPayer).toFixed(2)} € devra être réglé au plus tard 7 jours avant votre arrivée.</p>` : ''}
            </div>
          `;
        } else {
          paymentSectionHtml = `
            <p>Si un paiement est requis, vous recevrez prochainement un e-mail avec un lien sécurisé pour procéder au règlement.</p>
          `;
        }

        const occupantsSectionHtml = collectOccupantsEmail ? `
          <div style="background-color: #e8f4fd; border: 1px solid #b3d7f2; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #004B93;">Détails des occupants :</p>
            <p style="margin: 0 0 15px 0; font-size: 14px; color: #555;">Afin de finaliser les démarches administratives réglementaires, merci de renseigner les détails des voyageurs de votre groupe en cliquant sur le bouton ci-dessous :</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <a href="${frontendUrl}/reservation/occupants?token=${token}" style="background-color: #004B93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Saisir les occupants du groupe</a>
                </td>
              </tr>
            </table>
          </div>
        ` : '';

        const adminEmail = req.user.email;
        const adminSignatureHTML = await getAdminSignatureHTML(adminEmail);
        const modificationLinkHTML = getModificationLinkHTML(updatedReservation.tokenModification);

        await sendMail({
          to: email,
          subject: "Confirmation d'enregistrement de votre réservation - Gîte de La Maladrerie",
          html: `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                    <tr>
                      <td style="background-color: #004B93; padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px; color: #333333; line-height: 1.6;">
                        <h2 style="color: #004B93; margin-top: 0;">Bonjour ${nom},</h2>
                        <p>Nous vous confirmons que votre réservation a bien été enregistrée par notre équipe pour un séjour du <strong>${new Date(dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
                        
                        ${paymentSectionHtml}
                        ${occupantsSectionHtml}
                        
                        ${modificationLinkHTML}
                        
                        <p style="margin-top: 30px;">À très bientôt !</p>
                        
                        ${adminSignatureHTML}
                      </td>
                    </tr>
                    <tr><td style="background-color: #FDB913; height: 5px;"></td></tr>
                  </table>
                </td>
              </tr>
            </table>
          `
        });
      } catch (mailErr) {
        console.error("Erreur envoi email confirmation réservation manuelle:", mailErr);
      }
    }

    res.json(reservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de la réservation' });
  }
});

// Modification complete d'une reservation existante
app.put('/api/admin/reservations/:id/full', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, chambresDetails, options, repas, salles, promoCode, prixTotal, structure, sendEmail } = req.body;
  
  try {
    const oldRes = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!oldRes) {
      return res.status(404).json({ error: 'Reservation non trouvee' });
    }

    const newPrixTotal = prixTotal !== undefined && prixTotal !== null ? parseFloat(prixTotal) : oldRes.prixTotal;
    let newAcompte = oldRes.montantAcompte;
    let newSolde = oldRes.montantSolde;
    let newStatutPaiement = oldRes.statutPaiement;

    if (newPrixTotal !== oldRes.prixTotal) {
      if (oldRes.statutPaiement === 'EN_ATTENTE') {
        newAcompte = Math.round(newPrixTotal * 0.3 * 100) / 100;
        newSolde = Math.round(newPrixTotal * 0.7 * 100) / 100;
      } else if (oldRes.statutPaiement === 'ACOMPTE_PAYE') {
        newSolde = Math.max(0, newPrixTotal - (oldRes.montantAcompte || 0));
      } else if (oldRes.statutPaiement === 'SOLDE_PAYE') {
        if (newPrixTotal > (oldRes.montantSolde || 0)) {
          newAcompte = Math.round((newPrixTotal - (oldRes.montantSolde || 0)) * 100) / 100;
        } else {
          newAcompte = 0;
          newStatutPaiement = 'PAYE';
        }
      } else if (oldRes.statutPaiement === 'PAYE') {
        if (newPrixTotal > oldRes.prixTotal) {
          newStatutPaiement = 'ACOMPTE_PAYE';
          newAcompte = oldRes.prixTotal; 
          newSolde = newPrixTotal - oldRes.prixTotal;
        } else {
          newSolde = 0;
        }
      }
    }

    await prisma.occupant.deleteMany({ where: { reservationId: parseInt(id) } });
    
    const newOccupants = occupants && occupants.length > 0 ? occupants.map(occ => {
      const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
      let occNom = occ.nom;
      let occPrenom = occ.prenom;
      if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
        occNom = "Mineur";
        occPrenom = "";
      }
      const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
      let nationalite = occ.nationalite;
      if (nationalite === true || nationalite === 'true') nationalite = 'Francaise';
      else if (nationalite === false || nationalite === 'false') nationalite = 'Etrangere';
      else if (!nationalite) nationalite = 'Francaise';
      
      return { nom: occNom || '', prenom: occPrenom || '', estAdulte, age, nationalite };
    }) : [];

    const updatedReservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: {
        dateDebut: dateDebut ? new Date(dateDebut) : oldRes.dateDebut,
        dateFin: dateFin ? new Date(dateFin) : oldRes.dateFin,
        chambres: chambres || oldRes.chambres,
        chambresDetails: chambresDetails !== undefined ? chambresDetails : oldRes.chambresDetails,
        options: options !== undefined ? options : oldRes.options,
        repas: repas !== undefined ? repas : oldRes.repas,
        salles: salles !== undefined ? salles : oldRes.salles,
        codePromo: promoCode !== undefined ? promoCode : oldRes.codePromo,
        prixTotal: newPrixTotal,
        montantAcompte: newAcompte,
        montantSolde: newSolde,
        statutPaiement: newStatutPaiement,
        structure: structure !== undefined ? structure : oldRes.structure,
        client: {
          update: { 
            nom: nom || oldRes.client.nom, 
            email: email || oldRes.client.email, 
            telephone: telephone || oldRes.client.telephone, 
            adressePostale: adressePostale || oldRes.client.adressePostale 
          }
        },
        occupants: {
          create: newOccupants
        }
      },
      include: { client: true, occupants: true }
    });

    if (sendEmail && email && email !== 'N/A') {
      try {
        await sendMail({
          to: email,
          subject: "Mise a jour de votre reservation - Gite de La Maladrerie",
          html: "<div style='font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;'><div style='background-color: #004B93; padding: 20px; text-align: center;'><h1 style='color: white; margin: 0;'>Gite de La Maladrerie</h1></div><div style='padding: 20px;'><h2 style='color: #004B93;'>Bonjour " + (nom || oldRes.client.nom) + ",</h2><p>Nous vous informons que votre reservation a ete mise a jour par notre equipe.</p><p>Si cette modification a entraine un changement de tarif necessitant un paiement complementaire, vous recevrez prochainement un nouveau lien de paiement.</p><br><p>A tres bientot,<br>L equipe du Gite de La Maladrerie</p></div></div>"
        });
      } catch (err) {
        console.error("Erreur lors de l'envoi de l'e-mail de mise a jour:", err);
      }
    }

    res.json(updatedReservation);
  } catch (error) {
    console.error("Erreur lors de la modification de la reservation:", error);
    res.status(500).json({ error: 'Erreur lors de la modification de la reservation' });
  }
});
// Envoyer le lien de paiement par e-mail
app.post('/api/admin/reservations/:id/send-payment-link', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // optional type: 'acompte', 'solde', 'totalite'
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation non trouvée' });

    let tokenModification = reservation.tokenModification;
    if (!tokenModification) {
      tokenModification = require('crypto').randomBytes(32).toString('hex');
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { tokenModification }
      });
    }

    const typePaiement = type || (reservation.statutPaiement === 'ACOMPTE_PAYE' ? 'solde' : 'totalite');
    const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=${typePaiement}`;

    const nbPersonnes = reservation.occupants ? reservation.occupants.length : 0;
    const nbNuits = Math.round((new Date(reservation.dateFin) - new Date(reservation.dateDebut)) / (1000 * 60 * 60 * 24));
    
    let occupantsHTML = '';
    if (reservation.occupants && reservation.occupants.length > 0) {
      occupantsHTML = `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px;">
          <p style="margin-top: 0;"><strong>Occupants (${nbPersonnes} personnes) :</strong></p>
          <ul style="margin-bottom: 0;">
            ${reservation.occupants.map(occ => `<li>${occ.prenom} ${occ.nom} - ${occ.estAdulte ? 'Adulte' : `Mineur (${occ.age} ans)`}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    let typeLabel = "votre acompte / solde";
    if (typePaiement === 'acompte') typeLabel = "l'acompte (30%)";
    else if (typePaiement === 'solde') typeLabel = "le solde (70%)";
    else if (typePaiement === 'totalite') typeLabel = "la totalité (100%)";

    await sendMail({
      to: reservation.client.email,
      subject: "Lien de paiement pour votre réservation - Gîte de La Maladrerie",
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                <tr>
                  <td style="background-color: #004B93; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px; color: #333333; line-height: 1.6;">
                    <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
                    <p>Voici le lien pour finaliser le règlement de ${typeLabel} de votre réservation.</p>
                    
                    <table width="100%" cellpadding="10" cellspacing="0" border="0" style="background-color: #f9f9f9; border-radius: 8px; margin: 25px 0;">
                      <tr>
                        <td width="40%" style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Dates</td>
                        <td style="border-bottom: 1px solid #eeeeee;">Du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Durée</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${nbNuits} nuit(s)</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold; border-bottom: 1px solid #eeeeee;">Chambres</td>
                        <td style="border-bottom: 1px solid #eeeeee;">${reservation.chambres.join(', ')}</td>
                      </tr>
                      <tr>
                        <td style="font-weight: bold;">Montant total</td>
                        <td style="font-size: 18px; font-weight: bold; color: #004B93;">${reservation.prixTotal ? reservation.prixTotal.toFixed(2) + ' €' : 'Non défini'}</td>
                      </tr>
                    </table>
                    
                    ${occupantsHTML}
 
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Procéder au règlement</a>
                        </td>
                      </tr>
                    </table>
                    <p>Cordialement,<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FDB913; height: 5px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
    });
 
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { lienPaiementEnvoye: true }
    });
 
    res.json({ success: true, message: 'E-mail envoyé avec succès.' });
  } catch (error) {
    console.error("Erreur envoi lien:", error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'e-mail' });
  }
});

// CRUD Intervenants
app.get('/api/admin/intervenants', checkAuth, async (req, res) => {
  try {
    const intervenants = await prisma.intervenant.findMany({
      include: { 
        disponibilites: true,
        missions: {
          include: { reservation: { include: { client: true } } }
        }
      }
    });
    res.json(intervenants);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des intervenants' });
  }
});

app.post('/api/admin/intervenants', checkAuth, async (req, res) => {
  const { nom, prenom, email, telephone, password, disponibilites, statut } = req.body;
  try {
    const data = { nom, prenom, email, telephone, statut: statut || 'SALARIE' };
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }
    const intervenant = await prisma.intervenant.create({
      data: {
        ...data,
        disponibilites: {
          create: (disponibilites || []).map(d => ({
            dateDebut: new Date(d.dateDebut),
            dateFin: new Date(d.dateFin)
          }))
        }
      }
    });
    res.json(intervenant);
  } catch (error) {
    console.error("Erreur création intervenant:", error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'intervenant' });
  }
});

app.put('/api/admin/intervenants/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, prenom, email, telephone, password, disponibilites, statut } = req.body;
  try {
    const data = { nom, prenom, email, telephone, statut: statut || 'SALARIE' };
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    // Supprimer les anciennes dispos et recréer les nouvelles
    await prisma.disponibilite.deleteMany({ where: { intervenantId: parseInt(id) } });

    const intervenant = await prisma.intervenant.update({
      where: { id: parseInt(id) },
      data: {
        ...data,
        disponibilites: {
          create: (disponibilites || []).map(d => ({
            dateDebut: new Date(d.dateDebut),
            dateFin: new Date(d.dateFin)
          }))
        }
      }
    });
    res.json(intervenant);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la modification de l\'intervenant' });
  }
});

// Inviter un intervenant par email (envoi identifiants et lien de connexion)
app.post('/api/admin/intervenants/:id/invite', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès interdit - Droits admin requis' });
  }
  const { id } = req.params;
  try {
    const intervenant = await prisma.intervenant.findUnique({
      where: { id: parseInt(id) }
    });

    if (!intervenant) {
      return res.status(404).json({ error: 'Intervenant non trouvé' });
    }

    const hasPassword = !!intervenant.password;
    const tempPasswordText = hasPassword 
      ? "votre mot de passe habituel" 
      : "le mot de passe temporaire : <strong>equipe2024</strong> (nous vous conseillons de le modifier dès votre première connexion dans l'onglet 'Mon Profil').";

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #004B93; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Gîte de la Maladrerie</h1>
          <p style="color: rgba(255, 255, 255, 0.8); margin: 5px 0 0 0; font-size: 14px;">Invitation de l'équipe d'intervenants</p>
        </div>
        
        <div style="padding: 30px 24px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: bold; margin-top: 0; color: #0f172a;">Bonjour ${intervenant.prenom} ${intervenant.nom},</p>
          
          <p style="font-size: 14px;">
            Vous êtes invité(e) à rejoindre l'espace réservation du <strong>Gîte de la Maladrerie</strong> en tant que membre de l'équipe.
          </p>
          
          <p style="font-size: 14px;">
            Cet espace vous permettra de consulter votre agenda de missions, de valider ou décliner les tâches qui vous sont affectées (ménage, accueil, etc.), de déclarer vos disponibilités, et de consulter les réservations et clients en lecture seule.
          </p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #004B93; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 13px; font-weight: 800; color: #004B93; text-transform: uppercase; letter-spacing: 0.5px;">Vos identifiants de connexion :</h3>
            <table cellpadding="4" cellspacing="0" style="font-size: 13px; color: #334155; width: 100%;">
              <tr>
                <td width="120" style="font-weight: bold; color: #64748b;">Adresse e-mail :</td>
                <td style="font-weight: bold; color: #0f172a;">${intervenant.email}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; color: #64748b; vertical-align: top;">Mot de passe :</td>
                <td style="color: #0f172a;">${tempPasswordText}</td>
              </tr>
            </table>
          </div>
          
          <p style="text-align: center; margin-top: 25px; margin-bottom: 25px;">
            <a href="${FRONTEND_URL}/login" target="_blank" style="background-color: #004B93; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.15);">Accéder à mon espace</a>
          </p>
          
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">
            Si le bouton ci-dessus ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur : <br/>
            <a href="${FRONTEND_URL}/login" style="color: #004B93; text-decoration: underline;">${FRONTEND_URL}/login</a>
          </p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
          Cet e-mail automatique est envoyé par le système de gestion du Gîte de la Maladrerie.
        </div>
      </div>
    `;

    await sendMail({
      to: intervenant.email,
      subject: "Invitation à rejoindre votre espace intervenant - Gîte de la Maladrerie",
      html: emailHtml
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Erreur envoi invitation:", error);
    res.status(500).json({ error: "Erreur lors de l'envoi de l'invitation par e-mail" });
  }
});

app.delete('/api/admin/missions/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.mission.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression de la mission:", error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la mission' });
  }
});

app.delete('/api/admin/intervenants/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.intervenant.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'intervenant' });
  }
});

// CRUD AdminAccounts
app.get('/api/admin/accounts', checkAuth, checkSuperAdmin, async (req, res) => {
  try {
    const admins = await prisma.adminAccount.findMany({
      select: { 
        id: true, 
        email: true, 
        nom: true, 
        telephone: true,
        createdAt: true,
        notifNewReservation: true,
        notifNewDevis: true,
        notifDevisValidation: true,
        notifPaymentReceived: true,
        notifModificationRequest: true,
        notifIntervenantMissions: true
      }
    });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des admins' });
  }
});

app.post('/api/admin/accounts', checkAuth, checkSuperAdmin, async (req, res) => {
  const { 
    email, 
    password, 
    nom, 
    telephone,
    notifNewReservation,
    notifNewDevis,
    notifDevisValidation,
    notifPaymentReceived,
    notifModificationRequest,
    notifIntervenantMissions
  } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.adminAccount.create({
      data: { 
        email, 
        password: hashedPassword, 
        nom,
        telephone: telephone || '',
        notifNewReservation: notifNewReservation ?? true,
        notifNewDevis: notifNewDevis ?? true,
        notifDevisValidation: notifDevisValidation ?? true,
        notifPaymentReceived: notifPaymentReceived ?? true,
        notifModificationRequest: notifModificationRequest ?? true,
        notifIntervenantMissions: notifIntervenantMissions ?? true
      }
    });
    const { password: _, ...adminWithoutPassword } = admin;
    res.json(adminWithoutPassword);
  } catch (error) {
    console.error("Erreur lors de la création de l'admin:", error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'admin' });
  }
});

app.put('/api/admin/accounts/:id', checkAuth, checkSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { 
    email, 
    password, 
    nom, 
    telephone,
    notifNewReservation,
    notifNewDevis,
    notifDevisValidation,
    notifPaymentReceived,
    notifModificationRequest,
    notifIntervenantMissions
  } = req.body;
  try {
    const dataToUpdate = {
      email,
      nom,
      telephone: telephone || '',
      notifNewReservation: notifNewReservation ?? true,
      notifNewDevis: notifNewDevis ?? true,
      notifDevisValidation: notifDevisValidation ?? true,
      notifPaymentReceived: notifPaymentReceived ?? true,
      notifModificationRequest: notifModificationRequest ?? true,
      notifIntervenantMissions: notifIntervenantMissions ?? true
    };
    if (password && password.trim() !== '') {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }
    const admin = await prisma.adminAccount.update({
      where: { id: parseInt(id) },
      data: dataToUpdate
    });
    const { password: _, ...adminWithoutPassword } = admin;
    res.json(adminWithoutPassword);
  } catch (error) {
    console.error("Erreur lors de la modification de l'admin:", error);
    res.status(500).json({ error: 'Erreur lors de la modification de l\'admin' });
  }
});

app.delete('/api/admin/accounts/:id', checkAuth, checkSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.adminAccount.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'admin' });
  }
});

// Obtenir la fiche d'un client
app.get('/api/admin/clients/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const client = await prisma.client.findUnique({
      where: { id: parseInt(id) },
      include: {
        reservations: {
          include: { occupants: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération du client' });
  }
});

// Modifier les informations d'un client
app.put('/api/admin/clients/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, email, telephone, adressePostale } = req.body;
  try {
    const updatedClient = await prisma.client.update({
      where: { id: parseInt(id) },
      data: {
        nom,
        email,
        telephone,
        adressePostale
      }
    });
    res.json(updatedClient);
  } catch (error) {
    console.error("Erreur modification client:", error);
    res.status(500).json({ error: 'Erreur lors de la modification du client' });
  }
});

// ===================================
// PLANING EQUIPE
// ===================================

app.get('/api/equipe/planning', checkAuth, async (req, res) => {
  try {
    const disponibilites = await prisma.disponibilite.findMany({
      include: { intervenant: true }
    });

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'EN_ATTENTE'] }
      },
      include: { 
        intervenant: true, 
        client: true,
        missions: {
          include: {
            intervenant: true
          }
        }
      }
    });

    // Transformer tout en événements pour react-big-calendar
    const events = [];

    // Ajouter les disponibilités
    disponibilites.forEach(dispo => {
      events.push({
        id: 'dispo-' + dispo.id,
        title: '✅ Dispo : ' + dispo.intervenant.prenom + ' ' + dispo.intervenant.nom,
        start: new Date(dispo.dateDebut),
        end: new Date(dispo.dateFin), 
        type: 'dispo',
        allDay: true,
        intervenantName: dispo.intervenant.prenom + ' ' + dispo.intervenant.nom
      });
    });

    // Ajouter les réservations et leurs missions
    reservations.forEach(reser => {
      events.push({
        id: 'res-' + reser.id,
        title: '🗓️ Réservation : ' + reser.client.nom + (reser.intervenant ? ' (' + reser.intervenant.prenom + ')' : ' (Non assigné)'),
        start: new Date(reser.dateDebut),
        end: new Date(reser.dateFin),
        type: 'reservation',
        allDay: true,
        intervenantName: reser.intervenant ? reser.intervenant.prenom + ' ' + reser.intervenant.nom : 'Aucun',
        statut: reser.statut,
        clientNom: reser.client.nom
      });

      if (reser.missions && reser.missions.length > 0) {
        reser.missions.forEach(m => {
          if (m.intervenant) {
            const statusLabel = m.statut === 'ACCEPTEE' ? 'Validé' : m.statut === 'REFUSEE' ? 'Refusé' : 'En attente';
            events.push({
              id: 'mission-' + m.id,
              title: '📌 ' + m.intervenant.prenom + ' : ' + m.typeMission + ' (' + statusLabel + ')',
              start: new Date(reser.dateDebut),
              end: new Date(reser.dateFin),
              type: 'mission',
              allDay: true,
              statut: m.statut,
              mission: {
                id: m.id,
                typeMission: m.typeMission,
                montant: m.montant,
                statut: m.statut,
                intervenantName: m.intervenant.prenom + ' ' + m.intervenant.nom,
                intervenantEmail: m.intervenant.email,
                intervenantPhone: m.intervenant.telephone
              },
              reservation: {
                id: reser.id,
                clientNom: reser.client.nom,
                dateDebut: reser.dateDebut,
                dateFin: reser.dateFin,
                statut: reser.statut
              }
            });
          }
        });
      }
    });

    res.json(events);
  } catch (error) {
    console.error('Erreur planning équipe:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du planning' });
  }
});

// ===== CODES PROMO =====

// Lister tous les codes promo
app.get('/api/admin/promo-codes', checkAuth, async (req, res) => {
  try {
    const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des codes promo' });
  }
});

// Créer un code promo
app.post('/api/admin/promo-codes', checkAuth, async (req, res) => {
  const { code, description, type, valeur, dateExpiration, usageMax } = req.body;
  if (!code || !valeur) return res.status(400).json({ error: 'Code et valeur requis' });
  try {
    const existing = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) return res.status(400).json({ error: 'Ce code promo existe déjà ' });
    
    const promo = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase(),
        description: description || null,
        type: type || 'pourcentage',
        valeur: parseFloat(valeur),
        dateExpiration: dateExpiration ? new Date(dateExpiration) : null,
        usageMax: usageMax ? parseInt(usageMax) : null
      }
    });
    res.status(201).json(promo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création du code promo' });
  }
});

// Supprimer un code promo
app.delete('/api/admin/promo-codes/:id', checkAuth, async (req, res) => {
  try {
    await prisma.promoCode.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression du code promo' });
  }
});

// Activer/Désactiver un code promo
app.put('/api/admin/promo-codes/:id', checkAuth, async (req, res) => {
  try {
    const updated = await prisma.promoCode.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à  jour du code promo' });
  }
});

// ===== EXPENSES (DEPENSES) =====

// Obtenir toutes les dépenses manuelles
app.get('/api/admin/expenses', checkAuth, async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
    res.json(expenses);
  } catch (error) {
    console.error("Erreur récupération dépenses:", error);
    res.status(500).json({ error: 'Erreur lors de la récupération des dépenses' });
  }
});

// Créer une dépense
app.post('/api/admin/expenses', checkAuth, async (req, res) => {
  const { label, montant, categorie, comptePcg, description, date } = req.body;
  if (!label || montant === undefined || !categorie || !comptePcg) {
    return res.status(400).json({ error: 'Libellé, montant, catégorie et compte PCG sont requis' });
  }
  try {
    const expense = await prisma.expense.create({
      data: {
        label,
        montant: parseFloat(montant),
        categorie,
        comptePcg,
        description: description || null,
        date: date ? new Date(date) : new Date()
      }
    });
    res.status(201).json(expense);
  } catch (error) {
    console.error("Erreur création dépense:", error);
    res.status(500).json({ error: 'Erreur lors de la création de la dépense' });
  }
});

// Modifier une dépense
app.put('/api/admin/expenses/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { label, montant, categorie, comptePcg, description, date } = req.body;
  try {
    const updated = await prisma.expense.update({
      where: { id: parseInt(id) },
      data: {
        label,
        montant: montant !== undefined ? parseFloat(montant) : undefined,
        categorie,
        comptePcg,
        description,
        date: date ? new Date(date) : undefined
      }
    });
    res.json(updated);
  } catch (error) {
    console.error("Erreur modification dépense:", error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la dépense' });
  }
});

// Supprimer une dépense
app.delete('/api/admin/expenses/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.expense.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression dépense:", error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la dépense' });
  }
});

// Valider un code promo (côté client, pas besoin d'auth)
app.post('/api/promo-codes/validate', async (req, res) => {
  const { code, montant } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis' });
  
  try {
    const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    
    if (!promo) return res.status(404).json({ error: 'Code promo invalide' });
    if (!promo.actif) return res.status(400).json({ error: 'Ce code promo n\'est plus actif' });
    if (promo.dateExpiration && new Date(promo.dateExpiration) < new Date()) {
      return res.status(400).json({ error: 'Ce code promo a expiré' });
    }
    if (promo.usageMax && promo.usageActuel >= promo.usageMax) {
      return res.status(400).json({ error: 'Ce code promo a atteint son nombre maximum d\'utilisations' });
    }
    
    let reduction = 0;
    if (promo.type === 'pourcentage') {
      reduction = (montant || 0) * promo.valeur / 100;
    } else {
      reduction = promo.valeur;
    }
    
    res.json({
      valid: true,
      code: promo.code,
      type: promo.type,
      valeur: promo.valeur,
      reduction: Math.round(reduction * 100) / 100,
      description: promo.description
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation du code promo' });
  }
});

// ===== CAPTATION PARTIELLE DE LA CAUTION =====

// Capturer un montant p// ===== CRON JOB : RAPPEL DE SOLDE AUTOMATIQUE, RAPPELS J-10 ET J-7 =====
// S'exécute tous les jours à 09:00
const executeDailyReminders = async () => {
  console.log("Exécution du Cron Job : Rappels de soldes automatiques...");
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- 1. RAPPELS DERNIER AVERTISSEMENT (J+7 avant l'arrivée) ---
    const warningDateStart = new Date(today);
    warningDateStart.setDate(today.getDate() + 7);
    const warningDateEnd = new Date(warningDateStart);
    warningDateEnd.setHours(23, 59, 59, 999);

    const toWarn = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' },
        souhaitePayerSoldeArrivee: false,
        dateDebut: { gte: warningDateStart, lte: warningDateEnd }
      },
      include: { client: true }
    });

    for (const reser of toWarn) {
      const paymentType = reser.statutPaiement === 'ACOMPTE_PAYE' ? 'solde' : (reser.statutPaiement === 'SOLDE_PAYE' ? 'acompte' : 'totalite');
      
      let tokenModification = reser.tokenModification;
      if (!tokenModification) {
        tokenModification = require('crypto').randomBytes(32).toString('hex');
        await prisma.reservation.update({
          where: { id: reser.id },
          data: { tokenModification }
        });
      }

      const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=${paymentType}`;
      const payOnArrivalLink = `${BACKEND_URL}/api/payment/pay-on-arrival/${tokenModification}`;
      
      const montant = paymentType === 'solde' 
        ? (reser.montantSolde || ((reser.prixTotal || 0) - (reser.montantAcompte || 0))) 
        : (paymentType === 'acompte' ? (reser.montantAcompte || 0) : (reser.prixTotal || 0));

      await sendMail({
        to: reser.client.email,
        subject: "⚠️ Rappel important : Règlement de votre séjour - Gîte de La Maladrerie",
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #FDB913; padding: 30px; text-align: center;">
                      <h1 style="color: #004B93; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reser.client.nom},</h2>
                      <p>Votre séjour commence très prochainement le <strong>${new Date(reser.dateDebut).toLocaleDateString('fr-FR')}</strong> (dans 7 jours).</p>
                      <p>Il vous reste à régler le montant de <strong>${montant.toFixed(2)} €</strong> correspondant au ${paymentType === 'solde' ? 'solde' : 'totalité'} de votre réservation.</p>
                      
                      <p>Pour finaliser et confirmer le règlement, veuillez cliquer sur le bouton ci-dessous pour régler par carte bancaire ou virement bancaire :</p>
                      <table width="100%" cellpadding="15" cellspacing="0" border="0" style="text-align: center; margin: 20px 0;">
                        <tr>
                          <td>
                            <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(253, 185, 19, 0.2);">💳 Régler en ligne (${montant.toFixed(2)} €)</a>
                          </td>
                        </tr>
                      </table>
                      
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 13px;">
                        <p style="margin-top: 0; font-weight: bold; color: #475569;">Paiement à l'arrivée possible :</p>
                        <p style="margin-bottom: 15px;">Si vous préférez régler ce solde directement le jour de votre arrivée (chèque, espèces ou virement préalable), merci de nous l'indiquer d'un simple clic ci-dessous afin de désactiver les relances :</p>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: center;">
                          <tr>
                            <td>
                              <a href="${payOnArrivalLink}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">🙋‍♂️ Je souhaite régler à mon arrivée</a>
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                    </td>
                  </tr>
                  <tr><td style="background-color: #FDB913; height: 5px;"></td></tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
      console.log(`Dernier rappel (J+7) envoyé pour la réservation ${reser.id}`);
    }

    // --- 2. PREMIERS RAPPELS DE SOLDE (J+10 avant l'arrivée) ---
    const reminderDateStart = new Date(today);
    reminderDateStart.setDate(today.getDate() + 10);
    const reminderDateEnd = new Date(reminderDateStart);
    reminderDateEnd.setHours(23, 59, 59, 999);

    const toRemind = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' },
        souhaitePayerSoldeArrivee: false,
        dateDebut: { gte: reminderDateStart, lte: reminderDateEnd }
      },
      include: { client: true }
    });

    for (const reser of toRemind) {
      const paymentType = reser.statutPaiement === 'ACOMPTE_PAYE' ? 'solde' : (reser.statutPaiement === 'SOLDE_PAYE' ? 'acompte' : 'totalite');
      
      let tokenModification = reser.tokenModification;
      if (!tokenModification) {
        tokenModification = require('crypto').randomBytes(32).toString('hex');
        await prisma.reservation.update({
          where: { id: reser.id },
          data: { tokenModification }
        });
      }

      const paymentLink = `${FRONTEND_URL}/payment?token=${tokenModification}&type=${paymentType}`;
      const payOnArrivalLink = `${BACKEND_URL}/api/payment/pay-on-arrival/${tokenModification}`;
      
      const montant = paymentType === 'solde' 
        ? (reser.montantSolde || ((reser.prixTotal || 0) - (reser.montantAcompte || 0))) 
        : (paymentType === 'acompte' ? (reser.montantAcompte || 0) : (reser.prixTotal || 0));

      await sendMail({
        to: reser.client.email,
        subject: "Rappel : Règlement de votre séjour - Gîte de La Maladrerie",
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #004B93; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reser.client.nom},</h2>
                      <p>Votre séjour approche et débutera le <strong>${new Date(reser.dateDebut).toLocaleDateString('fr-FR')}</strong> (dans 10 jours).</p>
                      <p>Nous vous rappelons que votre réservation ne sera définitive que lorsque le solde restant de <strong>${montant.toFixed(2)} €</strong> aura été réglé.</p>
                      
                      <p>Merci de procéder au règlement en cliquant sur le bouton ci-dessous :</p>
                      <table width="100%" cellpadding="15" cellspacing="0" border="0" style="text-align: center; margin: 20px 0;">
                        <tr>
                          <td>
                            <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.2);">💳 Régler le solde en ligne (${montant.toFixed(2)} €)</a>
                          </td>
                        </tr>
                      </table>

                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 13px;">
                        <p style="margin-top: 0; font-weight: bold; color: #475569;">Paiement à l'arrivée possible :</p>
                        <p style="margin-bottom: 15px;">Si vous préférez régler ce solde directement le jour de votre arrivée (chèque, espèces ou virement), merci de nous le signaler d'un simple clic ci-dessous pour désactiver les relances :</p>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align: center;">
                          <tr>
                            <td>
                              <a href="${payOnArrivalLink}" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 13px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">🙋‍♂️ Je souhaite régler à mon arrivée</a>
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <p>Conformément à nos conditions, le solde doit être réglé au plus tard 7 jours avant votre séjour.</p>
                      <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                    </td>
                  </tr>
                  <tr><td style="background-color: #FDB913; height: 5px;"></td></tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
      console.log(`Rappel J+10 envoyé pour la réservation ${reser.id}`);
    }

    // --- 3. RAPPELS AUTOMATIQUES AUX INTERVENANTS POUR LEURS MISSIONS (J-7, J-3, J-1) ---
    const getMissionsForDelay = async (days) => {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + days);
      const targetStart = new Date(targetDate);
      targetStart.setHours(0, 0, 0, 0);
      const targetEnd = new Date(targetDate);
      targetEnd.setHours(23, 59, 59, 999);

      return await prisma.mission.findMany({
        where: {
          statut: 'ACCEPTEE',
          rappelsDesactives: false,
          intervenant: {
            recevoirRappels: true
          },
          OR: [
            { date: { gte: targetStart, lte: targetEnd } },
            {
              date: null,
              reservation: {
                dateDebut: { gte: targetStart, lte: targetEnd }
              }
            }
          ]
        },
        include: {
          intervenant: true,
          reservation: {
            include: { client: true }
          }
        }
      });
    };

    const missionsJ7 = await getMissionsForDelay(7);
    const missionsJ3 = await getMissionsForDelay(3);
    const missionsJ1 = await getMissionsForDelay(1);

    // Fusionner toutes les missions trouvées avec leur étiquette de délai
    const allMissions = [];
    missionsJ7.forEach(m => allMissions.push({ m, label: 'dans 7 jours', styleColor: '#1e3a8a' }));
    missionsJ3.forEach(m => allMissions.push({ m, label: 'dans 3 jours', styleColor: '#b45309' }));
    missionsJ1.forEach(m => allMissions.push({ m, label: 'demain', styleColor: '#b91c1c' }));

    // Regrouper par intervenant
    const missionsByInterv = {};
    allMissions.forEach(({ m, label, styleColor }) => {
      if (!missionsByInterv[m.intervenant.id]) {
        missionsByInterv[m.intervenant.id] = {
          interv: m.intervenant,
          list: []
        };
      }
      missionsByInterv[m.intervenant.id].list.push({ m, label, styleColor });
    });

    const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173');
    const BACKEND_URL = process.env.BACKEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5000');

    // Envoyer les e-mails
    for (const idKey of Object.keys(missionsByInterv)) {
      const group = missionsByInterv[idKey];
      const { interv, list } = group;
      
      const isPlural = list.length > 1;
      const subject = isPlural 
        ? `⏰ Rappel : Vos ${list.length} missions approchent (J-7 / J-3 / J-1) - Gîte de la Maladrerie` 
        : `⏰ Rappel : Votre mission approche (${list[0].label}) - Gîte de la Maladrerie`;

      let listHtml = list.map(({ m, label, styleColor }) => {
        const mDate = m.date ? new Date(m.date) : new Date(m.reservation.dateDebut);
        const optOutUrl = `${BACKEND_URL}/api/intervenant/unsubscribe-mission?missionId=${m.id}&token=${m.intervenantId}`;
        
        return `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 12px; text-align: left;">
            <div style="margin-bottom: 5px;">
              <span style="font-weight: bold; font-size: 15px; color: #004B93;">${m.typeMission}</span>
              <span style="background-color: ${styleColor}15; color: ${styleColor}; font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 9999px; text-transform: uppercase; float: right;">
                ${label}
              </span>
              <div style="clear: both;"></div>
            </div>
            <p style="margin: 5px 0 10px 0; font-size: 13px; color: #64748b; line-height: 1.4;">
              <strong>Date d'exécution :</strong> ${mDate.toLocaleDateString('fr-FR')} <br/>
              <strong>Séjour client :</strong> Réf #${m.reservationId} (Client : ${m.reservation.client?.nom || 'Inconnu'})
            </p>
            <div style="text-align: right; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
              <a href="${optOutUrl}" style="color: #ef4444; font-size: 11px; text-decoration: none; font-weight: bold;" target="_blank">
                🔕 Ne plus me rappeler cette mission
              </a>
            </div>
          </div>
        `;
      }).join('');

      const unsubUrl = `${BACKEND_URL}/api/intervenant/unsubscribe-reminders?email=${encodeURIComponent(interv.email)}&token=${interv.id}`;

      await sendMail({
        to: interv.email,
        subject,
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #004B93; padding: 30px; text-align: center;">
                      <img src="${FRONTEND_URL}/logo-muc.png" alt="MUC Omnisports" style="max-height: 60px; margin-bottom: 15px;" />
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #004B93; margin-top: 0;">Bonjour ${interv.prenom},</h2>
                      <p>Nous vous rappelons vos prochaines prestations planifiées au gîte :</p>
                      
                      <div style="margin: 20px 0;">
                        ${listHtml}
                      </div>

                      <p style="font-size: 14px; color: #64748b;">Merci de vous organiser pour la réalisation de vos missions aux dates et horaires convenus.</p>
                      
                      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;"/>
                      <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0; line-height: 1.5;">
                        Cet e-mail est un rappel automatique.<br/>
                        Pour désactiver tous les rappels (toutes missions confondues), vous pouvez <a href="${unsubUrl}" style="color: #004B93; text-decoration: underline;">cliquer ici</a>.
                      </p>
                    </td>
                  </tr>
                  <tr><td style="background-color: #FDB913; height: 5px;"></td></tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
      console.log(`Rappels de missions multiples envoyés à ${interv.prenom} ${interv.nom} (${list.length} missions)`);
    }

  } catch (error) {
    console.error("Erreur lors de l'exécution du Cron Job de rappels/annulations :", error);
  }
};

cron.schedule('0 9 * * *', async () => {
  try {
    await executeDailyReminders();
  } catch (err) {
    console.error("Erreur cron reminders:", err);
  }
});

app.get('/api/cron/reminders', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isValidToken = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !isValidToken && process.env.NODE_ENV === 'production') {
    return res.status(401).send('Non autorisé');
  }
  try {
    await executeDailyReminders();
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur HTTP cron reminders:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== CRON JOB : ENVOI DES MAILS ÉTAT DES LIEUX À L'ARRIVÉE (17H00) =====
const executeDailyLieuxEmails = async () => {
  console.log("Exécution du Cron Job : Envoi des liens de signature d'état des lieux (17h00)...");
  
  // Trouver les réservations qui débutent aujourd'hui et sont au statut RESERVE (validées)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        dateDebut: {
          gte: todayStart,
          lte: todayEnd
        },
        signatureLieuxDate: null // Pas encore signé
      },
      include: { client: true }
    });

    console.log(`${reservations.length} réservation(s) de départ d'aujourd'hui en attente d'état des lieux.`);

    for (const res of reservations) {
      let token = res.tokenLieuxSign;
      if (!token) {
        token = require('crypto').randomBytes(32).toString('hex');
        await prisma.reservation.update({
          where: { id: res.id },
          data: { tokenLieuxSign: token }
        });
      }

      const signLink = `${FRONTEND_URL}/sign-inventory?token=${token}`;

      await sendMail({
        to: res.client.email,
        subject: "📝 Émargement obligatoire en ligne : État des lieux & Inventaire - Gîte de la Maladrerie",
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
              <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
              <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
                <h2 style="color: #004B93; margin-top: 0;">Bonjour ${res.client.nom},</h2>
                <p>Votre séjour débute aujourd'hui au <strong>Gîte de la Maladrerie</strong>. Afin de finaliser la remise des clés et votre installation, veuillez signer en ligne l'état des lieux et l'inventaire du gîte.</p>
                
                <p style="background-color: #fff8e1; border: 1px solid #ffe082; padding: 15px; border-radius: 8px; font-size: 13px; color: #856404; margin: 20px 0;">
                  ⚠️ <strong>Procédure d'émargement :</strong> Cliquez sur le bouton ci-dessous pour accéder à l'interface de signature simplifiée. Vous pourrez télécharger l'état des lieux et l'inventaire, saisir votre nom et valider votre accord en 1 clic. Tout écart constaté sur place doit être signalé dans les premières heures.
                </p>
                
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${signLink}" style="background-color: #004B93; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 4px 6px rgba(0, 75, 147, 0.2);">📝 SIGNER L'ÉTAT DES LIEUX EN LIGNE</a>
                </p>
                
                <p>Nous vous souhaitons un excellent séjour au gîte !</p>
                <p>L'équipe du Gîte de la Maladrerie - MUC Omnisports</p>
              </td></tr>
            </table></td></tr>
          </table>
        `
      });
      console.log(`E-mail de signature d'état des lieux envoyé à ${res.client.email} pour la résa #${res.id}`);
    }
  } catch (err) {
    console.error("Erreur exécution cron lieux emails:", err);
  }
};

// S'exécute à 17h00 tous les jours
cron.schedule('0 17 * * *', async () => {
  try {
    await executeDailyLieuxEmails();
  } catch (err) {
    console.error("Erreur cron lieux emails:", err);
  }
});

// Endpoint HTTP pour déclenchement Vercel Cron ou manuel
app.get('/api/cron/lieux-emails', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isValidToken = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !isValidToken && process.env.NODE_ENV === 'production') {
    return res.status(401).send('Non autorisé');
  }
  try {
    await executeDailyLieuxEmails();
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur HTTP cron lieux-emails:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== CRON JOB : DÉCLARATION MENSUELLE DE TAXE DE SÉJOUR =====
// S'exécute le 1er de chaque mois à 09:00
const executeMonthlyTaxReport = async () => {
  console.log("Exécution du Cron Job : Rapport mensuel de Taxe de Séjour...");
  try {
    const today = new Date();
    let prevMonth = today.getMonth() - 1;
    let prevYear = today.getFullYear();
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear -= 1;
    }

    const prevMonthStart = new Date(prevYear, prevMonth, 1);
    const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] },
        dateDebut: {
          gte: prevMonthStart,
          lte: prevMonthEnd
        }
      },
      include: { occupants: true }
    });

    let totalTaxeSejour = 0;
    let nbAdultesTotal = 0;
    let nbNuitsTotal = 0;

    reservations.forEach(r => {
      const { taxeSejour } = calculerDetailsFinanciersReservation(r);
      totalTaxeSejour += taxeSejour;

      // Calcul des détails pour affichage informatif
      if (r.dateDebut && r.dateFin) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        nbNuitsTotal += nuits;

        let nbAdultes = 0;
        if (r.occupants && r.occupants.length > 0) {
          nbAdultes = r.occupants.filter(o => o.estAdulte).length;
        } else if (r.chambresDetails && typeof r.chambresDetails === 'object') {
          Object.values(r.chambresDetails).forEach(room => {
            nbAdultes += parseInt(room.adultes || 0);
          });
        }
        nbAdultesTotal += nbAdultes;
      }
    });

    totalTaxeSejour = Math.round(totalTaxeSejour * 100) / 100;

    const monthNames = [
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    const prevMonthLabel = monthNames[prevMonth];
    const currentYearLabel = prevYear;

    const toEmails = 'valerie.hostein@mucomnisports.fr, johanna.journet@mucomnisports.fr';

    await sendMail({
      to: toEmails,
      subject: `📊 [TAXE DE SÉJOUR] Déclaration mensuelle - ${prevMonthLabel} ${currentYearLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #004B93; padding: 24px; text-align: center; border-bottom: 4px solid #FFD700;">
            <span style="color: #FFD700; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">Gîte de la Maladrerie</span>
            <h2 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">📊 Taxe de Séjour à Déclarer</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
              Bonjour,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Voici le récapitulatif de la taxe de séjour collectée pour les séjours ayant débuté durant le mois de <strong>${prevMonthLabel} ${currentYearLabel}</strong> :
            </p>

            <div style="margin: 24px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; text-align: center;">
              <span style="color: #166534; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Montant Total à Déclarer</span>
              <span style="font-size: 32px; font-weight: 900; color: #15803d;">${totalTaxeSejour.toFixed(2)} €</span>
            </div>

            <div style="margin: 24px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px;">
              <h4 style="margin: 0 0 12px 0; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Détails de la période (${prevMonthLabel} ${currentYearLabel}) :</h4>
              <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 13px; color: #334155;">
                <tr>
                  <td width="50%" style="padding: 6px 0; color: #64748b;">Nombre de réservations :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${reservations.length}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Adultes cumulés :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${nbAdultesTotal}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Nuits cumulées :</td>
                  <td style="padding: 6px 0; font-weight: bold; text-align: right;">${nbNuitsTotal}</td>
                </tr>
              </table>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px;">
              Veuillez déclarer ce montant sur la plateforme extranet officielle de la taxe de séjour en cliquant sur le bouton vert ci-dessous :
            </p>
            
            <p style="text-align: center; margin-top: 25px; margin-bottom: 15px;">
              <a href="https://taxe.3douest.com/extranet/accueil.php" target="_blank" style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">Accéder à la plateforme de déclaration</a>
            </p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9;">
            Cet e-mail automatique est envoyé par le système de réservation du Gîte de la Maladrerie.
          </div>
        </div>
      `
    });

    console.log(`Cron mensuel taxe de séjour exécuté avec succès. E-mail envoyé à : ${toEmails}`);
  } catch (error) {
    console.error("Erreur dans le cron mensuel taxe de séjour :", error);
  }
};

cron.schedule('0 9 1 * *', async () => {
  try {
    await executeMonthlyTaxReport();
  } catch (error) {
    console.error("Erreur dans le cron mensuel taxe de séjour :", error);
  }
});

app.get('/api/cron/tax-report', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const isValidToken = req.query.token === process.env.CRON_SECRET;
  if (!isVercelCron && !isValidToken && process.env.NODE_ENV === 'production') {
    return res.status(401).send('Non autorisé');
  }
  try {
    await executeMonthlyTaxReport();
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur HTTP cron tax-report:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CRON HEBDOMADAIRE - COMMANDES REPAS CUISINE CENTRALE
// Envoi chaque jeudi à 11h (Paris) du récapitulatif des déjeuners et dîners pour la semaine suivante
// ==========================================

const executeWeeklyCuisineEmail = async () => {
  try {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilNextMonday = ((8 - dayOfWeek) % 7) || 7;
    
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilNextMonday);
    nextMonday.setHours(0, 0, 0, 0);
    
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    nextSunday.setHours(23, 59, 59, 999);

    console.log(`[Cron Cuisine] Recherche des repas du ${nextMonday.toISOString().slice(0,10)} au ${nextSunday.toISOString().slice(0,10)}`);

    const reservations = await prisma.reservation.findMany({
      where: {
        dateDebut: { lte: nextSunday },
        dateFin: { gte: nextMonday },
        OR: [
          { statut: { in: ['ACCEPTEE', 'RESERVE', 'CONFIRMEE'] } },
          { statutPaiement: { in: ['ACOMPTE_PAYE', 'PAYE'] } }
        ]
      },
      include: { client: true }
    });

    if (!reservations || reservations.length === 0) {
      console.log('[Cron Cuisine] Aucune réservation avec repas pour la semaine prochaine.');
      return { sent: false, reason: 'Aucune réservation pour la période' };
    }

    const clientBlocks = [];
    const joursSemaine = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    for (const resa of reservations) {
      if (!resa.repas || Object.keys(resa.repas).length === 0) continue;

      const clientNom = resa.client ? `${resa.client.prenom || ''} ${resa.client.nom || ''}`.trim() : 'Client inconnu';
      const dateDebut = new Date(resa.dateDebut).toLocaleDateString('fr-FR');
      const dateFin = new Date(resa.dateFin).toLocaleDateString('fr-FR');

      let tableRows = '';
      let hasAnyMeal = false;

      for (let d = new Date(nextMonday); d <= nextSunday; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().slice(0, 10);
        const dayRepas = resa.repas[dateKey];
        if (!dayRepas) continue;

        const dj = dayRepas.DEJEUNER || {};
        const dn = dayRepas.DINER || {};

        const djAdulte = dj.ADULTE || 0;
        const djEnfant = (dj.ENFANT_MOINS_12 || 0) + (dj.ENFANT_MOINS_5 || 0);
        const dnAdulte = dn.ADULTE || 0;
        const dnEnfant = (dn.ENFANT_MOINS_12 || 0) + (dn.ENFANT_MOINS_5 || 0);

        // La cuisine centrale ne prépare QUE les déjeuners et dîners (les petits-déjeuners sont préparés sur place)
        if (djAdulte + djEnfant + dnAdulte + dnEnfant === 0) continue;
        hasAnyMeal = true;

        const jourIndex = (d.getDay() + 6) % 7; // 0=lundi
        const jourNom = joursSemaine[jourIndex];
        const dateFormatted = d.toLocaleDateString('fr-FR');

        tableRows += `<tr>
          <td style="padding:6px 12px;border:1px solid #ddd;">${jourNom} ${dateFormatted}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${djAdulte}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${djEnfant}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${dnAdulte}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:center;">${dnEnfant}</td>
        </tr>`;
      }

      if (!hasAnyMeal) continue;

      clientBlocks.push(`
        <div style="margin-bottom:24px;border:1px solid #ccc;border-radius:8px;padding:16px;background:#fafafa;">
          <h3 style="margin:0 0 8px 0;color:#333;">👤 ${clientNom}</h3>
          <p style="margin:0 0 12px 0;color:#666;">Séjour du ${dateDebut} au ${dateFin}</p>
          <table style="border-collapse:collapse;width:100%;">
            <thead>
              <tr style="background:#2c3e50;color:white;">
                <th style="padding:8px 12px;border:1px solid #ddd;">Jour</th>
                <th style="padding:8px 12px;border:1px solid #ddd;">Déjeuner Adulte</th>
                <th style="padding:8px 12px;border:1px solid #ddd;">Déjeuner Enfant</th>
                <th style="padding:8px 12px;border:1px solid #ddd;">Dîner Adulte</th>
                <th style="padding:8px 12px;border:1px solid #ddd;">Dîner Enfant</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `);
    }

    if (clientBlocks.length === 0) {
      console.log('[Cron Cuisine] Aucun repas (déjeuner/dîner) commandé pour la semaine prochaine.');
      return { sent: false, reason: 'Aucun déjeuner ou dîner commandé pour la semaine prochaine' };
    }

    const periodeLabel = `${nextMonday.toLocaleDateString('fr-FR')} au ${nextSunday.toLocaleDateString('fr-FR')}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#2c3e50,#3498db);color:white;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;font-size:22px;">🍽️ Commandes de repas - Semaine du ${periodeLabel}</h1>
          <p style="margin:8px 0 0 0;opacity:0.9;">Gîte de la Maladrerie - MUC Omnisports</p>
        </div>
        <div style="padding:24px;background:white;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
          <p style="color:#555;margin-bottom:20px;">Bonjour,<br><br>Veuillez trouver ci-dessous le récapitulatif des commandes de repas (déjeuners & dîners) pour la semaine du <strong>${periodeLabel}</strong>.<br>Chaque groupe dispose de son propre détail (livraison en bac inox par groupe).</p>
          ${clientBlocks.join('')}
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="color:#888;font-size:13px;">Ce récapitulatif a été généré automatiquement. Pour toute question, contactez-nous à l'adresse <a href="mailto:dr.mucomnisports@gmail.com">dr.mucomnisports@gmail.com</a>.</p>
        </div>
      </div>
    `;

    const cuisineEmail = process.env.CUISINE_EMAIL || process.env.ADMIN_EMAIL || 'cuisine@millau.fr';
    const ccEmails = 'david.roujet@mucomnisports.fr,philippe.morereau@mucomnisports.fr';

    await sendMail({
      to: cuisineEmail,
      cc: ccEmails,
      subject: `Commandes de repas - Semaine du ${periodeLabel} - Gîte de la Maladrerie`,
      html: htmlContent
    });

    console.log(`[Cron Cuisine] Récapitulatif envoyé avec succès pour la semaine du ${periodeLabel} (${clientBlocks.length} groupe(s)).`);
    return { sent: true, groups: clientBlocks.length, period: periodeLabel };

  } catch (error) {
    console.error('[Cron Cuisine] Erreur:', error);
    throw error;
  }
};

app.get('/api/cron/cuisine', async (req, res) => {
  try {
    const result = await executeWeeklyCuisineEmail();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur HTTP cron cuisine:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint manuel pour déclencher l'envoi Cuisine depuis l'Espace Admin
app.post('/api/admin/cron/cuisine', checkAuth, async (req, res) => {
  try {
    const result = await executeWeeklyCuisineEmail();
    res.json({ success: true, message: "E-mail de commande cuisine envoyé avec succès.", ...result });
  } catch (error) {
    console.error('Erreur déclenchement manuel cuisine:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint pour récupérer le statut d'une session Stripe de paiement
app.get('/api/stripe/session-status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session Stripe introuvable' });
    }

    const reservationId = session.metadata?.reservationId;
    const paymentType = session.metadata?.paymentType ? session.metadata.paymentType.toLowerCase() : 'inconnu';

    let reservation = null;
    if (reservationId) {
      reservation = await prisma.reservation.findUnique({
        where: { id: parseInt(reservationId) },
        include: { client: true }
      });
    }

    res.json({
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total ? session.amount_total / 100 : 0,
      paymentType,
      customerDetails: {
        name: session.customer_details?.name || reservation?.client?.nom || '',
        email: session.customer_details?.email || reservation?.client?.email || ''
      },
      reservation: reservation ? {
        id: reservation.id,
        numeroDevis: reservation.numeroDevis,
        dateDebut: reservation.dateDebut,
        dateFin: reservation.dateFin,
        chambres: reservation.chambres,
        montantTotal: reservation.prixTotal,
        statutPaiement: reservation.statutPaiement
      } : null
    });
  } catch (error) {
    console.error("Erreur récupération statut session Stripe:", error);
    res.status(500).json({ error: 'Erreur lors de la récupération des informations de paiement' });
  }
});

// Endpoint pour récupérer les infos de la réservation pour la saisie des occupants par le client
app.get('/api/reservation/occupants/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenDevis: token },
      include: { client: true, occupants: true }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Lien de saisie des occupants invalide ou expiré." });
    }

    // Calculer les totaux attendus à partir de chambresDetails
    let totalAdultes = 0;
    let totalMineurs = 0;
    
    if (reservation.chambresDetails && typeof reservation.chambresDetails === 'object') {
      Object.values(reservation.chambresDetails).forEach(ch => {
        totalAdultes += parseInt(ch.adultes || 0);
        totalMineurs += parseInt(ch.enfants || ch.mineurs || 0);
      });
    }

    res.json({
      ...reservation,
      clientNom: reservation.client.nom,
      totalAdultes,
      totalMineurs
    });
  } catch (error) {
    console.error("Erreur récupération infos occupants:", error);
    res.status(500).json({ error: "Erreur serveur lors de la récupération des détails." });
  }
});

// Endpoint pour enregistrer les occupants saisis par le client
app.post('/api/reservation/occupants/:token', async (req, res) => {
  const { token } = req.params;
  const { occupants } = req.body;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenDevis: token }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien expiré." });
    }

    if (occupants && Array.isArray(occupants)) {
      // 1. Supprimer les occupants existants
      await prisma.occupant.deleteMany({
        where: { reservationId: reservation.id }
      });

      // 2. Créer les nouveaux occupants
      await prisma.occupant.createMany({
        data: occupants.map(occ => {
          const estAdulte = occ.estAdulte === true || occ.estAdulte === 'true';
          let occNom = occ.nom;
          let occPrenom = occ.prenom;
          
          if (!estAdulte && (!occNom?.trim() && !occPrenom?.trim())) {
            occNom = "Mineur";
            occPrenom = "";
          }
          
          const age = (occ.age !== undefined && occ.age !== null && occ.age !== '') ? parseInt(occ.age) : null;
          let nationalite = occ.nationalite;
          if (nationalite === true || nationalite === 'true') {
            nationalite = 'Française';
          } else if (nationalite === false || nationalite === 'false') {
            nationalite = 'Étrangère';
          } else if (!nationalite) {
            nationalite = 'Française';
          }

          return {
            reservationId: reservation.id,
            nom: occNom || '',
            prenom: occPrenom || '',
            estAdulte,
            age,
            nationalite
          };
        })
      });

      // 3. Optionnel : Expire le token pour que le lien ne puisse plus être utilisé
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { tokenDevis: null }
      });

      res.json({ success: true, message: "Les occupants ont été enregistrés avec succès." });
    } else {
      res.status(400).json({ error: "Données des occupants invalides." });
    }
  } catch (error) {
    console.error("Erreur enregistrement occupants:", error);
    res.status(500).json({ error: "Erreur serveur lors de la validation des occupants." });
  }
});

// Endpoint pour envoyer les liens de signature des fiches de police par mail au client
app.post('/api/admin/reservations/:id/send-police-email', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reservation) return res.status(404).json({ error: "Réservation introuvable." });
    
    let token = reservation.tokenPolice;
    if (!token) {
      token = require('crypto').randomBytes(24).toString('hex');
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { tokenPolice: token }
      });
    }
    
    const frontendUrl = process.env.FRONTEND_URL || (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? 'https://www.gite-maladrerie.fr' : 'http://localhost:5173');
    const link = `${frontendUrl}/sign-police?token=${token}`;
    
    const adminSignatureHTML = await getAdminSignatureHTML(req.user.email || 'dr.mucomnisports@gmail.com');
    
    await sendMail({
      to: reservation.client.email,
      subject: `Saisie et Signature des Fiches de Police - Gîte de la Maladrerie`,
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
              <p>Afin de préparer au mieux votre accueil et de respecter la réglementation en vigueur, nous vous invitons à remplir et signer en ligne la <strong>Fiche Individuelle de Police</strong> pour chaque occupant (adulte et enfant) de votre groupe.</p>
              <p>Cette démarche obligatoire ne vous prendra que quelques instants.</p>
              <p style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background-color: #004B93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accéder aux Fiches de Police</a>
              </p>
              <p>Nous vous remercions pour votre collaboration et restons à votre entière disposition pour toute information complémentaire.</p>
              ${adminSignatureHTML}
            </td></tr>
          </table></td></tr>
        </table>
      `
    });
    
    res.json({ success: true, message: "E-mail de signature envoyé avec succès." });
  } catch (err) {
    console.error("Erreur envoi email police:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'envoi de l'e-mail." });
  }
});

// Endpoint public pour récupérer les infos de la réservation avec le token de police
app.get('/api/reservation/police-info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenPolice: token },
      include: { client: true, occupants: true }
    });
    if (!reservation) return res.status(404).json({ error: "Lien invalide ou expiré." });
    
    res.json({
      id: reservation.id,
      numeroDevis: reservation.numeroDevis,
      dateDebut: reservation.dateDebut,
      dateFin: reservation.dateFin,
      client: {
        nom: reservation.client.nom,
        email: reservation.client.email,
        telephone: reservation.client.telephone,
        adressePostale: reservation.client.adressePostale
      },
      occupants: reservation.occupants,
      fichesPolice: reservation.fichesPolice
    });
  } catch (err) {
    console.error("Erreur récup police-info:", err);
    res.status(500).json({ error: "Erreur serveur lors de la récupération des informations." });
  }
});

// Endpoint public pour signer une fiche de police
app.post('/api/reservation/police-sign/:token', async (req, res) => {
  const { token } = req.params;
  const {
    occupantId,
    nom,
    prenom,
    dateNaissance,
    lieuNaissance,
    nationalite,
    domicile,
    telephone,
    email,
    signature,
    dateArrivee,
    dateDepart
  } = req.body;
  
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenPolice: token }
    });
    if (!reservation) return res.status(404).json({ error: "Réservation introuvable." });
    
    let fiches = [];
    if (reservation.fichesPolice) {
      fiches = Array.isArray(reservation.fichesPolice) 
        ? reservation.fichesPolice 
        : JSON.parse(JSON.stringify(reservation.fichesPolice));
    }
    
    const newFiche = {
      occupantId: occupantId ? parseInt(occupantId) : null,
      nom,
      prenom,
      dateNaissance,
      lieuNaissance,
      nationalite,
      domicile,
      telephone,
      email,
      signature,
      dateArrivee,
      dateDepart,
      signedAt: new Date().toISOString()
    };
    
    let updated = false;
    if (occupantId) {
      const idx = fiches.findIndex(f => f.occupantId === parseInt(occupantId));
      if (idx > -1) {
        fiches[idx] = newFiche;
        updated = true;
      }
    }
    if (!updated) {
      fiches.push(newFiche);
    }
    
    const updatedReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { fichesPolice: fiches },
      include: { client: true, occupants: true }
    });
    
    res.json({
      id: updatedReservation.id,
      numeroDevis: updatedReservation.numeroDevis,
      dateDebut: updatedReservation.dateDebut,
      dateFin: updatedReservation.dateFin,
      client: {
        nom: updatedReservation.client.nom,
        email: updatedReservation.client.email,
        telephone: updatedReservation.client.telephone,
        adressePostale: updatedReservation.client.adressePostale
      },
      occupants: updatedReservation.occupants,
      fichesPolice: updatedReservation.fichesPolice
    });
  } catch (err) {
    console.error("Erreur signature police publique:", err);
    res.status(500).json({ error: "Erreur serveur lors de la sauvegarde." });
  }
});

// --- ENDPOINTS POUR L'ÉTAT DES LIEUX ET L'INVENTAIRE (CLIENT) ---

// 1. Récupérer les informations de la réservation avec le token d'état des lieux
app.get('/api/reservation/lieux-info/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenLieuxSign: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Lien d'état des lieux invalide ou expiré." });
    }
    
    res.json({
      id: reservation.id,
      numeroDevis: reservation.numeroDevis,
      dateDebut: reservation.dateDebut,
      dateFin: reservation.dateFin,
      signatureLieuxDate: reservation.signatureLieuxDate,
      signatureLieuxName: reservation.signatureLieuxName,
      signatureLieuxIp: reservation.signatureLieuxIp,
      signatureLieuxRemarques: reservation.signatureLieuxRemarques,
      client: {
        nom: reservation.client?.nom || '',
        prenom: reservation.client?.prenom || '',
        email: reservation.client?.email || '',
        telephone: reservation.client?.telephone || '',
        adressePostale: reservation.client?.adressePostale || ''
      }
    });
  } catch (err) {
    console.error("Erreur récup lieux-info:", err);
    res.status(500).json({ error: "Erreur serveur lors de la récupération des détails." });
  }
});

// 2. Signer l'état des lieux et l'inventaire en ligne
app.post('/api/reservation/lieux-sign/:token', async (req, res) => {
  const { token } = req.params;
  const { nomSignataire, signature, remarques } = req.body;
  
  if (!nomSignataire || !nomSignataire.trim()) {
    return res.status(400).json({ error: "Le nom du signataire est requis." });
  }
  if (!signature) {
    return res.status(400).json({ error: "La signature manuscrite est obligatoire." });
  }

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { tokenLieuxSign: token },
      include: { client: true }
    });
    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const updatedReservation = await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        signatureLieuxName: nomSignataire,
        signatureLieuxDate: new Date(),
        signatureLieuxIp: ip,
        signatureLieuxImage: signature,
        signatureLieuxRemarques: remarques || ''
      },
      include: { client: true }
    });

    // Envoyer un mail de confirmation avec le PDF signé
    try {
      const { generateLieuxPDF } = require('./utils/generateLieuxPDF');
      const pdfBuffer = await generateLieuxPDF(updatedReservation);
      
      if (updatedReservation.client?.email && updatedReservation.client?.email !== 'N/A') {
        await sendMail({
          to: updatedReservation.client.email,
          subject: "✍️ Confirmation d'émargement : État des lieux & Inventaire - Gîte de la Maladrerie",
          attachments: [
            {
              content: pdfBuffer.toString('base64'),
              name: `Etat_des_lieux_signe_${updatedReservation.id}.pdf`
            }
          ],
          html: `
            <div style="font-family: sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #004B93; text-align: center;">Gîte de La Maladrerie</h2>
              <p>Bonjour ${updatedReservation.client.prenom || updatedReservation.client.nom},</p>
              <p>Nous vous confirmons la bonne réception de votre émargement en ligne de l'<strong>état des lieux</strong> et de l'<strong>inventaire du gîte</strong>, effectué ce jour.</p>
              <p>Vous trouverez ci-joint l'exemplaire signé au format PDF pour vos archives.</p>
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #004B93;">
                <p style="margin: 0;"><strong>Signataire :</strong> ${nomSignataire}</p>
                <p style="margin: 5px 0 0 0;"><strong>Date d'émargement :</strong> ${new Date().toLocaleString('fr-FR')}</p>
                ${remarques ? `<p style="margin: 5px 0 0 0;"><strong>Observations signalées :</strong> ${remarques}</p>` : ''}
              </div>
              <p>Nous vous souhaitons un excellent séjour au Gîte de la Maladrerie !</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #666; text-align: center;">Ce mail est automatique, merci de ne pas y répondre directement.</p>
            </div>
          `
        });
      }
    } catch (mailErr) {
      console.error("Erreur lors de l'envoi du mail de confirmation état des lieux:", mailErr);
    }

    res.json(updatedReservation);
  } catch (err) {
    console.error("Erreur lors de la signature de l'état des lieux:", err);
    res.status(500).json({ error: "Erreur serveur lors de l'enregistrement de l'émargement." });
  }
});

// 3. Télécharger le contrat d'état des lieux signé en format PDF
app.get('/api/reservation/lieux-pdf/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const reservation = await prisma.reservation.findFirst({
      where: {
        OR: [
          { tokenLieuxSign: token },
          { tokenDevis: token },
          { tokenModification: token }
        ]
      },
      include: { client: true }
    });

    if (!reservation) {
      return res.status(404).json({ error: "Réservation introuvable ou lien invalide." });
    }

    const { generateLieuxPDF } = require('./utils/generateLieuxPDF');
    const pdfBuffer = await generateLieuxPDF(reservation);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Etat_des_lieux_${reservation.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur téléchargement PDF lieux:", error);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF de l\'état des lieux' });
  }
});

// ===================================
// PORTAIL INTERVENANT ME & PROFILE & MISSIONS STATUS
// ===================================

// Obtenir le profil de l'intervenant connecté
app.get('/api/intervenant/me', checkAuth, async (req, res) => {
  if (req.user.role !== 'intervenant') {
    return res.status(403).json({ error: 'Accès interdit - Droits intervenant requis' });
  }
  try {
    const intervenant = await prisma.intervenant.findUnique({
      where: { id: req.user.id },
      include: { disponibilites: true }
    });
    if (!intervenant) return res.status(404).json({ error: 'Compte non trouvé' });
    res.json(intervenant);
  } catch (error) {
    console.error('Erreur récup profil intervenant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

// Mettre à jour le profil et les disponibilités de l'intervenant connecté
app.put('/api/intervenant/profile', checkAuth, async (req, res) => {
  if (req.user.role !== 'intervenant') {
    return res.status(403).json({ error: 'Accès interdit - Droits intervenant requis' });
  }
  const { nom, prenom, email, telephone, password, disponibilites, recevoirRappels } = req.body;
  try {
    const dataToUpdate = { nom, prenom, email, telephone };
    if (password && password.trim() !== '') {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }
    if (recevoirRappels !== undefined) {
      dataToUpdate.recevoirRappels = recevoirRappels;
    }

    // Supprimer les anciennes disponibilités
    await prisma.disponibilite.deleteMany({ where: { intervenantId: req.user.id } });

    const updated = await prisma.intervenant.update({
      where: { id: req.user.id },
      data: {
        ...dataToUpdate,
        disponibilites: {
          create: (disponibilites || []).map(d => ({
            dateDebut: new Date(d.dateDebut),
            dateFin: new Date(d.dateFin)
          }))
        }
      },
      include: { disponibilites: true }
    });

    res.json(updated);
  } catch (error) {
    console.error('Erreur mise à jour profil intervenant:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
  }
});

// Accepter/refuser une mission spécifique
app.put('/api/intervenant/missions/:id/status', checkAuth, async (req, res) => {
  if (req.user.role !== 'intervenant') {
    return res.status(403).json({ error: 'Accès interdit - Droits intervenant requis' });
  }
  const { id } = req.params;
  const { statut } = req.body; // ACCEPTEE ou REFUSEE

  if (!['ACCEPTEE', 'REFUSEE'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  try {
    const mission = await prisma.mission.findUnique({
      where: { id: parseInt(id) },
      include: { reservation: true }
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission non trouvée' });
    }

    if (mission.intervenantId !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres missions' });
    }

    const updated = await prisma.mission.update({
      where: { id: parseInt(id) },
      data: { statut },
      include: { intervenant: true }
    });

    // Envoyer mail à l'admin
    try {
      const reservation = mission.reservation;
      const intervenant = updated.intervenant;
      const actionLabel = statut === 'ACCEPTEE' ? 'accepté' : 'refusé';
      const adminEmail = await getAdminEmailsForPreference('notifIntervenantMissions',
        (reservation?.validePar && reservation.validePar.includes('@')) ? [reservation.validePar] : []
      );

      await sendMail({
        to: adminEmail,
        subject: 'Mission ' + actionLabel + 'e par ' + intervenant.prenom + ' ' + intervenant.nom,
        html: '<div style="font-family: sans-serif;"><p>Bonjour,</p><p>L\'intervenant <strong>' + intervenant.prenom + ' ' + intervenant.nom + '</strong> a <strong>' + actionLabel + '</strong> sa mission de <strong>' + updated.typeMission + '</strong> pour la réservation du <strong>' + (reservation ? new Date(reservation.dateDebut).toLocaleDateString('fr-FR') : '') + ' au ' + (reservation ? new Date(reservation.dateFin).toLocaleDateString('fr-FR') : '') + '</strong>.</p><p>Vous pouvez consulter les détails sur l\'espace administration.</p></div>'
      });
    } catch (err) {
      console.error('Erreur envoi email admin statut mission:', err);
    }

    res.json(updated);
  } catch (error) {
    console.error('Erreur mise à jour statut mission:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la mission' });
  }
});

app.get('/api/documents/:filename', (req, res) => {
  const { filename } = req.params;
  const allowedFiles = {
    'inventaire': 'Inventaire - 15-04-2026.docx',
    'etat-des-lieux': 'ÉTAT DES LIEUX GITE - Client.docx'
  };

  const actualFilename = allowedFiles[filename];
  if (!actualFilename) {
    return res.status(404).json({ error: "Fichier non trouvé" });
  }

  const filePath = path.join(__dirname, 'assets', actualFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier physique introuvable sur le serveur" });
  }

  res.download(filePath, actualFilename);
});

// --- ENDPOINT ICS/ICAL POUR SYNCHRONISATION AGENDA OUTLOOK ---
app.get(['/api/calendar/ical', '/api/calendar/ical/:tokenParam'], async (req, res) => {
  const token = req.params.tokenParam || req.query.token;
  const expectedToken = process.env.CALENDAR_TOKEN || 'MUC_MALADRERIE_SYNC';
  if (token !== expectedToken) {
    return res.status(403).send("Token de synchronisation invalide");
  }

  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] }
      },
      include: {
        client: true
      }
    });

    let icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gite de la Maladrerie//Calendar Sync//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Gîte de la Maladrerie - Réservations',
      'X-WR-TIMEZONE:Europe/Paris'
    ];

    reservations.forEach(r => {
      const start = new Date(r.dateDebut);
      const end = new Date(r.dateFin);

      // Format YYYYMMDD
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const uid = `reservation-${r.id}@gite-la-maladrerie.fr`;
      
      // Nettoyage et formatage du résumé
      const safeNom = r.client.nom.replace(/[,;]/g, ' ');
      const safeStructure = r.structure ? ` (${r.structure.replace(/[,;]/g, ' ')})` : '';
      const summary = `Gîte : Résa #${r.id} - ${safeNom}${safeStructure}`;
      
      // Description détaillée
      let descLines = [
        `Client : ${safeNom}`,
        `Téléphone : ${r.client.telephone}`,
        `Email : ${r.client.email}`,
        r.structure ? `Structure : ${r.structure}` : null,
        `Chambres : ${(r.chambres || []).join(', ')}`,
        `Montant total : ${r.prixTotal ? `${r.prixTotal.toFixed(2)} €` : 'Non calculé'}`,
        `Statut Paiement : ${r.statutPaiement}`,
        `Statut Caution : ${r.statutCaution}`
      ].filter(Boolean);

      const description = descLines.join('\\n');

      icalContent.push('BEGIN:VEVENT');
      icalContent.push(`UID:${uid}`);
      icalContent.push(`DTSTAMP:${formatDate(new Date())}T120000Z`);
      icalContent.push(`DTSTART;VALUE=DATE:${formatDate(start)}`);
      icalContent.push(`DTEND;VALUE=DATE:${formatDate(end)}`);
      icalContent.push(`SUMMARY:${summary}`);
      icalContent.push(`DESCRIPTION:${description}`);
      icalContent.push('END:VEVENT');
    });

    icalContent.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reservations.ics"');
    res.send(icalContent.join('\r\n'));
  } catch (error) {
    console.error("Erreur génération iCal :", error);
    res.status(500).send("Erreur lors de la génération du calendrier");
  }
});

// --- ENDPOINT POUR TÉLÉCHARGER LA FACTURE PDF D'UNE RÉSERVATION (DUPLICATA SIMPLIFIÉ) ---
app.get('/api/admin/reservations/:id/facture-pdf', checkAuth, async (req, res) => {
  const { id } = req.params;
  const includeOccupants = req.query.includeOccupants === 'true';
  try {
    const { pdfBuffer, pdfFileName } = await getInvoicePdfBuffer(parseInt(id), includeOccupants);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erreur génération facture PDF:", error);
    res.status(500).json({ error: error.message || 'Erreur lors de la génération de la facture.' });
  }
});

// --- ENDPOINT POUR TÉLÉCHARGER TOUTES LES FACTURES D'UNE PÉRIODE EN ZIP ---
app.get('/api/admin/factures/period/zip', checkAuth, async (req, res) => {
  const { dateDebut, dateFin } = req.query;
  if (!dateDebut || !dateFin) {
    return res.status(400).json({ error: "Les dates de début et de fin sont requises." });
  }

  try {
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    end.setHours(23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] },
        dateDebut: {
          gte: start,
          lte: end
        }
      },
      orderBy: {
        dateDebut: 'asc'
      }
    });

    if (reservations.length === 0) {
      return res.status(404).json({ error: "Aucune facture trouvée pour cette période." });
    }

    const JSZip = require('jszip');
    const zip = new JSZip();

    for (const r of reservations) {
      try {
        const { pdfBuffer, pdfFileName } = await getInvoicePdfBuffer(r.id);
        zip.file(pdfFileName, pdfBuffer);
      } catch (pdfErr) {
        console.error(`Erreur génération facture pour résa #${r.id} dans le ZIP:`, pdfErr);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const debutStr = dateDebut.replace(/-/g, '');
    const finStr = dateFin.replace(/-/g, '');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Factures_${debutStr}_au_${finStr}.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    console.error("Erreur génération ZIP factures :", error);
    res.status(500).json({ error: 'Erreur lors de la génération du fichier ZIP.' });
  }
});

// --- ENDPOINT POUR OBTENIR LES RESERVATIONS COMPORTANT UN SEJOUR SUR UNE PERIODE ---
app.get('/api/admin/factures/period', checkAuth, async (req, res) => {
  const { dateDebut, dateFin } = req.query;
  if (!dateDebut || !dateFin) {
    return res.status(400).json({ error: "Les dates de début et de fin sont requises." });
  }

  try {
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    end.setHours(23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] },
        dateDebut: {
          gte: start,
          lte: end
        }
      },
      include: {
        client: true
      },
      orderBy: {
        dateDebut: 'asc'
      }
    });

    res.json(reservations);
  } catch (error) {
    console.error("Erreur récupération réservations par période :", error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des réservations.' });
  }
});

// --- HELPER FORMATAGE LIGNE SAGE 100 PNM (FORMAT 164 CARACTÈRES STRICT) ---
function formatSagePNMLine164({
  codeJournal = 'VT ',
  datePiece,
  typePiece = 'FC',
  compteGeneral,
  typeCompte = 'G',
  compteAux = '',
  refEcriture = '',
  libelle = '',
  modePaiement = 'V',
  dateEcheance,
  sens = 'D',
  montant = 0,
  typeEcriture = 'N',
  numPiece = '',
}) {
  const padRight = (str, len, char = ' ') => String(str || '').padEnd(len, char).slice(0, len);
  const padLeft = (str, len, char = ' ') => String(str || '').padStart(len, char).slice(-len);

  const formatDateDDMMYY = (d) => {
    if (!d) return '      ';
    const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '      ';
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yy = String(dateObj.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  };

  const fCodeJournal = padRight(codeJournal, 3);
  const fDatePiece = formatDateDDMMYY(datePiece);
  const fTypePiece = padRight(typePiece, 2);
  const fCompteGen = padRight(compteGeneral, 13, '0');
  const fTypeCompte = padRight(typeCompte, 1);
  const fCompteAux = typeCompte === 'X' ? padRight(compteAux, 13) : padRight('', 13);
  const fRefEcriture = padRight(refEcriture, 13);
  const fLibelle = padRight(libelle, 25);
  const fModePaiement = padRight(modePaiement, 1);
  const fDateEcheance = formatDateDDMMYY(dateEcheance || datePiece);
  const fSens = padRight(sens, 1);
  const formattedAmount = (Math.abs(Number(montant) || 0)).toFixed(2);
  const fMontant = padLeft(formattedAmount, 20);
  const fTypeEcriture = padRight(typeEcriture, 1);
  const fNumPiece = padRight(numPiece, 7);
  const fZoneReservee = padRight('', 26);
  const fDevise1 = 'EUR';
  const fMontantDevise = fMontant;
  const fDevise2 = 'EUR';

  return `${fCodeJournal}${fDatePiece}${fTypePiece}${fCompteGen}${fTypeCompte}${fCompteAux}${fRefEcriture}${fLibelle}${fModePaiement}${fDateEcheance}${fSens}${fMontant}${fTypeEcriture}${fNumPiece}${fZoneReservee}${fDevise1}${fMontantDevise}${fDevise2}`;
}

// --- ENDPOINT POUR EXPORTER LES ÉCRITURES COMPTABLES AU FORMAT SAGE 100 (.PNM 164 CARACTÈRES) ---
app.get('/api/admin/factures/period/pnm', checkAuth, async (req, res) => {
  const { dateDebut, dateFin } = req.query;
  if (!dateDebut || !dateFin) {
    return res.status(400).json({ error: "Les dates de début et de fin sont requises." });
  }

  try {
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    end.setHours(23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: { in: ['RESERVE', 'TERMINE'] },
        dateDebut: {
          gte: start,
          lte: end
        }
      },
      include: {
        client: true,
        occupants: true
      },
      orderBy: {
        dateDebut: 'asc'
      }
    });

    // Ligne 1 : Nom Société / Établissement (30 car. max)
    const companyHeader = "GITE DE LA MALADRERIE".padEnd(30, ' ').slice(0, 30);
    const lines = [companyHeader];

    for (const r of reservations) {
      let totalRepas = 0;
      if (r.repas) {
        Object.values(r.repas).forEach(jour => {
          if (jour && typeof jour === 'object') {
            Object.values(jour).forEach(repasObj => {
              if (repasObj && typeof repasObj === 'object') {
                totalRepas += (parseFloat(repasObj.nb) || 0) * (parseFloat(repasObj.prix) || 0);
              }
            });
          }
        });
      }

      let totalSalles = 0;
      if (r.salles) {
        Object.values(r.salles).forEach(salle => {
          if (salle && typeof salle === 'object') {
            totalSalles += (parseFloat(salle.nbJours) || 0) * (parseFloat(salle.prixFormule) || 0);
          }
        });
      }

      let nuits = 0;
      if (r.dateDebut && r.dateFin) {
        const dStart = new Date(r.dateDebut);
        const dEnd = new Date(r.dateFin);
        nuits = Math.max(1, Math.ceil((dEnd - dStart) / (1000 * 60 * 60 * 24)));
      }

      let nbAdultes = 0;
      let nbOccupants = 0;
      if (r.occupants && r.occupants.length > 0) {
        nbAdultes = r.occupants.filter(o => o.estAdulte).length;
        nbOccupants = r.occupants.length;
      } else if (r.chambresDetails && typeof r.chambresDetails === 'object') {
        Object.values(r.chambresDetails).forEach(room => {
          nbAdultes += parseInt(room.adultes || 0);
          nbOccupants += parseInt(room.adultes || 0) + parseInt(room.mineurs || 0);
        });
      }

      let taxeSejour = 0;
      if (nbAdultes > 0 && r.chambres && r.chambres.length > 0) {
        const tarifPers = (nbOccupants >= r.chambres.length * 4) ? 22 : 25;
        taxeSejour = nbAdultes * tarifPers * nuits * 0.044;
      }
      taxeSejour = Math.round(taxeSejour * 100) / 100;

      const prixTotal = parseFloat(r.prixTotal || 0);
      const totalTheoriqueApresRepas = Math.max(0, prixTotal - totalRepas);
      const hebergementTheorique = Math.max(0, totalTheoriqueApresRepas - totalSalles - taxeSejour);

      const clientNom = (r.client ? `${r.client.nom} ${r.client.prenom || ''}` : (r.clientNom || 'Client')).trim();
      const clientCode = r.client ? `CLI${String(r.client.id).padStart(6, '0')}` : `CLI${String(r.id).padStart(6, '0')}`;
      const refFacture = r.numeroFacture || r.numeroDevis || `FA-${r.id}`;
      const datePiece = r.dateDebut || r.createdAt;
      const numPiece = String(r.id).padStart(7, '0');

      let modePaiement = 'V';
      if (r.statutPaiement?.includes('CB') || r.statutPaiement?.includes('STRIPE')) modePaiement = 'U';
      else if (r.statutPaiement?.includes('CHEQUE')) modePaiement = 'C';
      else if (r.statutPaiement?.includes('ESPECES')) modePaiement = 'E';

      // Débit Tiers Client (Compte 4110000000000)
      if (prixTotal > 0) {
        lines.push(formatSagePNMLine164({
          codeJournal: 'VT ',
          datePiece,
          typePiece: 'FC',
          compteGeneral: '4110000000000',
          typeCompte: 'X',
          compteAux: clientCode,
          refEcriture: refFacture,
          libelle: `Facture ${refFacture} ${clientNom}`,
          modePaiement,
          dateEcheance: datePiece,
          sens: 'D',
          montant: prixTotal,
          numPiece
        }));
      }

      // Crédit Hébergement (7061000000000)
      if (hebergementTheorique > 0) {
        lines.push(formatSagePNMLine164({
          codeJournal: 'VT ',
          datePiece,
          typePiece: 'FC',
          compteGeneral: '7061000000000',
          typeCompte: 'G',
          compteAux: '',
          refEcriture: refFacture,
          libelle: `Hébergement ${refFacture}`,
          modePaiement,
          dateEcheance: datePiece,
          sens: 'C',
          montant: hebergementTheorique,
          numPiece
        }));
      }

      // Crédit Restauration (7062000000000)
      if (totalRepas > 0) {
        lines.push(formatSagePNMLine164({
          codeJournal: 'VT ',
          datePiece,
          typePiece: 'FC',
          compteGeneral: '7062000000000',
          typeCompte: 'G',
          compteAux: '',
          refEcriture: refFacture,
          libelle: `Restauration ${refFacture}`,
          modePaiement,
          dateEcheance: datePiece,
          sens: 'C',
          montant: totalRepas,
          numPiece
        }));
      }

      // Crédit Salles (7063000000000)
      if (totalSalles > 0) {
        lines.push(formatSagePNMLine164({
          codeJournal: 'VT ',
          datePiece,
          typePiece: 'FC',
          compteGeneral: '7063000000000',
          typeCompte: 'G',
          compteAux: '',
          refEcriture: refFacture,
          libelle: `Salles ${refFacture}`,
          modePaiement,
          dateEcheance: datePiece,
          sens: 'C',
          montant: totalSalles,
          numPiece
        }));
      }

      // Crédit Taxe de Séjour (4470000000000)
      if (taxeSejour > 0) {
        lines.push(formatSagePNMLine164({
          codeJournal: 'VT ',
          datePiece,
          typePiece: 'FC',
          compteGeneral: '4470000000000',
          typeCompte: 'G',
          compteAux: '',
          refEcriture: refFacture,
          libelle: `Taxe séjour ${refFacture}`,
          modePaiement,
          dateEcheance: datePiece,
          sens: 'C',
          montant: taxeSejour,
          numPiece
        }));
      }
    }

    lines.push('');
    lines.push('');

    const pnmContent = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=windows-1252');
    res.setHeader('Content-Disposition', `attachment; filename="ecritures_sage_100_${dateDebut}_a_${dateFin}.pnm"`);
    res.send(pnmContent);

  } catch (error) {
    console.error("Erreur génération export Sage PNM :", error);
    res.status(500).json({ error: 'Erreur serveur lors de la génération de l\'export Sage PNM.' });
  }
});

// --- ENDPOINT POUR L'AGENDA ICAL PERSONNEL DE L'INTERVENANT ---
app.get('/api/calendar/ical/intervenant/:emailParam', async (req, res) => {
  let email = req.params.emailParam;
  if (!email) return res.status(400).send("Email requis");
  
  email = email.replace(/_at_/g, '@').trim();
  
  try {
    const intervenant = await prisma.intervenant.findUnique({
      where: { email }
    });
    if (!intervenant) return res.status(404).send("Intervenant non trouvé");

    const missions = await prisma.mission.findMany({
      where: {
        intervenantId: intervenant.id,
        statut: { in: ['ACCEPTEE', 'EN_ATTENTE'] }
      },
      include: {
        reservation: {
          include: { client: true }
        }
      }
    });

    let icalContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gite de la Maladrerie//Staff Calendar Sync//FR',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Gîte de la Maladrerie - Mes Missions',
      'X-WR-TIMEZONE:Europe/Paris'
    ];

    missions.forEach(m => {
      const reservation = m.reservation;
      const start = m.date ? new Date(m.date) : new Date(reservation.dateDebut);
      const end = m.date ? new Date(m.date) : new Date(reservation.dateFin);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const uid = `mission-${m.id}@gite-la-maladrerie.fr`;
      const summary = `📌 MA MISSION : ${m.typeMission}`;
      
      const clientName = reservation.client?.nom || 'Inconnu';
      let descLines = [
        `Mission : ${m.typeMission}`,
        `Client : ${clientName}`,
        `Séjour : Du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}`,
        reservation.structure ? `Structure : ${reservation.structure}` : null,
        `Chambres louées : ${(reservation.chambres || []).join(', ')}`,
        `Rémunération prévue : ${m.montant ? `${m.montant.toFixed(2)} €` : 'Non renseignée'}`,
        `Statut Mission : ${m.statut}`
      ].filter(Boolean);

      const description = descLines.join('\\n');

      icalContent.push('BEGIN:VEVENT');
      icalContent.push(`UID:${uid}`);
      icalContent.push(`DTSTAMP:${formatDate(new Date())}T120000Z`);
      if (m.date) {
        icalContent.push(`DTSTART;VALUE=DATE:${formatDate(start)}`);
        const nextDay = new Date(start);
        nextDay.setDate(start.getDate() + 1);
        icalContent.push(`DTEND;VALUE=DATE:${formatDate(nextDay)}`);
      } else {
        icalContent.push(`DTSTART;VALUE=DATE:${formatDate(start)}`);
        icalContent.push(`DTEND;VALUE=DATE:${formatDate(end)}`);
      }
      icalContent.push(`SUMMARY:${summary}`);
      icalContent.push(`DESCRIPTION:${description}`);
      icalContent.push('END:VEVENT');
    });

    icalContent.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="missions-${intervenant.prenom}.ics"`);
    res.send(icalContent.join('\r\n'));
  } catch (error) {
    console.error("Erreur génération iCal intervenant :", error);
    res.status(500).send("Erreur lors de la génération du calendrier");
  }
});

// --- ENDPOINT PUBLIC POUR LE DÉSABONNEMENT DES RAPPELS DE MISSIONS ---
app.get('/api/intervenant/unsubscribe-reminders', async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token) {
    return res.status(400).send("Paramètres invalides");
  }
  try {
    const intervenant = await prisma.intervenant.findUnique({
      where: { email }
    });
    if (!intervenant || String(intervenant.id) !== token) {
      return res.status(400).send("Lien de désabonnement expiré ou invalide");
    }

    await prisma.intervenant.update({
      where: { id: intervenant.id },
      data: { recevoirRappels: false }
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Désabonnement réussi</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f7f6; color: #333; }
          .container { background: white; padding: 40px; border-radius: 12px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          h1 { color: #004B93; }
          p { font-size: 16px; line-height: 1.5; color: #666; }
          .icon { font-size: 50px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔕</div>
          <h1>Désabonnement pris en compte</h1>
          <p>Bonjour ${intervenant.prenom}, vous ne recevrez plus de rappels par e-mail concernant vos missions au Gîte de la Maladrerie.</p>
          <p>Vous pouvez réactiver ces notifications à tout moment depuis votre profil sur votre Espace Équipe.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Erreur désabonnement:", error);
    res.status(500).send("Erreur lors de la désinscription");
  }
});

// --- ENDPOINT PUBLIC POUR LA DÉSACTIVATION DES RAPPELS D'UNE MISSION SPÉCIFIQUE ---
app.get('/api/intervenant/unsubscribe-mission', async (req, res) => {
  const { missionId, token } = req.query;
  if (!missionId || !token) {
    return res.status(400).send("Paramètres invalides");
  }
  try {
    const mission = await prisma.mission.findUnique({
      where: { id: parseInt(missionId) },
      include: { intervenant: true }
    });

    if (!mission || String(mission.intervenantId) !== token) {
      return res.status(400).send("Lien de désactivation invalide ou expiré");
    }

    await prisma.mission.update({
      where: { id: mission.id },
      data: { rappelsDesactives: true }
    });

    const mDate = mission.date ? new Date(mission.date) : null;
    const dateLabel = mDate ? `prévue le ${mDate.toLocaleDateString('fr-FR')}` : "de ce séjour";

    res.send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Rappel désactivé pour cette mission</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background-color: #f4f7f6; color: #333; }
          .container { background: white; padding: 40px; border-radius: 12px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          h1 { color: #d97706; }
          p { font-size: 16px; line-height: 1.5; color: #666; }
          .icon { font-size: 50px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔕</div>
          <h1>Rappels suspendus</h1>
          <p>Bonjour ${mission.intervenant.prenom}, vous ne recevrez plus de rappels par e-mail pour cette mission spécifique :</p>
          <p style="font-weight: bold; color: #334155; background-color: #f1f5f9; padding: 12px; border-radius: 8px;">
            ${mission.typeMission} (${dateLabel})
          </p>
          <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
            Vous continuerez à recevoir les rappels pour vos autres missions planifiées.
          </p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Erreur désactivation rappel mission:", error);
    res.status(500).send("Erreur lors de la désactivation du rappel");
  }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
  });
}

module.exports = app;
