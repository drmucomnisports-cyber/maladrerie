const fs = require('fs');
const path = require('path');

const envPath = 'c:/Users/david.roujet/OneDrive - MUC Omnisports/Pôle formation/Projet/Maladrerie/Antigravity Maladrerie/gite-landing-page/.env.vercel.prod';
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  if (line && line.includes('=')) {
    let [key, ...valueParts] = line.split('=');
    let value = valueParts.join('=').replace(/^"|"$/g, '');
    if (key === 'BREVO_API_KEY') process.env.BREVO_API_KEY = value;
  }
});

const { BrevoClient } = require('@getbrevo/brevo');

async function testBrevo() {
  console.log("Testing Brevo with key starting with:", process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.substring(0, 10) : 'none');
  
  try {
    const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
    
    const emailPayload = {
      subject: "Test email from Node",
      htmlContent: "<p>Hello</p>",
      sender: { 
        name: "Test", 
        email: "dr.mucomnisports@gmail.com" 
      },
      to: [{ email: "david.roujet@mucomnisports.fr" }]
    };

    console.log("Calling sendTransacEmail...");
    const result = await brevo.transactionalEmails.sendTransacEmail(emailPayload);
    console.log("Success:", result);
  } catch (err) {
    console.error("Brevo Error:", err);
    if (err.response) {
       console.error("Response:", err.response.data);
    }
  }
}

testBrevo();
