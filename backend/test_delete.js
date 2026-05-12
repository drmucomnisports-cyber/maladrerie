const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.reservation.delete({ where: { id: 2 } });
    console.log("Success");
  } catch (e) {
    console.error("Prisma error:", e);
  }
}
test().catch(console.error).finally(() => prisma.$disconnect());
