require('dotenv').config({ path: 'backend/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const list = await prisma.reservation.findMany({
      where: {
        numeroFacture: { startsWith: "FA-2026-" }
      },
      select: {
        id: true,
        numeroFacture: true,
        statut: true,
        statutPaiement: true,
        dateDebut: true
      },
      orderBy: {
        numeroFacture: 'asc'
      }
    });
    console.log("Existing 2026 invoices:", list);
    console.log("Count:", list.length);
  } catch (err) {
    console.error("Failed to query database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
