const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const id = 39; // the reservation ID from our query
    const mode = 'ESPECES';
    const typePaiement = 'ACOMPTE';
    
    const data = {
      modePaiement: mode,
      statutPaiement: typePaiement === 'ACOMPTE' ? 'ACOMPTE_PAYE' : 'PAYE'
    };
    
    const reservation = await prisma.reservation.update({
      where: { id: parseInt(id) },
      data
    });
    console.log("Prisma update success:", reservation);
  } catch (err) {
    console.error("Prisma update failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
