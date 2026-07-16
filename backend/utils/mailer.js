const nodemailer = require('nodemailer');
const { BrevoClient } = require('@getbrevo/brevo');
const fs = require('fs');
const getAssetPath = require('./getAssetPath');
const crypto = require('crypto');

// Initialiser Brevo
let brevo = null;
if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.startsWith('xkeysib-')) {
  brevo = new BrevoClient();
  brevo.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
}

const sendMail = async (options) => {
  const useApi = brevo !== null;

  if (useApi) {
    try {
      const toEmails = options.to.split(',').map(email => ({ email: email.trim() }));
      
      const emailPayload = {
        subject: options.subject,
        htmlContent: options.html,
        sender: { 
          name: "Gîte de la Maladrerie - MUC", 
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
      from: `"Gîte de la Maladrerie - MUC" <${process.env.SMTP_SENDER || 'dr.mucomnisports@gmail.com'}>`,
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
          <!-- Règle 1 -->
          <td width="50%" valign="top" style="padding-bottom: 15px; padding-right: 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🧹</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Ménage avant départ :</strong> L'espace doit être rendu <u>propre et rangé</u> (balai passé, plans de travail nettoyés, vaisselle faite).
                </td>
              </tr>
            </table>
          </td>
          <!-- Règle 2 -->
          <td width="50%" valign="top" style="padding-bottom: 15px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🗑️</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Poubelles & Tri :</strong> Vos poubelles doivent être <u>vidées</u> dans les conteneurs extérieurs (tri sélectif obligatoire).
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <!-- Règle 3 -->
          <td width="50%" valign="top" style="padding-bottom: 15px; padding-right: 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🛌</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Draps & Linge :</strong> Les draps doivent être <u>retirés</u> des lits et déposés au pied de ceux-ci avec les serviettes.
                </td>
              </tr>
            </table>
          </td>
          <!-- Règle 4 -->
          <td width="50%" valign="top" style="padding-bottom: 15px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🚭</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Espace non-fumeur :</strong> Il est <u>strictement interdit de fumer ou vapoter</u> à l'intérieur du bâtiment.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <!-- Règle 5 -->
          <td width="50%" valign="top" style="padding-right: 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🤫</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Respect du voisinage :</strong> Pas de nuisances sonores, particulièrement <u>entre 22h00 et 07h00</u>.
                </td>
              </tr>
            </table>
          </td>
          <!-- Règle 6 -->
          <td width="50%" valign="top">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="28" valign="top" style="font-size: 18px;">🔒</td>
                <td style="font-size: 12px; color: #334155; line-height: 1.4;">
                  <strong>Sécurité :</strong> Assurez-vous que toutes les portes et fenêtres sont <u>bien fermées et verrouillées</u> lors de votre départ.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-size: 11.5px; color: #64748b; font-style: italic; text-align: center;">
        Tout manquement à ces règles entraînera une retenue partielle ou totale sur votre dépôt de garantie, conformément à l'article 10 de nos CGV.
      </div>
    </div>
  `;
};

const getAdminEmailsForPreference = (prisma, preferenceKey) => {
  // Simplification pour éviter l'appel DB complexe ou si l'admin n'a pas de prefs.
  // Dans webhook.js, on a juste besoin d'un fallback email.
  return process.env.SMTP_SENDER || 'david.roujet@mucomnisports.fr';
};

const sendPaymentConfirmationEmails = async (prisma, reservation, paymentType, amount, balancePaymentLink = '') => {
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
      cgvReference = `Avant votre entrée dans les lieux, il vous sera demandé d'effectuer l'empreinte bancaire pour le dépôt de garantie (caution de 500 €). Si ce n'est pas déjà fait, vous recevrez un lien de paiement dédié quelques jours avant votre arrivée.`;
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
      if (!tokenModification && !isCaution) {
        tokenModification = crypto.randomBytes(32).toString('hex');
        try {
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: { tokenModification }
          });
        } catch (dbErr) {
          console.error("Erreur génération token modification:", dbErr);
        }
      }

      const BACKEND_URL = process.env.BACKEND_URL || 'https://www.gite-maladrerie.fr';
      const modificationUrl = `${BACKEND_URL}/modification-reservation/${tokenModification}`;

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <!-- En-tête -->
          <div style="background-color: #004B93; padding: 25px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.5px;">Gîte de La Maladrerie</h1>
            <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Confirmation de ${typeLabel}</p>
          </div>

          <!-- Corps -->
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Bonjour ${reservation.client.nom},</h2>
            
            <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #166534; font-size: 15px; line-height: 1.5;">
                ${descriptionText}
              </p>
            </div>

            <!-- Récapitulatif -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
              <h3 style="margin-top: 0; color: #004B93; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Récapitulatif de votre séjour</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; color: #475569;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Réservation N°</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right;">${reservation.id}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Dates</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right;">Du ${dDebut} au ${dFin}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>Montant Total</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; color: #004B93; font-weight: bold;">${reservation.prixTotal?.toFixed(2)} €</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Statut</strong></td>
                  <td style="padding: 8px 0; text-align: right;">
                    <span style="background-color: ${isSoldeComplet ? '#22c55e' : '#f59e0b'}; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">
                      ${isSoldeComplet ? 'PAYÉ' : 'EN ATTENTE DE SOLDE'}
                    </span>
                  </td>
                </tr>
              </table>
            </div>

            ${!isCaution && tokenModification ? `
            <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 13px; color: #64748b; margin-bottom: 10px;">Vous souhaitez modifier le nombre de repas ou d'occupants avant votre arrivée ?</p>
              <a href="${modificationUrl}" style="background-color: #f8fafc; color: #004B93; border: 1px solid #cbd5e1; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Modifier ma réservation</a>
            </div>
            ` : ''}

            <!-- Infos CGV -->
            <div style="border-left: 3px solid #cbd5e1; padding-left: 15px; margin-bottom: 25px;">
              <p style="color: #475569; font-size: 13px; line-height: 1.5; margin: 0;">
                ${cgvReference}
              </p>
            </div>

            ${balancePaymentLink && isAcompte ? `
              <div style="text-align: center; margin-top: 25px;">
                <a href="${balancePaymentLink}" style="background-color: #004B93; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Régler le solde maintenant</a>
              </div>
            ` : ''}
            
            ${getRulesVignettesHTML()}

          </div>

          <!-- Pied de page -->
          <div style="background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 12px;">
            <p style="margin: 0 0 10px 0;"><strong>MUC Omnisports - Gîte de la Maladrerie</strong></p>
            <p style="margin: 0 0 5px 0;">Complexe Sportif Albert Batteux, Rue de la Maladrerie, 34000 Montpellier</p>
            <p style="margin: 0;"><a href="mailto:david.roujet@mucomnisports.fr" style="color: #004B93; text-decoration: none;">david.roujet@mucomnisports.fr</a> | 04 99 58 35 35</p>
          </div>
        </div>
      `;

      // N'inclure les PJ que s'il ne s'agit pas d'un simple dépôt de caution
      const attachments = !isCaution ? getClientAttachments() : undefined;

      await sendMail({
        to: reservation.client.email,
        subject: `✅ Confirmation de paiement : ${typeLabel} - Gîte de la Maladrerie`,
        html: emailHtml,
        attachments
      });
      console.log(`Email de confirmation de paiement (${paymentType}) envoyé au client ${reservation.client.email}`);
    }

    // 2. Email Administratif
    const adminEmail = getAdminEmailsForPreference(prisma, 'notifPaymentReceived');
    if (adminEmail) {
      const adminHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd;">
          <h2 style="color: #2c3e50;">Nouveau Paiement Reçu (${typeLabel})</h2>
          <p>Le paiement suivant a été validé avec succès par Stripe :</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr><td style="padding: 8px; border: 1px solid #ccc;"><strong>Réservation N°</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${reservation.id}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc;"><strong>Client</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${reservation.client?.nom || 'Inconnu'}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc;"><strong>Type de paiement</strong></td><td style="padding: 8px; border: 1px solid #ccc; color: #d35400; font-weight: bold;">${typeLabel}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc;"><strong>Montant encaissé</strong></td><td style="padding: 8px; border: 1px solid #ccc; color: #27ae60; font-weight: bold;">${amount.toFixed(2)} €</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ccc;"><strong>Statut réservation</strong></td><td style="padding: 8px; border: 1px solid #ccc;">${reservation.statut} / ${reservation.statutPaiement}</td></tr>
          </table>
          <p style="margin-top: 20px; font-size: 12px; color: #7f8c8d;">Notification automatique - Gîte de la Maladrerie</p>
        </div>
      `;

      await sendMail({
        to: adminEmail,
        subject: `[ADMIN] Nouveau paiement reçu : ${typeLabel} - Réservation #${reservation.id}`,
        html: adminHtml
      });
      console.log(`Email de notification admin de paiement envoyé à ${adminEmail}`);
    }

  } catch (error) {
    console.error("Erreur lors de l'envoi des emails de confirmation de paiement :", error);
  }
};

module.exports = {
  sendMail,
  getClientAttachments,
  getRulesVignettesHTML,
  getAdminEmailsForPreference,
  sendPaymentConfirmationEmails
};
