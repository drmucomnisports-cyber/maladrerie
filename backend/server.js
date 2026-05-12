require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
const stripe = require('stripe')(stripeSecretKey);

const prisma = new PrismaClient();
const app = express();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors());

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
    const paymentType = session.metadata?.paymentType; // 'acompte', 'solde', 'caution'
    
    if(reservationId) {
       if (paymentType === 'acompte') {
         const reservation = await prisma.reservation.update({
           where: { id: parseInt(reservationId) },
           data: { statutPaiement: 'ACOMPTE_PAYE' },
           include: { client: true, intervenant: true }
         });
         console.log(`Acompte payé pour la réservation ${reservationId}`);
         
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
       } else if (paymentType === 'solde') {
         const reservation = await prisma.reservation.update({
           where: { id: parseInt(reservationId) },
           data: { statutPaiement: 'PAYE' },
           include: { client: true, intervenant: true }
         });
         console.log(`Solde payé pour la réservation ${reservationId}`);
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

const checkAuth = (req, res, next) => {
  const token = req.headers.authorization;
  console.log(`[checkAuth] Path: ${req.path}, Token: ${token}`);
  if (token === 'Bearer fake-jwt-token-muc') {
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
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
      details = `<strong>Prestation Draps et Ménage :</strong> à réaliser avant le premier jour de réservation (le <strong>${formatDate(veille)}</strong>).`;
      break;
    case 'Remise et récupération des clés':
    case 'Remise des clés':
      details = `<strong>Remise et récupération des clés :</strong>
        <ul style="margin: 5px 0; padding-left: 20px;">
          <li>Remise des clés à <strong>17h</strong> le premier jour de réservation (le <strong>${formatDate(start)}</strong>) ;</li>
          <li>Récupération des clés à <strong>11h</strong> le dernier jour de réservation (le <strong>${formatDate(end)}</strong>).</li>
        </ul>`;
      break;
    case 'Astreinte de nuit sur place':
      details = `<strong>Astreinte de nuit sur place :</strong> surveillance du site du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>).`;
      break;
    case 'Astreinte de nuit à domicile':
      details = `<strong>Astreinte de nuit à domicile :</strong> disponibilité du premier au dernier jour du séjour (du <strong>${formatDate(start)}</strong> au <strong>${formatDate(end)}</strong>).`;
      break;
    case 'Déplacement astreinte':
    case 'Déplacement sur site en astreinte':
      details = `<strong>Déplacement sur site en astreinte :</strong> intervention ponctuelle sur site (complément de +100 €).`;
      break;
    default:
      details = `<strong>${m.typeMission} :</strong> prévue le ${m.date ? formatDate(new Date(m.date)) : 'à définir'}.`;
  }
  return `${details} <br/><span style="color: #666; font-size: 13px;">(Rémunération : ${m.montant.toFixed(2)} €)</span>`;
};

const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 8, 5: 6, 6: 5 };

const recalculerPrix = async (dateDebut, dateFin, chambres, chambresDetails, options, promoCode) => {
  const start = new Date(dateDebut);
  const end = new Date(dateFin);
  const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (nuits <= 0) return 0;

  let total = 0;
  let totalAdultes = 0;

  chambres.forEach(chId => {
    const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
    const nbAdultes = parseInt(details.adultes || 0);
    const nbEnfants = parseInt(details.enfants || 0);
    const occupants = nbAdultes + nbEnfants;
    const capacite = CHAMBRES_CAPACITE[chId] || 5;
    
    totalAdultes += nbAdultes;
    const tarifPers = occupants >= capacite ? 22 : 25;
    total += occupants * tarifPers * nuits;
  });

  // Taxe de séjour
  total += totalAdultes * 0.88 * nuits;

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

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false, // true pour le port 465, false pour les autres
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendMail = async (options) => {
  try {
    await transporter.sendMail({
      ...options,
      from: `"Gîte de La Maladrerie" <${process.env.SMTP_SENDER}>`
    });
    console.log(`Email envoyé avec succès à: ${options.to}`);
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);
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


// Obtenir toutes les réservations approuvées pour le calendrier
app.get('/api/reservations', async (req, res) => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: {
        statut: {
          in: ['EN_ATTENTE', 'RESERVE']
        }
      },
      include: {
        client: true
      }
    });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' });
  }
});

