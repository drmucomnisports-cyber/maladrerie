require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { BrevoClient } = require('@getbrevo/brevo');
const { generateDevisPDF } = require('./utils/generateDevisPDF');
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

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
        } catch (expErr) {
          console.error("Erreur création dépense commission Stripe:", expErr);
        }
      }

      if (paymentType === 'acompte') {
        let balancePaymentLink = '';
          let stripeSoldeId = null;
          
          try {
            const reservationDb = await prisma.reservation.findUnique({
              where: { id: parseInt(reservationId) },
              include: { client: true }
            });
            if (reservationDb) {
              const soldeSession = await createStripeSessionForReservation(reservationDb, 'solde');
              stripeSoldeId = soldeSession.id;
              balancePaymentLink = soldeSession.url;
            }
          } catch (err) {
            console.error("Erreur génération automatique du lien de solde lors du paiement de l'acompte:", err);
          }

          const reservation = await prisma.reservation.update({
            where: { id: parseInt(reservationId) },
            data: { 
              statutPaiement: 'ACOMPTE_PAYE',
              statut: 'RESERVE',
              stripeSoldeId: stripeSoldeId || undefined
            },
            include: { client: true, intervenant: true }
          });
          console.log(`Acompte payé pour la réservation ${reservationId}`);
          await sendCuisineEmailIfNeeded(reservationId);
          await sendPaymentConfirmationEmails(reservation, 'acompte', session.amount_total / 100, balancePaymentLink);
          
          // Incrémenter l'usage du code promo si présent
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
          const reservation = await prisma.reservation.update({
            where: { id: parseInt(reservationId) },
            data: { statutPaiement: 'PAYE' },
            include: { client: true, intervenant: true }
          });
          console.log(`Solde/Totalité payé pour la réservation ${reservationId}`);
          await sendCuisineEmailIfNeeded(reservationId);
          await sendPaymentConfirmationEmails(reservation, paymentType, session.amount_total / 100);
        } else if (paymentType === 'caution') {
          const reservation = await prisma.reservation.update({
            where: { id: parseInt(reservationId) },
            data: { 
              statutCaution: 'DEPOSEE',
              stripeCautionId: session.payment_intent // Stocke l'ID du PaymentIntent pour une capture ultérieure si besoin
            },
            include: { client: true, intervenant: true }
          });
          console.log(`Caution déposée (PaymentIntent autorisé) pour la réservation ${reservationId}`);
          await sendPaymentConfirmationEmails(reservation, 'caution', session.amount_total / 100);
        } else if (paymentType === 'solde') {
         const reservation = await prisma.reservation.update({
           where: { id: parseInt(reservationId) },
           data: { statutPaiement: 'PAYE' },
           include: { client: true, intervenant: true }
         });
         console.log(`Solde payé pour la réservation ${reservationId}`);
         await sendCuisineEmailIfNeeded(reservationId);
       } else if (paymentType === 'caution') {
         const reservation = await prisma.reservation.update({
           where: { id: parseInt(reservationId) },
           data: { 
             statutCaution: 'DEPOSEE',
             stripeCautionId: session.payment_intent // Stocke l'ID du PaymentIntent pour une capture ultérieure si besoin
           },
           include: { client: true, intervenant: true }
         });
         console.log(`Caution déposée (PaymentIntent autorisé) pour la réservation ${reservationId}`);
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

  let details = '';
  switch (m.typeMission) {
    case 'Prestation draps et ménage':
    case 'Draps et ménage':
      details = `<strong>Prestation Draps et Ménage :</strong> à  réaliser avant le premier jour de réservation (le <strong>${formatDate(veille)}</strong>).`;
      break;
    case 'Remise et récupération des clés':
    case 'Remise des clés':
      details = `<strong>Remise et récupération des clés :</strong>
        <ul style="margin: 5px 0; padding-left: 20px;">
          <li>Remise des clés à  <strong>17h</strong> le premier jour de réservation (le <strong>${formatDate(start)}</strong>) ;</li>
          <li>Récupération des clés à  <strong>11h</strong> le dernier jour de réservation (le <strong>${formatDate(end)}</strong>).</li>
        </ul>`;
      break;
    case 'Astreinte de nuit sur place':
      details = `<strong>Astreinte de nuit sur place :</strong> surveillance du site du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>).`;
      break;
    case 'Astreinte de nuit à  domicile':
      details = `<strong>Astreinte de nuit à  domicile :</strong> disponibilité du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>).`;
      break;
    case 'Déplacement astreinte':
    case 'Déplacement sur site en astreinte':
      details = `<strong>Déplacement sur site en astreinte :</strong> intervention ponctuelle sur site (complément de +100 €).`;
      break;
    default:
      details = `<strong>${m.typeMission} :</strong> prévue le ${m.date ? formatDate(new Date(m.date)) : 'à  définir'}.`;
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
  try {
    const toEmails = options.to.split(',').map(email => ({ email: email.trim() }));
    
    await brevo.transactionalEmails.sendTransacEmail({
      subject: options.subject,
      htmlContent: options.html,
      sender: { 
        name: "Gite de la Maladrerie - MUC", 
        email: "dr.mucomnisports@gmail.com" 
      },
      to: toEmails,
      attachment: options.attachments ? options.attachments.map(att => ({
        content: att.content,
        name: att.name
      })) : undefined
    });
    
    console.log(`Email envoyé via API Brevo avec succès à : ${options.to}`);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email via API:", error.message || error);
  }
};

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

    if (isCaution) {
      typeLabel = 'Dépôt de garantie (Caution)';
      descriptionText = `Une empreinte bancaire temporaire de <strong>${amount.toFixed(2)} €</strong> a été enregistrée à titre de caution. Aucun montant n'a été débité de votre compte.`;
      cgvReference = `Conformément à l'Article 8 de nos CGV, cette caution est destinée à couvrir les éventuels dommages, manquements au règlement intérieur, ou frais de ménage. Elle sera automatiquement annulée/libérée dans un délai de 30 jours maximum après votre départ.`;
    } else if (isAcompte) {
      typeLabel = "Acompte (30%)";
      descriptionText = `Le paiement de l'acompte de 30% d'un montant de <strong>${amount.toFixed(2)} €</strong> a été validé. Vos dates de séjour sont désormais réservées.`;
      cgvReference = `Le solde restant de votre séjour (70%) d'un montant de <strong>${soldeRestant.toFixed(2)} €</strong> devra être réglé au plus tard 7 jours avant votre arrivée.`;
      if (balancePaymentLink) {
        cgvReference += ` Vous pouvez dès à présent le régler en utilisant le lien ci-dessous.`;
      } else {
        cgvReference += ` Vous recevrez un lien de paiement automatique par e-mail à cette date.`;
      }
    } else if (isSolde) {
      typeLabel = "Solde du séjour";
      descriptionText = `Le paiement du solde de votre séjour d'un montant de <strong>${amount.toFixed(2)} €</strong> a été validé. Votre réservation est désormais entièrement payée !`;
      cgvReference = `Avant votre entrée dans les lieux, il vous sera demandé d'effectuer l'empreinte bancaire pour le dépôt de garantie (caution de 500 €). Si ce n'est pas déjà fait, vous recevrez un lien de paiement dédié quelques jours avant votre arrivée.`;
    }

    const dDebut = new Date(reservation.dateDebut).toLocaleDateString('fr-FR');
    const dFin = new Date(reservation.dateFin).toLocaleDateString('fr-FR');

    // 1. Email pour le Client
    if (reservation.client?.email && reservation.client?.email !== 'N/A') {
      await sendMail({
        to: reservation.client.email,
        subject: `Confirmation de paiement - ${typeLabel} - Gîte de la Maladrerie`,
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

                      <p style="margin-top: 30px;">À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
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
    const adminEmail = process.env.ADMIN_EMAIL || 'david.roujet@mucomnisports.fr';
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

    const adminEmails = ['david.roujet@mucomnisports.fr', 'philippe.morereau@mucomnisports.fr'];
    console.log(`Tentative d'envoi d'alerte admin à : ${adminEmails.join(', ')}`);
    
    await sendMail({
      to: adminEmails.join(','),
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

    if (montantTotal > 0 && process.env.STRIPE_SECRET_KEY) {
      const session = await createStripeSessionForReservation(existingReservation, paymentType);
      paymentLink = session.url;
      stripeSessionId = session.id;
    }

    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statut: 'RESERVE',
        montantAcompte: isLastMinuteStay ? 0 : montantAcompte,
        montantSolde: isLastMinuteStay ? montantTotal : montantSolde,
        stripeAcompteId: isLastMinuteStay ? null : stripeSessionId,
        stripeSoldeId: isLastMinuteStay ? stripeSessionId : null,
        validePar: req.user?.email || 'Admin'
      },
      include: { client: true }
    });
    // Calculs
    const dDebutAccept = new Date(reservation.dateDebut);
    const dFinAccept = new Date(reservation.dateFin);
    const nbNuitsAccept = Math.round((dFinAccept - dDebutAccept) / (1000 * 60 * 60 * 24));
     await sendMail({
      to: reservation.client.email,
      subject: "Confirmation de votre réservation et Paiement - Gîte de La Maladrerie",
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
                    
                    <p style="margin-top: 30px;">À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
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

    // 3. Générer le numéro de devis séquentiel
    const count = await prisma.reservation.count({
      where: {
        numeroDevis: { startsWith: `D-${year}-` }
      }
    });
    const numeroDevis = `D-${year}-${String(count + 1).padStart(3, '0')}`;

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
    await sendMail({
      to: ADMIN_EMAIL,
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

// Mettre à jour un devis existant (Admin)
app.put('/api/admin/devis/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, email, telephone, adressePostale, dateDebut, dateFin, chambres, chambresDetails, options, salles, repas, repasGlobal, prixTotal, prixHebergement, totalRepas, modeRestauration, sendEmail } = req.body;

  try {
    const devisExistant = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!devisExistant || devisExistant.statut !== 'DEVIS_EN_ATTENTE') {
      return res.status(400).json({ error: "Devis introuvable ou déjà validé/expiré." });
    }

    await prisma.client.update({
      where: { id: devisExistant.clientId },
      data: { nom, email, telephone, adressePostale }
    });
    
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
        prixTotal: prixTotal || 0
      },
      include: { client: true }
    });

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
      codePromo: devis.codePromo
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
  const { occupants } = req.body;

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

    // Envoyer un e-mail à  l'admin créateur du devis pour l'alerter
    if (devis.validePar && devis.validePar !== 'Admin' && devis.validePar.includes('@')) {
      try {
        await sendMail({
          to: devis.validePar,
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
    }

    res.json({ success: true, url: session.url });
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

    // Envoyer un e-mail à  l'admin créateur du devis pour l'alerter
    if (devis.validePar && devis.validePar !== 'Admin' && devis.validePar.includes('@')) {
      try {
        await sendMail({
          to: devis.validePar,
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

// Cron job pour expirer les devis
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    const expired = await prisma.reservation.updateMany({
      where: {
        statut: 'DEVIS_EN_ATTENTE',
        expireLe: { lte: now }
      },
      data: { statut: 'DEVIS_EXPIRE' }
    });
    if (expired.count > 0) console.log(`${expired.count} devis expirés.`);
  } catch (err) {
    console.error("Erreur cron devis:", err);
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

    const stripeCustomer = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const params = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Acompte du séjour - Gîte de La Maladrerie',
            description: getStripeDescription(reservation),
          },
          unit_amount: Math.round(montantAcompteCalcule * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reservation.id.toString(), paymentType: 'acompte' }
    };
    if (stripeCustomer) params.customer = stripeCustomer;
    else if (reservation.client.email && reservation.client.email !== 'N/A') params.customer_email = reservation.client.email;
    
    const session = await stripe.checkout.sessions.create(params);

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { stripeSessionId: session.id }
    });

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
                <tr><td><a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer l'acompte de ${montantAcompteCalcule.toFixed(2)} €</a></td></tr>
              </table>
              <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie</strong></p>
            </td></tr>
          </table></td></tr>
        </table>
      `
    });

    res.json({ message: 'Lien d\'acompte envoyé', url: session.url });
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

    const stripeCustomer = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const params = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Paiement total du séjour - Gîte de La Maladrerie',
            description: getStripeDescription(reservation),
          },
          unit_amount: Math.round(montantTotal * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reservation.id.toString(), paymentType: 'totalite' }
    };
    if (stripeCustomer) params.customer = stripeCustomer;
    else if (reservation.client.email && reservation.client.email !== 'N/A') params.customer_email = reservation.client.email;
    
    const session = await stripe.checkout.sessions.create(params);

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { stripeSoldeId: session.id }
    });

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
                <tr><td><a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer la totalité de ${montantTotal.toFixed(2)} €</a></td></tr>
              </table>
              <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie</strong></p>
            </td></tr>
          </table></td></tr>
        </table>
      `
    });

    res.json({ message: 'Lien de paiement total envoyé', url: session.url });
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

    const stripeCustomerSolde = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const soldeParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Solde du séjour - Gîte de La Maladrerie',
            description: getStripeDescription(reservation),
          },
          unit_amount: Math.round(montantSoldeCalcule * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
        billing_address_collection: 'required',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: {
        reservationId: reservation.id.toString(),
        paymentType: 'solde'
      }
    };
    if (stripeCustomerSolde) {
      soldeParams.customer = stripeCustomerSolde;
    } else if (reservation.client.email && reservation.client.email !== 'N/A') {
      soldeParams.customer_email = reservation.client.email;
    }
    const session = await stripe.checkout.sessions.create(soldeParams);

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { stripeSoldeId: session.id }
    });

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
                          <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer le solde de ${montantSoldeCalcule.toFixed(2)} €</a>
                        </td>
                      </tr>
                    </table>
                    
                    <p>Nous restons à  votre disposition pour toute question.</p>
                    <p style="margin-top: 30px;">À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
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

    res.json({ message: "Lien de solde envoyé", url: session.url });
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

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { stripeCautionId: session.id }
    });

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

  try {
    // 1. Check SuperAdmin (Env Var) - Toujours prioritaire pour le dépannage
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, token, role: 'admin' });
    }

    // 2. Check Database Admin
    const dbAdmin = await prisma.adminAccount.findUnique({ where: { email } });
    if (dbAdmin) {
      const isMatch = await bcrypt.compare(password, dbAdmin.password);
      if (isMatch) {
        const token = jwt.sign({ id: dbAdmin.id, email: dbAdmin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ success: true, token, role: 'admin' });
      }
    }

    // 3. Check Intervenant
    const intervenant = await prisma.intervenant.findUnique({
      where: { email }
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

app.post('/api/admin/auth', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email: ADMIN_EMAIL, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
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
    const reservationsWithTaxe = reservations.map(r => {
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

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
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

                      <p style="font-size: 13px; color: #999999; margin-top: 30px;">En cas de question, n'hésitez pas à  nous contacter directement.</p>
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
    }

    res.json({ missions: createdMissions, notified: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création des missions' });
  }
});

// Supprimer une mission
app.delete('/api/admin/missions/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.mission.delete({
      where: { id: parseInt(id) }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la mission' });
  }
});

// ===== FINANCES =====

// Obtenir les données financières pour le dashboard
app.get('/api/admin/finances', checkAuth, async (req, res) => {
  try {
    // 1. Chiffre d'affaires encaissé
    const reservationsPayees = await prisma.reservation.findMany({
      where: {
        statutPaiement: { in: ['ACOMPTE_PAYE', 'PAYE'] }
      },
      include: { client: true }
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
      }
    });

    // 3. Rémunération des intervenants (toutes les missions)
    const missions = await prisma.mission.findMany({
      include: { intervenant: true }
    });
    
    const remunerationTotale = missions.reduce((sum, m) => sum + m.montant, 0);

    // Groupement par intervenant
    const remunerationParIntervenant = {};
    missions.forEach(m => {
      const nom = `${m.intervenant.prenom} ${m.intervenant.nom}`;
      if (!remunerationParIntervenant[nom]) remunerationParIntervenant[nom] = 0;
      remunerationParIntervenant[nom] += m.montant;
    });

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

    // 7. Consolidation des Recettes détaillées
    const recettesDetaillees = reservationsPayees.map(r => {
      const { total: totalRepas } = calculerRevenuRepasServeur(r.repas);
      const montantPaye = r.statutPaiement === 'PAYE' ? (r.prixTotal || 0) : (r.montantAcompte || 0);
      return {
        id: r.id,
        date: r.createdAt,
        clientNom: r.client?.nom || 'Inconnu',
        typePaiement: r.statutPaiement,
        montantTotal: r.prixTotal,
        montantPaye,
        partRestauration: totalRepas,
        partHebergement: Math.max(0, (r.prixTotal || 0) - totalRepas)
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
      recettesDetaillees
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

// Mettre à  jour une réservation (ex: passage manuel en PAYE ou autre statut)
app.put('/api/admin/reservations/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const dataToUpdate = req.body;
  try {
    const updated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      include: { client: true }
    });
    await sendCuisineEmailIfNeeded(updated.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à  jour' });
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
        validePar: req.user.email
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

    const data = {
      modePaiement: mode,
      statutPaiement: typePaiement === 'ACOMPTE' ? 'ACOMPTE_PAYE' : 'PAYE'
    };

    if (typePaiement === 'ACOMPTE') {
      data.montantAcompte = parsedMontant;
      if (!existing.montantSolde && existing.prixTotal) {
        data.montantSolde = Math.round((existing.prixTotal - parsedMontant) * 100) / 100;
      }
    } else {
      data.montantSolde = parsedMontant;
      if (!existing.montantAcompte && existing.prixTotal) {
        data.montantAcompte = Math.round((existing.prixTotal - parsedMontant) * 100) / 100;
      }
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
      const adminEmail = (reservation?.validePar && reservation.validePar.includes('@')) ? reservation.validePar : (process.env.ADMIN_EMAIL || 'dr.mucomnisports@gmail.com');
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
      const adminEmail = (reservation?.validePar && reservation.validePar.includes('@')) ? reservation.validePar : (process.env.ADMIN_EMAIL || 'dr.mucomnisports@gmail.com');
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
        select: { id: true, email: true, nom: true, telephone: true }
      });
      if (admin) return res.json(admin);
    }
    
    // Sinon on renvoie les infos par défaut de l'admin principal
    res.json({ 
      id: 0, 
      email: (req.user && req.user.email) || ADMIN_EMAIL, 
      nom: 'Administrateur MUC' 
    });
  } catch (err) {
    console.error("Erreur dans /api/admin/me:", err);
    res.status(500).json({ error: err.message });
  }
});

// Mise à  jour du profil administrateur
app.put('/api/admin/profile', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  const { nom, prenom, email, telephone } = req.body;

  try {
    // Construire le nom complet si prénom fourni
    const fullNom = prenom ? `${prenom} ${nom}` : nom;

    if (req.user && req.user.id) {
      const updated = await prisma.adminAccount.update({
        where: { id: req.user.id },
        data: {
          ...(fullNom && { nom: fullNom }),
          ...(email && { email }),
          ...(telephone !== undefined && { telephone })
        },
        select: { id: true, email: true, nom: true, telephone: true }
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
        structure: structure || null,
        validePar: req.user.email,
        tokenDevis: token,
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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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
                        
                        <p style="margin-top: 30px;">À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
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
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true, occupants: true }
    });

    if (!reservation) return res.status(404).json({ error: 'Réservation non trouvée' });
    if (!reservation.stripeSessionId) return res.status(400).json({ error: 'Lien de paiement non généré. Veuillez d\'abord générer le lien.' });

    // Retrieve session to get the URL if we didn't save it
    const session = await stripe.checkout.sessions.retrieve(reservation.stripeSessionId);

    if (!session || !session.url) {
      return res.status(400).json({ error: 'URL de session Stripe introuvable.' });
    }

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
                    <p>Voici le lien pour finaliser le règlement de votre réservation.</p>
                    
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
                        <td style="font-weight: bold;">Montant</td>
                        <td style="font-size: 18px; font-weight: bold; color: #004B93;">${reservation.prixTotal ? reservation.prixTotal.toFixed(2) + ' €' : 'Non défini'}</td>
                      </tr>
                    </table>
                    
                    ${occupantsHTML}

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                      <tr>
                        <td align="center">
                          <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer en ligne</a>
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
      where: { id: parseInt(id) },
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
          include: { reservation: true }
        }
      }
    });
    res.json(intervenants);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des intervenants' });
  }
});

