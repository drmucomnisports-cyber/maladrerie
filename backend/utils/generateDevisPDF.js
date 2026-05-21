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
                bufferPages: true,
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
            doc.fontSize(10).font('Helvetica').text('MUC OMNISPORTS', 50, 65);
            
            // --- INFOS DEVIS ---
            doc.fillColor('#000000').moveDown(4);
            const startY = 120;
            const leftCol = 50;
            const rightCol = 350;

            doc.fontSize(14).font('Helvetica-Bold').text(`DEVIS`, leftCol, startY);
            doc.fontSize(10).font('Helvetica');
            doc.text(`N° : ${data.numeroDevis}`, leftCol, startY + 25);
            doc.text(`Réf. Client : ${data.refClient}`, leftCol, startY + 40);
            doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, leftCol, startY + 55);
            doc.moveDown(0.5);
            doc.fillColor('#FDB913').font('Helvetica-Bold').text(`Date de validité : ${new Date(data.expireLe).toLocaleDateString('fr-FR')}`, leftCol, startY + 75);
            doc.fillColor('#000000');

            // --- ADMIN (Émetteur) ---
            doc.fontSize(10).font('Helvetica').text('Établit par :', rightCol, startY);
            doc.fontSize(11).font('Helvetica-Bold').text(data.adminNom, rightCol, startY + 15);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Email : ${data.adminEmail}`, rightCol, startY + 30);
            doc.text(`Tél : ${data.adminTel || 'Non renseigné'}`, rightCol, startY + 45);

            // --- DATES DU SÉJOUR (en dessous des dates de validité) ---
            doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(10).text(`Dates du séjour : du ${new Date(data.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(data.dateFin).toLocaleDateString('fr-FR')}`, leftCol, 220);
            doc.fillColor('#000000');

            // --- CLIENT (Destinataire, en dessous des dates du séjour) ---
            const clientY = 250;
            doc.rect(leftCol - 10, clientY - 10, 250, 90).stroke('#EEEEEE');
            doc.fontSize(10).font('Helvetica').text('Destinataire :', leftCol, clientY);
            doc.fontSize(12).font('Helvetica-Bold').text(data.clientNom, leftCol, clientY + 15);
            doc.fontSize(10).font('Helvetica').text(data.clientAdresse || 'Adresse non renseignée', leftCol, clientY + 35, { width: 230 });
            doc.text(`Tél : ${data.clientTel || 'Non renseigné'}`, leftCol, clientY + 65);

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
            doc.text('PRIX/PERS./NUIT', colPU, tableTop + 6, { width: 75, align: 'center' });
            doc.text('NB NUITS', colNuits, tableTop + 6, { width: 60, align: 'center' });
            doc.text('TOTAL (€)', colTotal, tableTop + 6, { align: 'right', width: colTotalW });

            let y = tableTop + 28;
            doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
            
            const checkPageBreak = (spaceNeeded = 18) => {
                if (y + spaceNeeded > 650) {
                    doc.addPage();
                    y = 50;
                    
                    doc.rect(leftCol, y, 512, 20).fill('#004B93');
                    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
                    doc.text('DÉSIGNATION', colDesig, y + 6, { width: 210, lineBreak: false });
                    doc.text('NB PERS.', colPers, y + 6, { width: 60, align: 'center', lineBreak: false });
                    doc.text('PRIX', colPU, y + 6, { width: 75, align: 'center', lineBreak: false });
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
                    // Alternate row background for readability
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
            } else {
                // Fallback
                checkPageBreak(18);
                doc.text('Hébergement du séjour', colDesig, y);
                doc.text(data.prixSejour?.toFixed(2) || '0.00', colTotal, y, { align: 'right', width: colTotalW });
                y += 18;
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
             // Séparateur avant totaux
             y += 5;
             doc.strokeColor('#004B93').lineWidth(1).moveTo(leftCol + 280, y).lineTo(leftCol + 512, y).stroke();
             doc.lineWidth(0.5);
             y += 10;

             // Box Total
             checkPageBreak(120);
             const totalBoxY = y - 5;
             doc.rect(leftCol + 280, totalBoxY, 232, 85).fill('#F8F9FA');
             doc.fillColor('#000000');
             
             y += 5;
             doc.fontSize(12).font('Helvetica-Bold').fillColor('#004B93').text('TOTAL TTC', leftCol + 290, y);
             doc.text(`${data.prixTotal.toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });
             
             y += 25;
             doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Dont Acompte (30%) :', leftCol + 290, y);
             doc.text(`${(data.prixTotal * 0.3).toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });
             
             y += 15;
             doc.fontSize(10).font('Helvetica').text('Solde à régler :', leftCol + 290, y);
             doc.text(`${(data.prixTotal * 0.7).toFixed(2)} €`, colTotal, y, { align: 'right', width: colTotalW });

            // --- MENTIONS LÉGALES & SIGNATURE ---
            // Temporarily reduce bottom margin to prevent automatic premature page break
            doc.page.margins.bottom = 10;

            if (y > 700) {
                doc.addPage();
                y = 50;
            } else {
                y = Math.max(570, y + 40);
            }
            
            doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666666');
            doc.text("Ce devis est établi sous réserve de disponibilité au moment de la signature.", leftCol, y);
            doc.text("Le paiement de l'acompte valide définitivement la réservation.", leftCol, y + 12);
            
            y += 40;
            doc.fillColor('#004B93').font('Helvetica-Bold').fontSize(11).text('Bon pour accord', leftCol, y);
            doc.fillColor('#000000').font('Helvetica').fontSize(10);
            doc.text('Date :', leftCol, y + 20);
            doc.text('Signature (précédée de la mention "Lu et approuvé") :', leftCol, y + 40);
            
            doc.rect(leftCol, y + 60, 250, 70).stroke('#CCCCCC');

            // --- PIED DE PAGE ---
            doc.fontSize(8).fillColor('#999999').text('Gîte de la Maladrerie - MUC OMNISPORTS | SIRET: 38820857100025 | Assurance MAIF n° 132 48 45 M', 0, 760, { align: 'center', width: 612 });

            // --- PAGE 2 : CGV ---
            doc.addPage();
            // Restore bottom margin for CGV page
            doc.page.margins.bottom = 50;

            doc.rect(0, 0, 612, 50).fill('#004B93');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('CONDITIONS GÉNÉRALES DE VENTE', 50, 18);
            
            doc.fillColor('#000000');
            doc.font('Helvetica').fontSize(7.5).lineGap(1); // Small lineGap and font size to fit CGV perfectly
            
            try {
                const cgvPath = path.join(__dirname, '../CGV.txt');
                if (fs.existsSync(cgvPath)) {
                    const cgvText = fs.readFileSync(cgvPath, 'utf8');
                    doc.text(cgvText, 50, 75, { align: 'justify', columns: 2, columnGap: 30, width: 512, height: 660 });
                } else {
                    doc.text("Les conditions générales de vente sont disponibles sur demande.", 50, 75);
                }
            } catch (e) {
                doc.text("Erreur lors du chargement des CGV.", 50, 75);
            }

            // Force the CGV page to be immediately after the first page (verso of page 1)
            if (doc._pageBuffer && doc._pageBuffer.length > 1) {
                const cgvPage = doc._pageBuffer.pop();
                doc._pageBuffer.splice(1, 0, cgvPage);
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateDevisPDF };
