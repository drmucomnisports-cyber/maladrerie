const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Find all reservations paid in full via a single Stripe transaction (or totality payment)
    const reservations = await prisma.reservation.findMany({
      where: {
        statutPaiement: 'PAYE',
        stripeAcompteId: null,
        stripeSoldeId: { not: null },
        prixTotal: { not: null }
      },
      include: { client: true }
    });

    console.log(`Found ${reservations.length} reservations to correct:`);
    for (const r of reservations) {
      if (r.montantAcompte !== 0) {
        console.log(`Updating ID: ${r.id} | Client: ${r.client?.nom}`);
        console.log(`  Before -> acompte: ${r.montantAcompte}, solde: ${r.montantSolde}`);
        
        await prisma.reservation.update({
          where: { id: r.id },
          data: {
            montantAcompte: 0,
            montantSolde: r.prixTotal
          }
        });

        console.log(`  After -> acompte: 0, solde: ${r.prixTotal}`);
      }
    }
    console.log("Database correction finished successfully!");
  } catch (err) {
    console.error("Error updating database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
