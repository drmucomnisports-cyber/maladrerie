const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const r = await prisma.reservation.findUnique({
      where: { id: 96 },
      include: { client: true, occupants: true }
    });
    console.log("RESERVATION 96 DETAILS:");
    console.log(JSON.stringify(r, null, 2));
  } catch (err) {
    console.error("Error reading database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
