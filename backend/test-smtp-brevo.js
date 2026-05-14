const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465, // On teste le port 465
  secure: true, // true pour 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  debug: true, // Activer les logs détaillés
  logger: true
});

console.log("Tentative de connexion au serveur SMTP Brevo...");

transporter.verify(function(error, success) {
  if (error) {
    console.log("Erreur de connexion détaillée :");
    console.log(error);
  } else {
    console.log("Succès ! Le serveur est prêt à envoyer des e-mails sur le port 465.");
  }
  process.exit();
});
