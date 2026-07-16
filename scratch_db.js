const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const count = await prisma.reservation.count();
    console.log("Total reservations count:", count);
    const reservations = await prisma.reservation.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { client: true }
    });
    console.log("Reservations:", JSON.stringify(reservations, null, 2));
  } catch (err) {
    console.error("Failed to query database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
