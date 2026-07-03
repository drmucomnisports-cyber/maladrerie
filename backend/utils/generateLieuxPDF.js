const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Génère un buffer PDF pour l'émargement de l'état des lieux et de l'inventaire
 * @param {Object} reservation
 * @returns {Promise<Buffer>}
 */
async function generateLieuxPDF(reservation) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 40, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `État des lieux - Résa #${reservation.id} - Gîte de la Maladrerie`,
          Author: 'Gîte de la Maladrerie - MUC'
        }
      });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // --- HEADER ---
      doc.rect(0, 0, 612, 100).fill('#004B93');
      
      try {
        const logoPath = path.join(__dirname, '../assets/logo-muc.jpg');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 500, 20, { width: 60 });
        }
      } catch (err) {
        console.error("Erreur d'ajout du logo au PDF :", err);
      }

      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text("GÎTE DE LA MALADRERIE", 50, 35);
      doc.fontSize(9).font('Helvetica').text('MUC OMNISPORTS', 50, 58);
      doc.fontSize(11).font('Helvetica-Bold').text("ÉMARGEMENT ÉTAT DES LIEUX & INVENTAIRE", 50, 72);

      // --- INFO SECTION ---
      doc.fillColor('#000000').moveDown(4);
      const startY = 120;
      const leftCol = 50;
      const rightCol = 330;

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#004B93').text("DÉTAILS DE LA RÉSERVATION", leftCol, startY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      
      const formatLongDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      };

      doc.text(`Réf. Réservation : #${reservation.id}`, leftCol, startY + 25);
      if (reservation.numeroDevis) {
        doc.text(`N° Devis associé : ${reservation.numeroDevis}`, leftCol, startY + 40);
      }
      doc.text(`Date d'arrivée : ${formatLongDate(reservation.dateDebut)} (à partir de 17h00)`, leftCol, startY + (reservation.numeroDevis ? 55 : 40));
      doc.text(`Date de départ : ${formatLongDate(reservation.dateFin)} (avant 11h00)`, leftCol, startY + (reservation.numeroDevis ? 70 : 55));

      // Client info block
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#004B93').text("LOCATAIRE", rightCol, startY);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text(`${reservation.client?.nom || ''} ${reservation.client?.prenom || ''}`, rightCol, startY + 18);
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      if (reservation.structure) {
        doc.text(`Structure : ${reservation.structure}`, rightCol, startY + 33);
      }
      doc.text(`Email : ${reservation.client?.email || ''}`, rightCol, startY + (reservation.structure ? 48 : 33));
      doc.text(`Téléphone : ${reservation.client?.telephone || ''}`, rightCol, startY + (reservation.structure ? 63 : 48));

      // Horizontal separator line
      const sepY = startY + 95;
      doc.moveTo(leftCol, sepY).lineTo(562, sepY).strokeColor('#E2E8F0').stroke();

      // --- ENGAGEMENT TEXT ---
      const textY = sepY + 20;
      doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(12).text("DÉCLARATION DE CONFORMITÉ & ENGAGEMENT", leftCol, textY);
      
      const engagementText = "Le locataire soussigné certifie sur l'honneur avoir pris connaissance de l'inventaire complet des équipements et de l'état des lieux du gîte de la Maladrerie annexés au présent document.\n\n" +
                             "Il accepte formellement ces documents sans réserve et s'engage à maintenir les lieux en bon état de propreté et de conservation, ainsi qu'à respecter l'ensemble des consignes de sécurité, d'usage et le règlement intérieur de l'établissement.";
      
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(engagementText, leftCol, textY + 25, {
        width: 512,
        align: 'justify',
        lineGap: 4
      });

      // --- REMARKS / DISCREPANCIES SECTION ---
      const remarksY = textY + 130;
      doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(12).text("OBSERVATIONS & ÉCARTS SIGNALÉS À L'ARRIVÉE", leftCol, remarksY);
      
      let observationsText = "Aucun écart ou observation n'a été signalé par le client lors de son entrée dans les lieux.";
      if (reservation.signatureLieuxRemarques && reservation.signatureLieuxRemarques.trim() !== '') {
        observationsText = reservation.signatureLieuxRemarques;
        doc.save();
        // Highlight box for differences
        doc.rect(leftCol, remarksY + 20, 512, 60).fillAndStroke('#FFFBEB', '#F59E0B');
        doc.fillColor('#92400E').font('Helvetica-Oblique').fontSize(10).text(observationsText, leftCol + 15, remarksY + 30, {
          width: 482,
          lineGap: 3
        });
        doc.restore();
      } else {
        doc.font('Helvetica').fontSize(10).fillColor('#64748B').text(observationsText, leftCol, remarksY + 22);
      }

      // --- SIGNATURE SECTION ---
      const sigBlockY = remarksY + (reservation.signatureLieuxRemarques ? 100 : 55);
      doc.moveTo(leftCol, sigBlockY).lineTo(562, sigBlockY).strokeColor('#E2E8F0').stroke();

      const sigY = sigBlockY + 15;
      doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(12).text("SIGNATURE ÉLECTRONIQUE DU LOCATAIRE", leftCol, sigY);
      
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      doc.text(`Nom du signataire : ${reservation.signatureLieuxName || (reservation.client?.nom + ' ' + reservation.client?.prenom)}`, leftCol, sigY + 22);
      
      const sigDate = reservation.signatureLieuxDate 
        ? new Date(reservation.signatureLieuxDate).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleString('fr-FR');
      doc.text(`Date et heure : ${sigDate}`, leftCol, sigY + 35);
      doc.text(`Adresse IP : ${reservation.signatureLieuxIp || 'Non enregistrée'}`, leftCol, sigY + 48);
      doc.text(`Jeton d'émargement : ${reservation.tokenLieuxSign || 'Non généré'}`, leftCol, sigY + 61);

      // Render the signature image if it exists
      if (reservation.signatureLieuxImage) {
        try {
          let base64Data = reservation.signatureLieuxImage;
          // Clean base64 header
          if (base64Data.startsWith('data:image')) {
            base64Data = base64Data.split(',')[1];
          }
          const sigBuffer = Buffer.from(base64Data, 'base64');
          
          doc.save();
          doc.rect(rightCol, sigY + 20, 230, 90).stroke('#CBD5E1');
          doc.fontSize(8).font('Helvetica').fillColor('#94A3B8').text("SIGNATURE MANUSCRITE NUMÉRIQUE", rightCol + 5, sigY + 25);
          doc.image(sigBuffer, rightCol + 25, sigY + 35, { width: 180, height: 65 });
          doc.restore();
        } catch (err) {
          console.error("Erreur de rendu de l'image de signature dans le PDF :", err);
          doc.rect(rightCol, sigY + 20, 230, 90).stroke('#CBD5E1');
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#EF4444').text("Erreur lors de l'affichage de la signature", rightCol + 20, sigY + 50);
        }
      } else {
        doc.rect(rightCol, sigY + 20, 230, 90).stroke('#CBD5E1');
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#64748B').text("Signature manquante", rightCol + 50, sigY + 55);
      }

      // --- FOOTER ---
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#94A3B8').text(
          `Gîte de la Maladrerie - Rue de la Maladrerie, 30120 Le Vigan | Tél : 04 67 15 82 00 | Email : david.roujet@mucomnisports.fr`,
          50,
          745,
          { align: 'center', width: 512 }
        );
        doc.text(
          `Page ${i + 1} / ${pages.count}`,
          50,
          758,
          { align: 'right', width: 512 }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateLieuxPDF };
