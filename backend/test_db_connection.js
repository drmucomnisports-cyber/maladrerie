const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.reservation.count();
    console.log("Database connection successful. Reservation count:", count);
  } catch (e) {
    console.error("Database connection failed:", e);
  }
}
test().catch(console.error).finally(() => prisma.$disconnect());
