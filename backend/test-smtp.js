require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

console.log("Tentative de connexion à Brevo avec l'utilisateur:", process.env.SMTP_USER);

transporter.verify(function (error, success) {
  if (error) {
    console.error("Erreur de connexion SMTP détaillée :");
    console.error(error);
  } else {
    console.log("Connexion au serveur SMTP réussie ! Prêt à envoyer des messages.");
  }
});