app.post('/api/admin/intervenants', checkAuth, async (req, res) => {
  const { nom, prenom, email, telephone, password, disponibilites } = req.body;
  try {
    const data = { nom, prenom, email, telephone };
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
  const { nom, prenom, email, telephone, password, disponibilites } = req.body;
  try {
    const data = { nom, prenom, email, telephone };
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
app.get('/api/admin/accounts', checkAuth, checkAdmin, async (req, res) => {
  try {
    const admins = await prisma.adminAccount.findMany({
      select: { id: true, email: true, nom: true, createdAt: true }
    });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des admins' });
  }
});

app.post('/api/admin/accounts', checkAuth, checkAdmin, async (req, res) => {
  const { email, password, nom } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.adminAccount.create({
      data: { email, password: hashedPassword, nom }
    });
    const { password: _, ...adminWithoutPassword } = admin;
    res.json(adminWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la création de l\'admin' });
  }
});

app.delete('/api/admin/accounts/:id', checkAuth, checkAdmin, async (req, res) => {
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
      include: { intervenant: true, client: true }
    });

    // Transformer tout en événements pour react-big-calendar
    const events = [];

    // Ajouter les disponibilités
    disponibilites.forEach(dispo => {
      events.push({
        id: `dispo-${dispo.id}`,
        title: `âœ… Dispo : ${dispo.intervenant.prenom} ${dispo.intervenant.nom}`,
        start: new Date(dispo.dateDebut),
        // On décale la fin pour que le composant de calendrier affiche la bonne journée entière
        end: new Date(dispo.dateFin), 
        type: 'dispo',
        allDay: true,
        intervenantName: `${dispo.intervenant.prenom} ${dispo.intervenant.nom}`
      });
    });

    // Ajouter les réservations
    reservations.forEach(reser => {
      events.push({
        id: `res-${reser.id}`,
        title: `&#x26A0;  Réservation : ${reser.client.nom}${reser.intervenant ? ` (${reser.intervenant.prenom})` : ' (Non assigné)'}`,
        start: new Date(reser.dateDebut),
        end: new Date(reser.dateFin),
        type: 'reservation',
        allDay: true,
        intervenantName: reser.intervenant ? `${reser.intervenant.prenom} ${reser.intervenant.nom}` : 'Aucun',
        statut: reser.statut
      });
    });

    res.json(events);
  } catch (error) {
    console.error("Erreur planning équipe:", error);
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

// Capturer un montant partiel de la caution (ex: 50€ pour ménage)
app.post('/api/reservations/:id/capture-caution', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { montant } = req.body;
  
  if (!montant || montant <= 0) {
    return res.status(400).json({ error: 'Montant à  retenir requis et supérieur à  0' });
  }
  
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!reservation) return res.status(404).json({ error: 'Réservation non trouvée' });
    if (!reservation.stripeCautionId) return res.status(400).json({ error: 'Aucune empreinte bancaire enregistrée' });
    if (reservation.statutCaution !== 'DEPOSEE') return res.status(400).json({ error: 'La caution doit être au statut DEPOSEE pour pouvoir capturer un montant' });
    
    const montantCentimes = Math.round(parseFloat(montant) * 100);
    
    // Capturer le montant partiel via Stripe
    const paymentIntent = await stripe.paymentIntents.capture(reservation.stripeCautionId, {
      amount_to_capture: montantCentimes
    });
    
    const updated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: {
        statutCaution: 'UTILISEE',
        montantCautionRetenu: parseFloat(montant)
      }
    });
    
    res.json({
      success: true,
      message: `${parseFloat(montant).toFixed(2)} € ont été retenus sur la caution. Le reste a été libéré.`,
      montantRetenu: parseFloat(montant)
    });
  } catch (error) {
    console.error("Erreur captation caution:", error);
    res.status(500).json({ error: "Erreur lors de la captation partielle de la caution" });
  }
});