app.post('/api/reservations', async (req, res) => {
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, chambresDetails, options } = req.body;

  // Recalculer le prix côté serveur pour sécurité
  const backendPrixTotal = await recalculerPrix(dateDebut, dateFin, chambres, chambresDetails, options, req.body.promoCode);

  try {
    const reservation = await prisma.reservation.create({
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres,
        chambresDetails: chambresDetails || null,
        options: options || null,
        prixTotal: backendPrixTotal,
        codePromo: req.body.promoCode || null,
        isGroupe: false,
        client: {
          create: {
            nom,
            email,
            telephone,
            adressePostale: adressePostale || null
          }
        },
        occupants: occupants && occupants.length > 0 ? {
          create: occupants.map(occ => ({
            nom: occ.nom,
            prenom: occ.prenom,
            estAdulte: occ.estAdulte,
            age: occ.age || null
          }))
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
    if (availableIntervenants.length > 0) {
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

    // Envoyer mail d'alerte aux administrateurs
    const acceptLink = `${BACKEND_URL}/api/reservations/${reservation.id}/accept`;
    const rejectLink = `${BACKEND_URL}/api/reservations/${reservation.id}/reject`;

    let detailsChambresHTML = '';
    if (chambresDetails) {
      detailsChambresHTML = Object.entries(chambresDetails).map(([chId, details]) => 
        `<li>Chambre ${chId} : ${details.adultes} adulte(s), ${details.enfants} enfant(s)</li>`
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

    let optionsHTML = '';
    if (options && Object.keys(options).some(k => options[k])) {
      optionsHTML = `
        <p><strong>Options :</strong></p>
        <ul>
          ${options.litsFaits ? '<li>Lits faits à l\'arrivée</li>' : ''}
          ${options.lingeFourni ? '<li>Linge de toilette fourni</li>' : ''}
          ${options.menage ? '<li>Ménage fin de séjour</li>' : ''}
        </ul>
      `;
    }

    const adminEmails = ['david.roujet@mucomnisports.fr', 'philippe.morereau@mucomnisports.fr'];
    console.log(`Tentative d'envoi d'alerte admin à: ${adminEmails.join(', ')}`);
    
    await sendMail({
      to: adminEmails.join(', '),
      subject: `🛎️ Nouvelle demande : ${client.nom} (${nbPersonnes} pers.)`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333;">
            <h2 style="color: #004B93;">Nouvelle demande de réservation</h2>
            <p><strong>Client :</strong> ${client.nom}</p>
            <p><strong>E-mail :</strong> ${client.email}</p>
            <p><strong>Téléphone :</strong> ${client.telephone}</p>
            <p><strong>Dates :</strong> du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</p>
            <p><strong>Durée :</strong> ${nbNuits} nuit(s)</p>
            <p><strong>Total de personnes :</strong> ${nbPersonnes} personne(s)</p>
            <p><strong>Chambres demandées :</strong> ${reservation.chambres.join(', ')}</p>
            ${detailsChambresHTML ? `<ul>${detailsChambresHTML}</ul>` : ''}
            ${occupantsHTML}
            ${optionsHTML}
            ${intervenantsHTML}
            ${prixTotal ? `<p style="font-size: 18px; margin-top: 20px;"><strong>Tarif Total Estimé :</strong> ${prixTotal.toFixed(2)} €</p>` : ''}
            
            <div style="margin-top: 30px; text-align: center;">
              <a href="${acceptLink}" style="display: inline-block; padding: 12px 25px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">ACCEPTER ET DEMANDER PAIEMENT</a>
              <a href="${rejectLink}" style="display: inline-block; padding: 12px 25px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">REFUSER</a>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666;">
            Ceci est une notification automatique du système de réservation. L'assignation de l'intervenant se fait depuis l'interface Administrateur.
          </div>
        </div>
      `
    });

    const responseData = { ...reservation, isLastMinute };
    if (isLastMinute) {
      responseData.lastMinuteWarning = "Votre réservation a bien été enregistrée. Celle-ci étant effectuée moins de 3 jours avant la date d'arrivée, nous vous invitons à contacter directement Philippe Morereau (06 07 08 09 10) ou David Roujet (06 01 02 03 04) afin de confirmer la bonne prise en compte de votre demande.";
    }
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

    let paymentLink = null;
    let stripeSessionId = null;
    
    // Calcul des montants
    const montantTotal = existingReservation.prixTotal || 0;
    const montantAcompte = Math.round(montantTotal * 0.3 * 100) / 100;
    const montantSolde = Math.round((montantTotal - montantAcompte) * 100) / 100;

    if (montantTotal > 0 && process.env.STRIPE_SECRET_KEY) {
      const stripeCustomerId = await getOrCreateStripeCustomer(existingReservation.client.email, existingReservation.client.nom);
      const sessionParams = {
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Acompte (30%) - Séjour Gîte de La Maladrerie',
              description: `Du ${new Date(existingReservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(existingReservation.dateFin).toLocaleDateString('fr-FR')}`,
            },
            unit_amount: Math.round(montantAcompte * 100), // En centimes
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/payment-cancel`,
        metadata: {
          reservationId: existingReservation.id.toString(),
          paymentType: 'acompte'
        }
      };
      if (stripeCustomerId) {
        sessionParams.customer = stripeCustomerId;
      } else if (existingReservation.client.email && existingReservation.client.email !== 'N/A') {
        sessionParams.customer_email = existingReservation.client.email;
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      paymentLink = session.url;
      stripeSessionId = session.id;
    }

    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statut: 'RESERVE',
        montantAcompte: montantAcompte,
        montantSolde: montantSolde,
        stripeAcompteId: stripeSessionId
      },
      include: { client: true }
    });
    // Calculs
    const dDebutAccept = new Date(reservation.dateDebut);
    const dFinAccept = new Date(reservation.dateFin);
    const nbNuitsAccept = Math.round((dFinAccept - dDebutAccept) / (1000 * 60 * 60 * 24));
    const nbPersonnesAccept = existingReservation.occupants ? existingReservation.occupants.length : 0;

    // Envoyer mail de confirmation au client
    await sendMail({
      to: reservation.client.email,
      subject: "Confirmation de votre réservation et Paiement - Gîte de La Maladrerie",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #004B93;">Bonjour ${reservation.client.nom},</h2>
            <p>Nous avons le plaisir de vous confirmer votre réservation pour votre séjour au <strong>Gîte de La Maladrerie</strong>.</p>
            <p><strong>Détails du séjour :</strong></p>
            <ul>
              <li><strong>Chambres :</strong> ${reservation.chambres.join(', ')}</li>
              <li><strong>Arrivée :</strong> ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} à partir de 17h</li>
              <li><strong>Départ :</strong> ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')} avant 11h</li>
              <li><strong>Durée :</strong> ${nbNuitsAccept} nuit(s)</li>
              ${reservation.prixTotal ? `<li><strong>Montant Total :</strong> ${reservation.prixTotal.toFixed(2)} €</li>` : ''}
            </ul>
            ${existingReservation.occupants && existingReservation.occupants.length > 0 ? `
              <p><strong>Occupants inscrits (${nbPersonnesAccept} personnes) :</strong></p>
              <ul>
                ${existingReservation.occupants.map(occ => `<li>${occ.nom} ${occ.prenom} - ${occ.estAdulte ? 'Adulte' : `Enfant (${occ.age} ans)`}</li>`).join('')}
              </ul>
            ` : ''}
            ${paymentLink ? `
              <div style="text-align: center; margin: 30px 0;">
                <p style="font-weight: bold; margin-bottom: 15px;">Pour finaliser votre réservation, veuillez procéder au paiement de l'acompte (30%) :</p>
                <a href="${paymentLink}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Payer l'acompte de ${montantAcompte.toFixed(2)} €</a>
                <p style="margin-top: 15px; font-size: 14px; color: #666;">Le solde de ${montantSolde.toFixed(2)} € sera à régler une semaine avant votre arrivée.</p>
              </div>
            ` : '<p>Votre réservation est confirmée. Le règlement se fera selon les modalités convenues.</p>'}
            <p>Nous restons à votre disposition pour toute question complémentaire.</p>
            <p>À très bientôt !</p>
            <p style="margin-top: 20px;">L'équipe du MUC Omnisports</p>
          </div>
          <div style="background-color: #FDB913; height: 5px;"></div>
        </div>
      `
    });

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #28a745;">Réservation acceptée !</h1>
        <p>Le client <strong>${reservation.client.nom}</strong> a été prévenu par e-mail avec un lien de paiement Stripe.</p>
        <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">Fermer cette fenêtre</button>
      </div>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors de l'acceptation");
  }
});

// Demander le solde manuellement
app.post('/api/reservations/:id/solde', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reser = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reser) return res.status(404).json({ error: 'Réservation non trouvée' });

    const stripeCustomerId = await getOrCreateStripeCustomer(reser.client.email, reser.client.nom);
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Solde - Séjour Gîte de La Maladrerie`,
            description: `Du ${new Date(reser.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reser.dateFin).toLocaleDateString('fr-FR')}`,
          },
          unit_amount: Math.round((reser.montantSolde || 0) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reser.id.toString(), paymentType: 'solde' }
    };

    if (stripeCustomerId) sessionParams.customer = stripeCustomerId;
    else if (reser.client.email && reser.client.email !== 'N/A') sessionParams.customer_email = reser.client.email;

    const session = await stripe.checkout.sessions.create(sessionParams);

    await sendMail({
      to: reser.client.email,
      subject: "Règlement du solde de votre séjour - Gîte de La Maladrerie",
      html: `<p>Bonjour ${reser.client.nom},</p><p>Veuillez régler le solde de votre séjour en cliquant sur le lien suivant : <a href="${session.url}">Payer le solde</a></p>`
    });

    res.json({ success: true, message: 'Demande de solde envoyée', url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la demande de solde' });
  }
});

// Demander la caution manuellement
app.post('/api/reservations/:id/caution', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reser = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });
    if (!reser) return res.status(404).json({ error: 'Réservation non trouvée' });

    const stripeCustomerId = await getOrCreateStripeCustomer(reser.client.email, reser.client.nom);
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Empreinte bancaire (Caution) - Gîte de La Maladrerie`,
            description: `Caution de 500€ (non débitée, sauf dégradations)`,
          },
          unit_amount: 50000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: { capture_method: 'manual' },
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`,
      metadata: { reservationId: reser.id.toString(), paymentType: 'caution' }
    };

    if (stripeCustomerId) sessionParams.customer = stripeCustomerId;
    else if (reser.client.email && reser.client.email !== 'N/A') sessionParams.customer_email = reser.client.email;

    const session = await stripe.checkout.sessions.create(sessionParams);

    await sendMail({
      to: reser.client.email,
      subject: "Dépôt de caution - Gîte de La Maladrerie",
      html: `<p>Bonjour ${reser.client.nom},</p><p>Veuillez effectuer l'empreinte bancaire pour la caution en cliquant ici : <a href="${session.url}">Déposer la caution</a></p>`
    });

    res.json({ success: true, message: 'Demande de caution envoyée', url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la demande de caution' });
  }
});

// Capturer la caution (retenue partielle ou totale)
app.post('/api/reservations/:id/capture-caution', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { montant } = req.body; 
  try {
    const reser = await prisma.reservation.findUnique({ where: { id: parseInt(id) } });
    if (!reser || !reser.stripeCautionId) return res.status(404).json({ error: 'Empreinte introuvable' });

    const amountToCapture = Math.round(parseFloat(montant) * 100);
    await stripe.paymentIntents.capture(reser.stripeCautionId, {
      amount_to_capture: amountToCapture,
    });

    await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { 
        statutCaution: 'UTILISEE',
        montantCautionRetenu: parseFloat(montant)
      }
    });

    res.json({ success: true, message: `Caution capturée (${montant}€) avec succès` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la capture de la caution' });
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

// Refuser une réservation
app.get('/api/reservations/:id/reject', async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: { statut: 'REFUSE' },
      include: { client: true }
    });

    // Envoyer mail de refus au client
    await sendMail({
      to: reservation.client.email,
      subject: "Mise à jour concernant votre demande - Gîte de La Maladrerie",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #333;">Bonjour ${reservation.client.nom},</h2>
            <p>Nous avons bien reçu votre demande de réservation pour le séjour du ${new Date(reservation.dateDebut).toLocaleDateString()} au ${new Date(reservation.dateFin).toLocaleDateString()}.</p>
            <p>Malheureusement, nous ne sommes pas en mesure de donner suite favorablement à votre demande pour ces dates (gîte complet ou indisponible).</p>
            <p>Nous vous remercions de votre intérêt et espérons vous accueillir lors d'un prochain séjour.</p>
            <p style="margin-top: 20px;">L'équipe du MUC Omnisports</p>
          </div>
          <div style="background-color: #dc3545; height: 5px;"></div>
        </div>
      `
    });

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #dc3545;">Réservation refusée</h1>
        <p>Le client <strong>${reservation.client.nom}</strong> a été informé par e-mail.</p>
        <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">Fermer cette fenêtre</button>
      </div>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors du refus");
  }
});

// Générer et envoyer le lien pour le solde (70%)
app.post('/api/reservations/:id/solde', checkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: { client: true }
    });

    if (!reservation || !reservation.montantSolde) {
      return res.status(404).json({ error: "Réservation ou montant solde introuvable" });
    }

    const stripeCustomerSolde = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const soldeParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Solde (70%) - Séjour Gîte de La Maladrerie',
            description: `Du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}`,
          },
          unit_amount: Math.round(reservation.montantSolde * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
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
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #004B93;">Bonjour ${reservation.client.nom},</h2>
            <p>Votre séjour approche à grands pas (arrivée le ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}).</p>
            <p>Afin de finaliser votre réservation, veuillez procéder au règlement du solde de votre séjour.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Payer le solde de ${reservation.montantSolde.toFixed(2)} €</a>
            </div>
            <p>Nous restons à votre disposition pour toute question.</p>
            <p style="margin-top: 20px;">L'équipe du MUC Omnisports</p>
          </div>
        </div>
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
            description: `Le montant de 500€ sera bloqué mais non débité.`,
          },
          unit_amount: 50000, // 500€
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        capture_method: 'manual', // Autorise sans capturer
      },
      success_url: `http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:5173/payment-cancel`,
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
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #004B93;">Bonjour ${reservation.client.nom},</h2>
            <p>Conformément à nos conditions de réservation, un dépôt de garantie de 500 € est requis avant votre arrivée au gîte.</p>
            <p>Ce montant fera l'objet d'une <strong>empreinte bancaire</strong> sécurisée (il sera bloqué temporairement mais non débité, sauf en cas de dommages constatés).</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Déposer la caution de 500 €</a>
            </div>
            <p>L'empreinte sera automatiquement levée après votre départ si aucun dégât n'est constaté.</p>
            <p style="margin-top: 20px;">L'équipe du MUC Omnisports</p>
          </div>
        </div>
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
app.post('/api/admin/auth', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'muc2024';
  if (password === adminPassword) {
    res.json({ success: true, token: 'fake-jwt-token-muc' });
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
        missions: {
          include: { intervenant: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reservations);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' });
  }
});

// ===== MISSIONS INTERVENANTS =====

// Ajouter une ou plusieurs missions à une réservation (batch) + notification automatique
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

    // Envoi automatique de la notification à l'intervenant
    const reservation = await prisma.reservation.findUnique({
      where: { id: parseInt(id) },
      include: {
        client: true,
        missions: { where: { intervenantId: parseInt(intervenantId) } }
      }
    });

    const intervenant = await prisma.intervenant.findUnique({
      where: { id: parseInt(intervenantId) }
    });

    if (reservation && intervenant && reservation.missions.length > 0) {
      const dateDebut = new Date(reservation.dateDebut);
      const dateFin = new Date(reservation.dateFin);
      const veilleDateDebut = new Date(dateDebut);
      veilleDateDebut.setDate(veilleDateDebut.getDate() - 1);

      const missionsHtml = reservation.missions.map(m => `<li style="margin-bottom: 12px;">${getMissionDetail(m, reservation.dateDebut, reservation.dateFin)}</li>`).join('');
      const totalRemuneration = reservation.missions.reduce((sum, m) => sum + m.montant, 0);

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
      const acceptUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/accept`;
      const rejectUrl = `${backendUrl}/api/reservations/${id}/intervenants/${intervenantId}/reject`;

      await sendMail({
        to: intervenant.email,
        subject: `Missions assignées — Séjour du ${dateDebut.toLocaleDateString('fr-FR')} au ${dateFin.toLocaleDateString('fr-FR')}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #004B93; padding: 24px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Gîte de La Maladrerie</h1>
              <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0 0; font-size: 13px;">Notification de missions</p>
            </div>
            <div style="padding: 30px; color: #333; line-height: 1.7;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour ${intervenant.prenom},</h2>
              <p>Nous vous informons que de nouvelles missions vous ont été confiées dans le cadre d'un séjour programmé au Gîte de La Maladrerie.</p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #FDB913; padding: 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #004B93;">📅 Période du séjour</p>
                <p style="margin: 0; font-size: 15px;">Du <strong>${dateDebut.toLocaleDateString('fr-FR')}</strong> au <strong>${dateFin.toLocaleDateString('fr-FR')}</strong></p>
              </div>

              <p style="font-weight: bold; margin-bottom: 10px;">Vos missions :</p>
              <ul style="padding-left: 20px; list-style-type: none;">
                ${missionsHtml}
              </ul>
              
              <div style="background-color: #e8f5e9; padding: 12px 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #2e7d32;">Rémunération totale : ${totalRemuneration.toFixed(2)} €</p>
              </div>

              <p>Merci de bien vouloir confirmer votre disponibilité en cliquant sur l'un des boutons ci-dessous :</p>
              
              <div style="text-align: center; margin: 30px 0; display: flex; gap: 12px; justify-content: center;">
                <a href="${acceptUrl}" style="background-color: #28a745; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">✓ J'accepte</a>
                <a href="${rejectUrl}" style="background-color: #dc3545; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">✗ Je décline</a>
              </div>
              <p style="font-size: 13px; color: #999;">En cas de question, n'hésitez pas à nous contacter directement.</p>
              <p style="margin-top: 20px;">Cordialement,<br/>L'équipe du MUC Omnisports</p>
            </div>
            <div style="background-color: #FDB913; height: 5px;"></div>
          </div>
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
      }
    });
    
    let caEnquaisse = 0;
    reservationsPayees.forEach(r => {
      if (r.statutPaiement === 'PAYE') {
        caEnquaisse += (r.prixTotal || 0);
      } else if (r.statutPaiement === 'ACOMPTE_PAYE') {
        caEnquaisse += (r.montantAcompte || 0);
      }
    });

    // 2. Reste à encaisser (Acompte en attente ou Solde en attente)
    const reservationsEnAttente = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: { not: 'PAYE' }
      }
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
      dateDebut: r.dateDebut,
      typeAttendu: r.statutPaiement === 'EN_ATTENTE' ? 'ACOMPTE (30%)' : 'SOLDE (70%)',
      montant: r.statutPaiement === 'EN_ATTENTE' ? r.montantAcompte : r.montantSolde
    })).sort((a, b) => new Date(a.dateDebut) - new Date(b.dateDebut));

    res.json({
      caEnquaisse,
      resteAEncaisser,
      remunerationTotale,
      remunerationParIntervenant,
      prochainsPaiements
    });

  } catch (error) {
    console.error(error);
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

    const stripeCustomerPL = await getOrCreateStripeCustomer(reservation.client.email, reservation.client.nom);
    const plParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'Séjour Gîte de La Maladrerie' },
          unit_amount: Math.round(reservation.prixTotal * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:5173/`,
      metadata: { reservationId: reservation.id.toString() }
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
    const updated = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      include: { client: true }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
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
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Missions Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #004B93;">Bonjour ${intervenant.prenom},</h2>
            <p>De nouvelles missions vous ont été assignées pour la réservation du <strong>${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>.</p>
            
            <div style="border-left: 4px solid #FDB913; padding-left: 15px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Vos missions :</strong></p>
              <ul>
                ${missionsHtml}
              </ul>
            </div>
            
            <p>Veuillez confirmer si vous acceptez ces missions :</p>
            
            <div style="text-align: center; margin: 30px 0; display: flex; gap: 10px; justify-content: center;">
              <a href="${acceptUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">J'accepte</a>
              <a href="${rejectUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Je refuse</a>
            </div>
            <p>L'équipe du MUC Omnisports</p>
          </div>
        </div>
      `
    });

    res.json({ success: true, message: 'Notification envoyée avec succès.' });
  } catch (error) {
    console.error("Erreur notification:", error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification' });
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
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #28a745;">Missions acceptées !</h1>
        <p>Merci ${intervenant ? intervenant.prenom : ''}, toutes vos missions pour cette réservation ont bien été acceptées.</p>
        <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">Fermer cette fenêtre</button>
      </div>
    `);
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
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #dc3545;">Missions refusées</h1>
        <p>Merci ${intervenant ? intervenant.prenom : ''}, nous avons bien noté que vous déclinez les missions pour cette réservation.</p>
        <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">Fermer cette fenêtre</button>
      </div>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur lors du refus");
  }
});

// Création manuelle d'une réservation
app.post('/api/admin/reservations', checkAuth, async (req, res) => {
  const { nom, email, telephone, adressePostale, occupants, dateDebut, dateFin, chambres, prixTotal } = req.body;
  try {
    const reservation = await prisma.reservation.create({
      data: {
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        chambres: chambres, // Expecting array of ints
        prixTotal: prixTotal ? parseFloat(prixTotal) : null,
        statut: 'RESERVE',
        statutPaiement: 'EN_ATTENTE',
        client: {
          create: { nom, email: email || 'N/A', telephone: telephone || 'N/A', adressePostale: adressePostale || null }
        },
        occupants: occupants && occupants.length > 0 ? {
          create: occupants.map(occ => ({
            nom: occ.nom,
            prenom: occ.prenom,
            estAdulte: occ.estAdulte,
            age: occ.age || null
          }))
        } : undefined
      },
      include: { client: true, occupants: true }
    });
    res.json(reservation);
  } catch (error) {
    console.error("Erreur création manuelle:", error);
    res.status(500).json({ error: 'Erreur lors de la création manuelle' });
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
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #004B93; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
          </div>
          <div style="padding: 30px; color: #333; line-height: 1.6;">
            <h2 style="color: #004B93;">Bonjour ${reservation.client.nom},</h2>
            <p>Voici le lien pour finaliser le paiement de votre réservation.</p>
            
            <div style="border-left: 4px solid #FDB913; padding-left: 15px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Dates :</strong> du ${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</p>
              <p style="margin: 5px 0;"><strong>Durée :</strong> ${nbNuits} nuit(s)</p>
              <p style="margin: 5px 0;"><strong>Chambres demandées :</strong> ${reservation.chambres.join(', ')}</p>
              <p style="margin: 5px 0; font-size: 16px;"><strong>Montant :</strong> ${reservation.prixTotal ? reservation.prixTotal.toFixed(2) + ' €' : 'Non défini'}</p>
            </div>
            
            ${occupantsHTML}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Payer en ligne</a>
            </div>
            <p>L'équipe du MUC Omnisports</p>
          </div>
        </div>
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
      include: { disponibilites: true }
    });
    res.json(intervenants);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des intervenants' });
  }
});

app.post('/api/admin/intervenants', checkAuth, async (req, res) => {
  const { nom, prenom, telephone, email, disponibilites } = req.body;
  try {
    const intervenant = await prisma.intervenant.create({
      data: {
        nom, prenom, telephone, email,
        disponibilites: disponibilites && disponibilites.length > 0 ? {
          create: disponibilites.map(d => ({
            dateDebut: new Date(d.dateDebut),
            dateFin: new Date(d.dateFin)
          }))
        } : undefined
      },
      include: { disponibilites: true }
    });
    res.json(intervenant);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la création de l\'intervenant' });
  }
});

