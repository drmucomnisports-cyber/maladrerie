require('dotenv').config({ path: 'backend/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getOrAssignNumeroFacture(reservationId) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId }
  });
  if (!reservation) return null;
  if (reservation.numeroFacture) return reservation.numeroFacture;

  const estConfirmee = ['RESERVE', 'TERMINE'].includes(reservation.statut) || 
                       ['ACOMPTE_PAYE', 'PAYE'].includes(reservation.statutPaiement);

  if (estConfirmee) {
    const year = new Date(reservation.dateDebut || new Date()).getFullYear();
    
    // Récupérer toutes les factures existantes pour cette année afin de trouver le max
    const existingReservations = await prisma.reservation.findMany({
      where: {
        numeroFacture: { startsWith: `FA-${year}-` }
      },
      select: {
        numeroFacture: true
      }
    });

    let maxSuffix = 0;
    existingReservations.forEach(r => {
      if (r.numeroFacture) {
        const parts = r.numeroFacture.split('-');
        if (parts.length === 3) {
          const suffixNum = parseInt(parts[2], 10);
          if (!isNaN(suffixNum) && suffixNum > maxSuffix) {
            maxSuffix = suffixNum;
          }
        }
      }
    });

    const numeroFacture = `FA-${year}-${String(maxSuffix + 1).padStart(4, '0')}`;
    console.log(`Generated new invoice number: ${numeroFacture} for reservation #${reservationId} (max suffix was ${maxSuffix})`);
    
    // Pour la simulation locale, on va juste retourner le numéro sans faire d'update réel ou on peut faire l'update et restaurer
    // Faisons l'update pour valider que la contrainte d'unicité passe bien !
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { numeroFacture }
    });
    return numeroFacture;
  }
  return null;
}

async function main() {
  try {
    console.log("=== SIMULATION DE L'ENDPOINT /api/admin/reservations ===");
    const reservations = await prisma.reservation.findMany({
      include: { 
        client: true,
        occupants: true,
        missions: {
          include: { intervenant: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 7, 5: 7, 6: 5 };
    
    reservations.sort((a, b) => new Date(a.dateDebut) - new Date(b.dateDebut));
    
    const processedReservations = [];
    for (let r of reservations) {
      const estConfirmee = ['RESERVE', 'TERMINE'].includes(r.statut) || 
                           ['ACOMPTE_PAYE', 'PAYE'].includes(r.statutPaiement);
      if (estConfirmee && !r.numeroFacture) {
        console.log(`Assignation numéro facture pour la résa #${r.id}...`);
        r.numeroFacture = await getOrAssignNumeroFacture(r.id);
      }
      processedReservations.push(r);
    }

    processedReservations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const reservationsWithTaxe = processedReservations.map(r => {
      let taxe = 0;
      if (r.dateDebut && r.dateFin && r.chambres && r.chambres.length > 0) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const detailsSource = r.chambresDetails || {};
        
        r.chambres.forEach(chId => {
          const details = detailsSource[chId] || { adultes: 0, enfants: 0, mineurs: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || details.mineurs || 0);
          const occupants = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupants >= capacite ? 22 : 25;
          taxe += nbAdultes * tarifPers * nuits * 0.044;
        });
      }
      return { ...r, taxeSejour: Math.round(taxe * 100) / 100 };
    });

    console.log("SUCCÈS ! Simulation complétée sans erreur. Réservations traitées :", reservationsWithTaxe.length);

  } catch (err) {
    console.error("ÉCHEC DE LA SIMULATION :", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