// ===== CRON JOB : RAPPEL DE SOLDE AUTOMATIQUE, RAPPELS J-10 ET J-7, ANNULATION J-6 =====
// S'exécute tous les jours à 09:00
cron.schedule('0 9 * * *', async () => {
  console.log("Exécution du Cron Job : Rappels de soldes et annulations automatiques...");
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- 1. ANNULATIONS AUTOMATIQUES (J+6 avant l'arrivée) ---
    // Si la date d'arrivée est dans 6 jours et que le séjour n'est pas réglé, on annule.
    const cancelDateStart = new Date(today);
    cancelDateStart.setDate(today.getDate() + 6);
    const cancelDateEnd = new Date(cancelDateStart);
    cancelDateEnd.setHours(23, 59, 59, 999);

    const toCancel = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' },
        dateDebut: { gte: cancelDateStart, lte: cancelDateEnd }
      },
      include: { client: true }
    });

    for (const reser of toCancel) {
      await prisma.reservation.update({
        where: { id: reser.id },
        data: { statut: 'REFUSEE', validePar: 'Système (Solde non payé)' }
      });

      await sendMail({
        to: reser.client.email,
        subject: "Annulation de votre réservation - Solde non réglé - Gîte de La Maladrerie",
        html: `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
                  <tr>
                    <td style="background-color: #dc3545; padding: 30px; text-align: center;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Gîte de La Maladrerie</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px; color: #333333; line-height: 1.6;">
                      <h2 style="color: #dc3545; margin-top: 0;">Bonjour ${reser.client.nom},</h2>
                      <p>Nous vous informons que votre réservation pour le séjour du <strong>${new Date(reser.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reser.dateFin).toLocaleDateString('fr-FR')}</strong> a été annulée.</p>
                      <p>En effet, le règlement du solde restant de votre réservation n'a pas été reçu dans le délai requis (7 jours avant votre arrivée).</p>
                      <p>Les dates de séjour correspondantes sont à nouveau disponibles à la location.</p>
                      <p>Nous restons à votre disposition pour tout complément d'information.</p>
                      <p style="margin-top: 30px;">Cordialement,<br><strong>L'équipe du Gîte de La Maladrerie - MUC</strong></p>
                    </td>
                  </tr>
                  <tr><td style="background-color: #dc3545; height: 5px;"></td></tr>
                </table>
              </td>
            </tr>
          </table>
        `
      });
      console.log(`Réservation ${reser.id} annulée automatiquement (non payée à J+6)`);
    }

    // --- 2. RAPPELS DERNIER AVERTISSEMENT (J+7 avant l'arrivée) ---
    const warningDateStart = new Date(today);
    warningDateStart.setDate(today.getDate() + 7);
    const warningDateEnd = new Date(warningDateStart);
    warningDateEnd.setHours(23, 59, 59, 999);

    const toWarn = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' },
        dateDebut: { gte: warningDateStart, lte: warningDateEnd }
      },
      include: { client: true }
    });

    for (const reser of toWarn) {
      const paymentType = reser.statutPaiement === 'ACOMPTE_PAYE' ? 'solde' : 'totalite';
      const session = await createStripeSessionForReservation(reser, paymentType);
      
      const montant = paymentType === 'solde' 
        ? (reser.montantSolde || ((reser.prixTotal || 0) - (reser.montantAcompte || 0))) 
        : (reser.prixTotal || 0);

      await sendMail({
        to: reser.client.email,
        subject: "⚠️ DERNIER RAPPEL : Règlement de votre séjour - Gîte de La Maladrerie",
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
                      <p>Votre séjour commence le <strong>${new Date(reser.dateDebut).toLocaleDateString('fr-FR')}</strong> (dans 7 jours).</p>
                      <p style="color: #856404; font-weight: bold;">⚠️ Ceci est notre dernier rappel de paiement pour finaliser votre séjour.</p>
                      <p>Il vous reste à régler le montant de <strong>${montant.toFixed(2)} €</strong> correspondant au ${paymentType === 'solde' ? 'solde' : 'totalité'} de votre réservation.</p>
                      
                      <div style="background-color: #fff3cd; border: 1px solid #ffe082; padding: 15px; border-radius: 8px; font-size: 14px; color: #856404; margin: 20px 0; font-weight: bold;">
                        IMPORTANT : Si le paiement n'est pas effectué dans la journée (avant ce soir à 23h59), votre réservation sera automatiquement annulée et les dates libérées.
                      </div>
                      
                      <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                        <tr>
                          <td>
                            <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Régler le paiement de ${montant.toFixed(2)} €</a>
                          </td>
                        </tr>
                      </table>
                      
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

    // --- 3. PREMIERS RAPPELS DE SOLDE (J+10 avant l'arrivée) ---
    const reminderDateStart = new Date(today);
    reminderDateStart.setDate(today.getDate() + 10);
    const reminderDateEnd = new Date(reminderDateStart);
    reminderDateEnd.setHours(23, 59, 59, 999);

    const toRemind = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' },
        dateDebut: { gte: reminderDateStart, lte: reminderDateEnd }
      },
      include: { client: true }
    });

    for (const reser of toRemind) {
      const paymentType = reser.statutPaiement === 'ACOMPTE_PAYE' ? 'solde' : 'totalite';
      const session = await createStripeSessionForReservation(reser, paymentType);
      
      const montant = paymentType === 'solde' 
        ? (reser.montantSolde || ((reser.prixTotal || 0) - (reser.montantAcompte || 0))) 
        : (reser.prixTotal || 0);

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
                      <p>Merci de procéder au règlement en cliquant sur le lien ci-dessous :</p>
                      
                      <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                        <tr>
                          <td>
                            <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Régler le solde de ${montant.toFixed(2)} €</a>
                          </td>
                        </tr>
                      </table>
                      
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

  } catch (error) {
    console.error("Erreur lors de l'exécution du Cron Job de rappels/annulations :", error);
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
      id: reservation.id,
      clientNom: reservation.client.nom,
      dateDebut: reservation.dateDebut,
      dateFin: reservation.dateFin,
      totalAdultes,
      totalMineurs,
      occupants: reservation.occupants || []
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
