const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const cgvTxtPath = path.join(__dirname, '../CGV.txt');
const pdfOutputPath = path.join(__dirname, '../assets/CGV - Gite de la Maladrerie.pdf');

// Assurons-nous que le répertoire assets existe
const assetsDir = path.dirname(pdfOutputPath);
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function generatePDF() {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(cgvTxtPath)) {
        return reject(new Error("Le fichier CGV.txt est introuvable."));
      }

      const cgvText = fs.readFileSync(cgvTxtPath, 'utf8');

      // Création d'un document PDF A4 standard (595.28 x 841.89 points)
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: 'Conditions Générales de Vente et de Location - Gîte de la Maladrerie',
          Author: 'Gîte de la Maladrerie - MUC'
        }
      });

      const writeStream = fs.createWriteStream(pdfOutputPath);
      doc.pipe(writeStream);

      // --- HEADER ---
      doc.rect(0, 0, 595.28, 90).fill('#004B93');
      
      // Essayer d'ajouter le logo
      try {
        const logoPath = path.join(__dirname, '../../public/logo-muc.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 490, 15, { width: 55 });
        }
      } catch (err) {
        console.error("Logo non ajouté au PDF :", err.message);
      }

      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(18)
         .text('CONDITIONS GÉNÉRALES DE VENTE', 40, 30);
      doc.fontSize(9)
         .font('Helvetica')
         .text('GÎTE DE LA MALADRERIE - MUC OMNISPORTS', 40, 55);

      // --- TEXT CONTENT ---
      doc.fillColor('#1A202C')
         .font('Helvetica')
         .fontSize(8.5)
         .lineGap(2.5);

      // Affichage du texte en double colonne pour une lisibilité optimale et compacte (tient en 1 ou 2 pages)
      doc.text(cgvText, 40, 110, {
        align: 'justify',
        columns: 2,
        columnGap: 25,
        width: 515.28,
        height: 650
      });

      // --- FOOTER ---
      doc.fontSize(7)
         .fillColor('#718096')
         .text('Gîte de la Maladrerie - MUC OMNISPORTS | SIRET: 38820857100025 | Assurance MAIF n° 132 48 45 M', 0, 800, {
           align: 'center',
           width: 595.28
         });

      doc.end();

      writeStream.on('finish', () => {
        console.log("PDF des CGV généré avec succès dans :", pdfOutputPath);
        resolve();
      });

      writeStream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

generatePDF()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur de génération :", err);
    process.exit(1);
  });