app.put('/api/admin/intervenants/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { nom, prenom, telephone, email, disponibilites } = req.body;
  try {
    // Recreate disponibilites simply for this example
    if (disponibilites) {
      await prisma.disponibilite.deleteMany({ where: { intervenantId: parseInt(id) } });
    }
    const intervenant = await prisma.intervenant.update({
      where: { id: parseInt(id) },
      data: {
        nom, prenom, telephone, email,
        disponibilites: disponibilites && disponibilites.length > 0 ? {
          create: disponibilites.map(d => ({
            dateDebut: new Date(d.dateDebut),
            dateFin: new Date(d.dateFin)
          }))
        } : undefined
      },
      include: { disponibilites: true }
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

app.get('/api/equipe/planning', async (req, res) => {
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
        title: `✅ Dispo : ${dispo.intervenant.prenom} ${dispo.intervenant.nom}`,
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
        title: `🏠 Réservation : ${reser.client.nom}${reser.intervenant ? ` (${reser.intervenant.prenom})` : ' (Non assigné)'}`,
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
    if (existing) return res.status(400).json({ error: 'Ce code promo existe déjà' });
    
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
    res.status(500).json({ error: 'Erreur lors de la mise à jour du code promo' });
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
    return res.status(400).json({ error: 'Montant à retenir requis et supérieur à 0' });
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

// ===== CRON JOB : RAPPEL DE SOLDE AUTOMATIQUE =====
// S'exécute tous les jours à 09:00
cron.schedule('0 9 * * *', async () => {
  console.log("Exécution du Cron Job : Vérification des soldes à régler...");
  try {
    const today = new Date();
    // J+7
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 7);
    targetDate.setHours(0, 0, 0, 0);

    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setHours(23, 59, 59, 999);

    const reservations = await prisma.reservation.findMany({
      where: {
        statut: 'RESERVE',
        statutPaiement: 'ACOMPTE_PAYE',
        dateDebut: {
          gte: targetDate,
          lte: targetDateEnd
        }
      },
      include: { client: true }
    });

    console.log(`${reservations.length} réservation(s) concernée(s) par un rappel de solde.`);

    for (const reser of reservations) {
      if (!reser.montantSolde || reser.montantSolde <= 0) continue;

      // Générer lien de paiement Stripe pour le solde
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Solde - Séjour au Gîte de la Maladrerie`,
                description: `Du ${new Date(reser.dateDebut).toLocaleDateString()} au ${new Date(reser.dateFin).toLocaleDateString()}`,
              },
              unit_amount: Math.round(reser.montantSolde * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/paiement-succes?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/paiement-annule`,
        metadata: {
          reservationId: reser.id,
          typePaiement: 'solde'
        }
      });

      // Envoyer l'email
      await sendMail({
        to: reser.client.email,
        subject: "Rappel automatique : Règlement du solde - Gîte de La Maladrerie",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
            <div style="background-color: #004B93; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">Gîte de La Maladrerie</h1>
            </div>
            <div style="padding: 30px; color: #333; line-height: 1.6;">
              <h2 style="color: #004B93;">Bonjour ${reser.client.nom},</h2>
              <p>Votre séjour approche ! Il débutera le <strong>${new Date(reser.dateDebut).toLocaleDateString('fr-FR')}</strong>.</p>
              <p>Conformément à nos conditions, le solde de votre réservation (<strong>${reser.montantSolde.toFixed(2)} €</strong>) doit être réglé au plus tard 7 jours avant votre arrivée.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${session.url}" style="background-color: #FDB913; color: #004B93; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Régler le solde de ${reser.montantSolde.toFixed(2)} €</a>
              </div>
              <p>Une fois le solde réglé, vous recevrez un autre lien sécurisé pour procéder à l'empreinte bancaire (caution de 500 €).</p>
              <p style="margin-top: 20px;">À très bientôt !<br>L'équipe du MUC Omnisports</p>
            </div>
          </div>
        `
      });

      console.log(`Rappel de solde envoyé pour la réservation ${reser.id}`);
    }

  } catch (error) {
    console.error("Erreur lors de l'exécution du Cron Job de rappel :", error);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
