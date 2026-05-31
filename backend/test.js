const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const promos = await prisma.promoCode.findMany();
  console.log(JSON.stringify(promos, null, 2));
}

main().finally(() => prisma.$disconnect());
