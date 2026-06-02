const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.adminAccount.findMany();
  console.log("Database admins:", admins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
