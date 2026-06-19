const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Génère un buffer PDF pour une facture détaillée
 * @param {Object} data 
 * @returns {Promise<Buffer>}
 */
async function generateFacturePDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                margin: 50,
                bufferPages: true,
                info: {
                    Title: `Facture ${data.numeroFacture} - Gîte de la Maladrerie`,
                    Author: 'Gîte de la Maladrerie - MUC'
                }
            });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // --- HEADER ---
            doc.rect(0, 0, 612, 100).fill('#004B93');
            
            try {
                const logoPath = path.join(__dirname, '../../public/logo-muc.png');
                if (fs.existsSync(logoPath)) {
                    doc.image(logoPath, 500, 20, { width: 60 });
                }
            } catch (err) {
                console.error("Erreur d'ajout du logo au PDF de facture :", err);
            }

            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('GÎTE DE LA MALADRERIE', 50, 40);
            doc.fontSize(10).font('Helvetica').text('MUC OMNISPORTS', 50, 65);
            
            // --- INFOS FACTURE ---
            doc.fillColor('#000000').moveDown(4);
            const startY = 120;
            const leftCol = 50;
            const rightCol = 350;

            doc.fontSize(16).font('Helvetica-Bold').fillColor('#004B93').text(`FACTURE`, leftCol, startY);
            doc.fontSize(10).font('Helvetica').fillColor('#000000');
            doc.text(`N° Facture : ${data.numeroFacture}`, leftCol, startY + 25);
            doc.text(`Réf. Réservation : #${data.reservationId}`, leftCol, startY + 40);
            doc.text(`Date d'émission : ${new Date(data.dateEmission).toLocaleDateString('fr-FR')}`, leftCol, startY + 55);
            
            // Tampon de paiement si payé
            if (data.statutPaiement === 'PAYE') {
                doc.save();
                doc.rect(leftCol, startY + 75, 120, 24).fillAndStroke('#e6f4ea', '#137333');
                doc.fillColor('#137333').font('Helvetica-Bold').fontSize(11).text('FACTURÉ & PAYÉ', leftCol, startY + 81, { width: 120, align: 'center' });
                doc.restore();
            } else if (data.statutPaiement === 'ACOMPTE_PAYE') {
                doc.save();
                doc.rect(leftCol, startY + 75, 120, 24).fillAndStroke('#fef7e0', '#b06000');
                doc.fillColor('#b06000').font('Helvetica-Bold').fontSize(11).text('ACOMPTE PAYÉ', leftCol, startY + 81, { width: 120, align: 'center' });
                doc.restore();
            } else {
                doc.save();
                doc.rect(leftCol, startY + 75, 120, 24).fillAndStroke('#fce8e6', '#c5221f');
                doc.fillColor('#c5221f').font('Helvetica-Bold').fontSize(11).text('EN ATTENTE', leftCol, startY + 81, { width: 120, align: 'center' });
                doc.restore();
            }

            // --- EMETTEUR (Gérant / Admin) ---
            doc.fontSize(10).font('Helvetica').text('Émetteur :', rightCol, startY);
            doc.fontSize(11).font('Helvetica-Bold').text(data.adminNom || 'Gîte de la Maladrerie', rightCol, startY + 15);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Email : ${data.adminEmail || 'david.roujet@mucomnisports.fr'}`, rightCol, startY + 30);
            doc.text(`Tél : ${data.adminTel || '04 67 15 82 00'}`, rightCol, startY + 45);

            // --- DATES DU SÉJOUR ---
            doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(10).text(`Dates du séjour : du ${new Date(data.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(data.dateFin).toLocaleDateString('fr-FR')} (${data.nuits} nuits)`, leftCol, 220);
            doc.fillColor('#000000');

            // --- CLIENT (Destinataire) ---
            const clientY = 245;
            doc.rect(leftCol - 10, clientY - 10, 250, 95).stroke('#EEEEEE');
            doc.fontSize(10).font('Helvetica').text('Facturé à :', leftCol, clientY);
            doc.fontSize(12).font('Helvetica-Bold').text(data.clientNom, leftCol, clientY + 15);
            if (data.structure) {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#64748b').text(`Structure : ${data.structure}`, leftCol, clientY + 32);
                doc.fillColor('#000000');
            }
            doc.fontSize(10).font('Helvetica').text(data.clientAdresse || 'Adresse non renseignée', leftCol, clientY + (data.structure ? 48 : 35), { width: 230 });
            doc.text(`Tél : ${data.clientTel || 'Non renseigné'}`, leftCol, clientY + 75);

            // Règlements Details Box
            const reglementsY = clientY;
            doc.rect(rightCol - 10, reglementsY - 10, 230, 95).stroke('#EEEEEE');
            doc.fontSize(10).font('Helvetica').text('Détails des Règlements :', rightCol, reglementsY);
            doc.fontSize(9).font('Helvetica');
            let offsetReg = 20;
            if (data.modePaiement) {
                doc.text(`Mode de paiement : ${data.modePaiement}`, rightCol, reglementsY + offsetReg);
                offsetReg += 15;
            }
            if (data.statutPaiement === 'PAYE') {
                doc.font('Helvetica-Bold').fillColor('#137333').text('Paiement complet reçu.', rightCol, reglementsY + offsetReg);
                doc.font('Helvetica').fillColor('#000000');
            } else if (data.statutPaiement === 'ACOMPTE_PAYE') {
                doc.font('Helvetica-Bold').fillColor('#b06000').text('Acompte encaissé, solde en attente.', rightCol, reglementsY + offsetReg);
                doc.font('Helvetica').fillColor('#000000');
            } else {
                doc.font('Helvetica-Bold').fillColor('#c5221f').text('Aucun règlement enregistré.', rightCol, reglementsY + offsetReg);
                doc.font('Helvetica').fillColor('#000000');
            }
            if (data.payeLe) {
                offsetReg += 15;
                doc.text(`Date de règlement : ${new Date(data.payeLe).toLocaleDateString('fr-FR')}`, rightCol, reglementsY + offsetReg);
            }

            // --- TABLEAU DES PRESTATIONS ---
            const tableTop = 360;
            const colDesig = leftCol + 5;
            const colPers = leftCol + 220;
            const colPU = leftCol + 290;
            const colNuits = leftCol + 370;
            const colTotal = leftCol + 440;
            const colTotalW = 65;

            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(leftCol, tableTop, 512, 20).fill('#004B93');
            doc.fillColor('#FFFFFF');
            
            // Header Colonnes
            doc.text('DÉSIGNATION', colDesig, tableTop + 6, { width: 210 });
            doc.text('NB PERS.', colPers, tableTop + 6, { width: 60, align: 'center' });
            doc.text('TARIF UNITAIRE', colPU, tableTop + 6, { width: 75, align: 'center' });
            doc.text('NB NUITS', colNuits, tableTop + 6, { width: 60, align: 'center' });
            doc.text('TOTAL (€)', colTotal, tableTop + 6, { align: 'right', width: colTotalW });

            let y = tableTop + 28;
            doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
            
            const checkPageBreak = (spaceNeeded = 18) => {
                if (y + spaceNeeded > 700) {
                    doc.addPage();
                    y = 50;
                    
                    doc.rect(leftCol, y, 512, 20).fill('#004B93');
                    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
                    doc.text('DÉSIGNATION', colDesig, y + 6, { width: 210, lineBreak: false });
                    doc.text('NB PERS.', colPers, y + 6, { width: 60, align: 'center', lineBreak: false });
                    doc.text('TARIF UNITAIRE', colPU, y + 6, { width: 75, align: 'center', lineBreak: false });
                    doc.text('NB NUITS', colNuits, y + 6, { width: 60, align: 'center', lineBreak: false });
                    doc.text('TOTAL (€)', colTotal, y + 6, { align: 'right', width: colTotalW, lineBreak: false });
                    
                    y += 28;
                    doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
                }
            };
            
            // Lignes Hébergement et Prestations
            if (data.detailsLignes && data.detailsLignes.length > 0) {
                data.detailsLignes.forEach((ligne, idx) => {
                    checkPageBreak(18);
                    if (idx % 2 === 0) {
                        doc.rect(leftCol, y - 4, 512, 18).fill('#F8F9FA');
                        doc.fillColor('#000000');
                    }
                    doc.text(ligne.designation, colDesig, y, { width: 210, lineBreak: false, ellipsis: true });
                    doc.text(ligne.nbPersonnes.toString(), colPers, y, { width: 60, align: 'center', lineBreak: false });
                    doc.text(`${(ligne.tarifParPersonne || 0).toFixed(2)} €`, colPU, y, { width: 75, align: 'center', lineBreak: false });
                    doc.text(ligne.nuits.toString(), colNuits, y, { width: 60, align: 'center', lineBreak: false });
                    doc.font('Helvetica-Bold').text((ligne.total || 0).toFixed(2), colTotal, y, { align: 'right', width: colTotalW, lineBreak: false });
                    doc.font('Helvetica');
                    y += 18;
                });
            }

            // Séparateur
            checkPageBreak(10);
            y += 2;
            doc.strokeColor('#DDDDDD').moveTo(leftCol, y).lineTo(leftCol + 512, y).stroke();
            y += 8;

            // Options
            if (data.options && data.options.length > 0) {
                data.options.forEach(opt => {
                    checkPageBreak(18);
                    doc.text(opt.nom, colDesig, y, { width: 210, lineBreak: false, ellipsis: true });
                    doc.text(opt.qte.toString(), colPers, y, { width: 60, align: 'center', lineBreak: false });
                    doc.text(`${opt.pu.toFixed(2)} €`, colPU, y, { width: 75, align: 'center', lineBreak: false });
                    doc.text('—', colNuits, y, { width: 60, align: 'center', lineBreak: false });
                    doc.text(opt.total.toFixed(2), colTotal, y, { align: 'right', width: colTotalW, lineBreak: false });
                    y += 18;
                });
            }

            // Taxe de séjour
            if (data.taxeSejourDetails) {
                checkPageBreak(18);
                const tsd = data.taxeSejourDetails;
                const puTaxe = (tsd.base * tsd.taux).toFixed(2);
                
                doc.text(`Taxe de séjour`, colDesig, y, { width: 210, lineBreak: false });
                doc.text(tsd.adultes.toString(), colPers, y, { width: 60, align: 'center', lineBreak: false });
                doc.text(`${puTaxe} €`, colPU, y, { width: 75, align: 'center', lineBreak: false });
                doc.text(tsd.nuits.toString(), colNuits, y, { width: 60, align: 'center', lineBreak: false });
                doc.text(tsd.total.toFixed(2), colTotal, y, { align: 'right', width: colTotalW, lineBreak: false });
                y += 18;
            }

            // Promo
            if (data.promoMontant > 0) {
                y += 4;
                doc.fillColor('#dc3545');
                doc.text(`Remise (Code: ${data.codePromo})`, colDesig, y);
                doc.text(`-${data.promoMontant.toFixed(2)}`, colTotal, y, { align: 'right', width: colTotalW });
                doc.fillColor('#000000');
                y += 20;
            }

            // --- TOTAUX ---
             y += 5;
             doc.strokeColor('#004B93').lineWidth(1).moveTo(leftCol + 280, y).lineTo(leftCol + 512, y).stroke();
             doc.lineWidth(0.5);
             y += 10;

             checkPageBreak(85);
             const totalBoxY = y - 5;
             doc.rect(leftCol + 280, totalBoxY, 232, 70).fill('#F8F9FA');
             doc.fillColor('#000000');
             
             y += 5;
             doc.fontSize(12).font('Helvetica-Bold').fillColor('#004B93').text('TOTAL FACTURÉ TTC', leftCol + 290, y);
             doc.text(`${data.prixTotal.toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });
             
             y += 20;
             doc.fontSize(9).font('Helvetica-Bold').fillColor('#137333').text('Montant réglé :', leftCol + 290, y);
             let montantPayeTotal = 0;
             if (data.statutPaiement === 'PAYE') {
                 montantPayeTotal = data.prixTotal;
             } else if (data.statutPaiement === 'ACOMPTE_PAYE') {
                 montantPayeTotal = data.montantAcompte;
             }
             doc.text(`${montantPayeTotal.toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });
             
             y += 15;
             doc.fontSize(10).font('Helvetica-Bold').fillColor(data.statutPaiement === 'PAYE' ? '#137333' : '#c5221f').text(data.statutPaiement === 'PAYE' ? 'Reste à payer :' : 'Reste à régler :', leftCol + 290, y);
             let soldeRestant = data.prixTotal - montantPayeTotal;
             doc.text(`${soldeRestant.toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });

            // Mentions TVA et association
            y = Math.max(680, y + 45);
            doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#666666');
            doc.text("Exonération de TVA - Article 261-7-1° du Code Général des Impôts (Association loi 1901 à but non lucratif).", leftCol, y, { width: 512, align: 'center' });
            
            // --- PIED DE PAGE ---
            doc.fontSize(8).fillColor('#999999').text('Gîte de la Maladrerie - MUC OMNISPORTS | SIRET: 38820857100025 | Assurance MAIF n° 132 48 45 M', 0, 760, { align: 'center', width: 612 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateFacturePDF };
