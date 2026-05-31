const fs = require('fs');

const code = `
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

    if (montantAcompteCalcule <= 0) return res.status(400).json({ error: 'L\\'acompte est de 0€' });

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
      success_url: \`\${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${FRONTEND_URL}/payment-cancel\`,
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
      subject: 'Paiement de l\\'acompte de votre séjour - Gîte de La Maladrerie',
      html: \`
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour \${reservation.client.nom},</h2>
              <p>Afin de confirmer votre réservation pour le séjour du <strong>\${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>\${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>, veuillez procéder au règlement de l'acompte.</p>
              <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                <tr><td><a href="\${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer l'acompte de \${montantAcompteCalcule.toFixed(2)} €</a></td></tr>
              </table>
              <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie</strong></p>
            </td></tr>
          </table></td></tr>
        </table>
      \`
    });

    res.json({ message: 'Lien d\\'acompte envoyé', url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération de l\\'acompte' });
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
      success_url: \`\${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${FRONTEND_URL}/payment-cancel\`,
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
      html: \`
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
          <tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd; font-family: sans-serif;">
            <tr><td style="background-color: #004B93; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0;">Gîte de La Maladrerie</h1></td></tr>
            <tr><td style="padding: 40px; color: #333333; line-height: 1.6;">
              <h2 style="color: #004B93; margin-top: 0;">Bonjour \${reservation.client.nom},</h2>
              <p>Afin de confirmer et régler l'intégralité de votre séjour du <strong>\${new Date(reservation.dateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>\${new Date(reservation.dateFin).toLocaleDateString('fr-FR')}</strong>, veuillez procéder au règlement total.</p>
              <table width="100%" cellpadding="25" cellspacing="0" border="0" style="background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; text-align: center; margin: 30px 0;">
                <tr><td><a href="\${session.url}" style="background-color: #FDB913; color: #004B93; padding: 18px 35px; text-decoration: none; border-radius: 8px; font-weight: 900; font-size: 18px; display: inline-block;">Payer la totalité de \${montantTotal.toFixed(2)} €</a></td></tr>
              </table>
              <p>À très bientôt !<br><strong>L'équipe du Gîte de La Maladrerie</strong></p>
            </td></tr>
          </table></td></tr>
        </table>
      \`
    });

    res.json({ message: 'Lien de paiement total envoyé', url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération du paiement total' });
  }
});
`;

let file = fs.readFileSync('backend/server.js', 'utf8');
const anchor = "app.post('/api/reservations/:id/solde', checkAuth, async (req, res) => {";
if (file.includes(anchor)) {
  file = file.replace(anchor, code + '\n' + anchor);
  fs.writeFileSync('backend/server.js', file);
  console.log('Routes added successfully.');
} else {
  console.log('Anchor not found.');
}
