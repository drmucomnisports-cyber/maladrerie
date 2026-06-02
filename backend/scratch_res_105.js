const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const r = await prisma.reservation.findUnique({
      where: { id: 105 },
      include: { client: true, occupants: true }
    });
    console.log("RESERVATION 105 DETAILS:");
    console.log(JSON.stringify(r, null, 2));
  } catch (err) {
    console.error("Error reading database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
