const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const reservations = await prisma.reservation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { client: true }
    });

    console.log("LAST 15 RESERVATIONS:");
    console.log("--------------------------------------------------------------------------------------------------");
    reservations.forEach(r => {
      console.log(`ID: ${r.id} | Client: ${r.client?.nom} (${r.client?.email})`);
      console.log(`  Statut: ${r.statut} | StatutPaiement: ${r.statutPaiement} | Mode: ${r.modePaiement}`);
      console.log(`  stripeAcompteId: ${r.stripeAcompteId} | stripeSoldeId: ${r.stripeSoldeId}`);
      console.log(`  prixTotal: ${r.prixTotal} | acompte: ${r.montantAcompte} | solde: ${r.montantSolde}`);
      console.log(`  LienPaiementEnvoye: ${r.lienPaiementEnvoye} | CreatedAt: ${r.createdAt}`);
      console.log("--------------------------------------------------------------------------------------------------");
    });
  } catch (err) {
    console.error("Error reading database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
