const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function calculerRevenuRepasServeur(repas) {
  if (!repas) return { total: 0, petitDej: 0, dejeuner: 0, diner: 0 };
  let petitDej = 0;
  let dejeuner = 0;
  let diner = 0;
  Object.values(repas).forEach(day => {
    if (day.PETIT_DEJ) {
      petitDej += (parseInt(day.PETIT_DEJ.ADULTE || 0) * 6);
      petitDej += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_12 || 0) * 5);
      petitDej += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_5 || 0) * 4);
    }
    if (day.DEJEUNER) {
      dejeuner += (parseInt(day.DEJEUNER.ADULTE || 0) * 11.5);
      dejeuner += (parseInt(day.DEJEUNER.ENFANT_MOINS_12 || 0) * 9.5);
      dejeuner += (parseInt(day.DEJEUNER.ENFANT_MOINS_5 || 0) * 8);
    }
    if (day.DINER) {
      diner += (parseInt(day.DINER.ADULTE || 0) * 14); // Note: diner is 14€!
      diner += (parseInt(day.DINER.ENFANT_MOINS_12 || 0) * 12);
      diner += (parseInt(day.DINER.ENFANT_MOINS_5 || 0) * 10);
    }
  });
  return { total: petitDej + dejeuner + diner };
}

function calculerDetailsFinanciersReservation(res) {
  let taxeSejour = 0;
  let totalSalles = 0;
  if (res.dateDebut && res.dateFin) {
    const start = new Date(res.dateDebut);
    const end = new Date(res.dateFin);
    const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    if (nuits > 0) {
      let nbAdultes = 0;
      let nbOccupants = 0;
      if (res.occupants && res.occupants.length > 0) {
        nbAdultes = res.occupants.filter(o => o.estAdulte).length;
        nbOccupants = res.occupants.length;
      } else if (res.chambresDetails && Object.keys(res.chambresDetails).length > 0) {
        Object.values(res.chambresDetails).forEach(room => {
          nbAdultes += parseInt(room.adultes || 0);
          nbOccupants += parseInt(room.adultes || 0) + parseInt(room.enfants || 0);
        });
      }
      if (nbAdultes > 0 && res.chambres && res.chambres.length > 0) {
        const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 7, 5: 7, 6: 5 };
        const tarifPers = (nbOccupants >= res.chambres.length * 4) ? 22 : 25;
        taxeSejour = nbAdultes * tarifPers * nuits * 0.044;
      }
      if (res.salles) {
        let nuitsSalles = nuits;
        if (res.salles.dateDebut && res.salles.dateFin) {
          const startS = new Date(res.salles.dateDebut);
          const endS = new Date(res.salles.dateFin);
          nuitsSalles = Math.max(1, Math.ceil((endS - startS) / (1000 * 60 * 60 * 24)));
        }
        const prixSalle = (res.chambres && res.chambres.length > 0) ? 100 : 150;
        if (res.salles.salle15) totalSalles += prixSalle * nuitsSalles;
        if (res.salles.salle12) totalSalles += prixSalle * nuitsSalles;
      }
    }
  }
  return {
    taxeSejour: Math.round(taxeSejour * 100) / 100,
    totalSalles: Math.round(totalSalles * 100) / 100
  };
}

async function main() {
  const r = await prisma.reservation.findUnique({
    where: { id: 115 },
    include: { occupants: true }
  });

  const { total: totalRepas } = calculerRevenuRepasServeur(r.repas);
  const { taxeSejour, totalSalles } = calculerDetailsFinanciersReservation(r);
  
  let montantPaye = 0;
  if (r.statutPaiement === 'PAYE') {
    montantPaye = r.prixTotal || 0;
  } else if (r.statutPaiement === 'SOLDE_PAYE') {
    montantPaye = r.montantSolde || 0;
  } else {
    montantPaye = r.montantAcompte || 0;
  }
  
  let partRestaurationEncaissee = 0;
  let partSallesEncaissee = 0;
  let partTaxeEncaissee = 0;
  let partHebergementEncaissee = 0;

  const totalTheoriqueApresRepas = Math.max(0, (r.prixTotal || 0) - totalRepas);
  const hebergementTheorique = Math.max(0, totalTheoriqueApresRepas - totalSalles - taxeSejour);

  if (r.statutPaiement === 'PAYE') {
    partRestaurationEncaissee = totalRepas;
    partSallesEncaissee = totalSalles;
    partTaxeEncaissee = taxeSejour;
    partHebergementEncaissee = hebergementTheorique;
  } else if (r.statutPaiement === 'SOLDE_PAYE') {
    if (r.prixTotal > 0) {
      const ratio = (r.montantSolde || 0) / r.prixTotal;
      partRestaurationEncaissee = Math.round(totalRepas * ratio * 100) / 100;
      partSallesEncaissee = Math.round(totalSalles * ratio * 100) / 100;
      partTaxeEncaissee = Math.round(taxeSejour * ratio * 100) / 100;
      partHebergementEncaissee = Math.round(hebergementTheorique * ratio * 100) / 100;
    }
  } else { // ACOMPTE_PAYE
    partRestaurationEncaissee = Math.min(montantPaye, totalRepas);
    const resteAcompte = Math.max(0, montantPaye - partRestaurationEncaissee);
    if (totalTheoriqueApresRepas > 0) {
        const ratio = resteAcompte / totalTheoriqueApresRepas;
        partSallesEncaissee = Math.round(totalSalles * ratio * 100) / 100;
        partTaxeEncaissee = Math.round(taxeSejour * ratio * 100) / 100;
        partHebergementEncaissee = Math.max(0, resteAcompte - partSallesEncaissee - partTaxeEncaissee);
    }
  }

  console.log("EXACT API VALUES:");
  console.log(`- partRestaurationEncaissee: ${partRestaurationEncaissee}`);
  console.log(`- partHebergementEncaissee: ${partHebergementEncaissee}`);
  console.log(`- partTaxeEncaissee: ${partTaxeEncaissee}`);
  console.log(`- totalRepas: ${totalRepas}`);
  console.log(`- taxeSejour: ${taxeSejour}`);
  console.log(`- totalSalles: ${totalSalles}`);
  console.log(`- prixTotal: ${r.prixTotal}`);
  console.log(`- montantPaye: ${montantPaye}`);

  await prisma.$disconnect();
}

main();
