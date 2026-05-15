const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Génère un buffer PDF pour un devis détaillé
 * @param {Object} data 
 * @returns {Promise<Buffer>}
 */
async function generateDevisPDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                margin: 50,
                info: {
                    Title: `Devis ${data.numeroDevis} - Gîte de la Maladrerie`,
                    Author: 'Gîte de la Maladrerie - MUC'
                }
            });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // --- HEADER ---
            doc.rect(0, 0, 612, 100).fill('#004B93');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('GÎTE DE LA MALADRERIE', 50, 40);
            doc.fontSize(10).font('Helvetica').text('Complexe Sportif Universitaire - MUC OMNISPORTS', 50, 65);
            
            // --- INFOS DEVIS ---
            doc.fillColor('#000000').moveDown(4);
            const startY = 120;
            const leftCol = 50;
            const rightCol = 350;

            doc.fontSize(14).font('Helvetica-Bold').text(`DEVIS PROFESSIONNEL`, leftCol, startY);
            doc.fontSize(10).font('Helvetica');
            doc.text(`N° : ${data.numeroDevis}`, leftCol, startY + 25);
            doc.text(`Réf. Client : ${data.refClient}`, leftCol, startY + 40);
            doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, leftCol, startY + 55);
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text(`Date de validité : ${new Date(data.expireLe).toLocaleDateString('fr-FR')}`, leftCol);
            doc.font('Helvetica-Bold').fillColor('#004B93').text(`Dates du séjour : du ${new Date(data.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(data.dateFin).toLocaleDateString('fr-FR')}`, leftCol);
            doc.fillColor('#000000');

            // --- ADMIN (Émetteur) ---
            doc.fontSize(10).font('Helvetica').text('Établi par :', rightCol, startY);
            doc.fontSize(11).font('Helvetica-Bold').text(data.adminNom || 'L\'équipe du Gîte', rightCol, startY + 15);
            doc.fontSize(10).font('Helvetica');
            if (data.adminTel) doc.text(`Tél : ${data.adminTel}`, rightCol, startY + 30);
            doc.text(`Email : ${data.adminEmail || 'contact@gitemaladrerie.fr'}`, rightCol, startY + 45);

            // --- CLIENT (Destinataire) ---
            const clientY = 220;
            doc.rect(leftCol - 10, clientY - 10, 250, 90).stroke('#EEEEEE');
            doc.fontSize(10).font('Helvetica').text('Destinataire :', leftCol, clientY);
            doc.fontSize(12).font('Helvetica-Bold').text(data.clientNom, leftCol, clientY + 15);
            doc.fontSize(10).font('Helvetica').text(data.clientAdresse || 'Adresse non renseignée', leftCol, clientY + 35, { width: 230 });
            doc.text(`Tél : ${data.clientTel || 'Non renseigné'}`, leftCol, clientY + 60);

            // --- TABLEAU DES PRESTATIONS ---
            const tableTop = 330;
            doc.font('Helvetica-Bold').fontSize(9);
            doc.rect(leftCol, tableTop, 512, 20).fill('#F8F9FA');
            doc.fillColor('#004B93');
            
            // Header Colonnes
            doc.text('DÉSIGNATION', leftCol + 10, tableTop + 6);
            doc.text('PU (€)', leftCol + 300, tableTop + 6, { width: 50, align: 'right' });
            doc.text('QTÉ', leftCol + 360, tableTop + 6, { width: 50, align: 'center' });
            doc.text('TOTAL (€)', leftCol + 440, tableTop + 6, { align: 'right', width: 60 });

            let y = tableTop + 30;
            doc.fillColor('#000000').font('Helvetica').fontSize(9);
            
            // Lignes Hébergement
            if (data.detailsLignes && data.detailsLignes.length > 0) {
                data.detailsLignes.forEach(ligne => {
                    doc.text(ligne.designation, leftCol + 10, y, { width: 280 });
                    doc.text(ligne.pu.toFixed(2), leftCol + 300, y, { width: 50, align: 'right' });
                    doc.text(ligne.qte.toString(), leftCol + 360, y, { width: 50, align: 'center' });
                    doc.text(ligne.total.toFixed(2), leftCol + 440, y, { align: 'right', width: 60 });
                    y += 20;
                });
            } else {
                // Fallback si pas de détails
                doc.text('Hébergement', leftCol + 10, y);
                doc.text(data.prixSejour?.toFixed(2) || '0.00', leftCol + 440, y, { align: 'right', width: 60 });
                y += 20;
            }

            // Options
            if (data.options && data.options.length > 0) {
                data.options.forEach(opt => {
                    doc.text(opt.nom, leftCol + 10, y, { width: 280 });
                    doc.text(opt.pu.toFixed(2), leftCol + 300, y, { width: 50, align: 'right' });
                    doc.text(opt.qte.toString(), leftCol + 360, y, { width: 50, align: 'center' });
                    doc.text(opt.total.toFixed(2), leftCol + 440, y, { align: 'right', width: 60 });
                    y += 20;
                });
            }

            // Taxe de séjour
            if (data.taxeSejourDetails) {
                const tsd = data.taxeSejourDetails;
                doc.text(`Taxe de séjour (${tsd.adultes} adultes x ${tsd.nuits} nuits)`, leftCol + 10, y, { width: 280 });
                doc.text((tsd.base * tsd.taux).toFixed(2), leftCol + 300, y, { width: 50, align: 'right' });
                doc.text(tsd.adultes.toString(), leftCol + 360, y, { width: 50, align: 'center' });
                doc.text(tsd.total.toFixed(2), leftCol + 440, y, { align: 'right', width: 60 });
                y += 20;
            }

            // Promo
            if (data.promoMontant > 0) {
                doc.fillColor('#dc3545');
                doc.text(`Remise (Code: ${data.codePromo})`, leftCol + 10, y);
                doc.text(`-${data.promoMontant.toFixed(2)}`, leftCol + 440, y, { align: 'right', width: 60 });
                doc.fillColor('#000000');
                y += 25;
            }

            // --- TOTAUX ---
            y += 10;
            doc.moveTo(leftCol + 300, y).lineTo(leftCol + 512, y).stroke('#EEEEEE');
            y += 10;
            doc.fontSize(11).font('Helvetica-Bold').text('TOTAL TTC', leftCol + 300, y);
            doc.text(`${data.prixTotal.toFixed(2)} €`, leftCol + 440, y, { align: 'right', width: 60 });
            
            y += 25;
            doc.fontSize(10).font('Helvetica').text('Acompte (30%) à régler :', leftCol + 300, y);
            doc.font('Helvetica-Bold').text(`${(data.prixTotal * 0.3).toFixed(2)} €`, leftCol + 440, y, { align: 'right', width: 60 });

            // --- MENTIONS LÉGALES & SIGNATURE ---
            y = 620;
            doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#666666');
            doc.text("Le présent devis sera complété par l'état des lieux et l'inventaire lors de l'entrée dans les lieux.", leftCol, y);
            
            y += 35;
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11).text('Bon pour accord', leftCol, y);
            doc.font('Helvetica').fontSize(10);
            doc.text('Date :', leftCol, y + 20);
            doc.text('Signature du client (précédée de la mention "Lu et approuvé") :', leftCol, y + 40);
            
            doc.rect(leftCol, y + 60, 250, 80).stroke('#CCCCCC');

            // --- PIED DE PAGE ---
            doc.fontSize(8).fillColor('#999999').text('Gîte de la Maladrerie - MUC OMNISPORTS | SIRET: 38820857100025 | Assurance MAIF n° 132 48 45 M', 0, 760, { align: 'center', width: 612 });

            // --- PAGE 2 : CGV ---
            doc.addPage();
            doc.rect(0, 0, 612, 50).fill('#004B93');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('CONDITIONS GÉNÉRALES DE VENTE', 50, 18);
            
            doc.fillColor('#000000').moveDown(3);
            doc.font('Helvetica').fontSize(7.5); // Slightly smaller to ensure it fits
            
            try {
                const cgvPath = path.join(__dirname, '../CGV.txt');
                if (fs.existsSync(cgvPath)) {
                    const cgvText = fs.readFileSync(cgvPath, 'utf8');
                    doc.text(cgvText, { align: 'justify', columns: 2, columnGap: 30 });
                } else {
                    doc.text("Les conditions générales de vente sont disponibles sur demande.");
                }
            } catch (e) {
                doc.text("Erreur lors du chargement des CGV.");
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateDevisPDF };
