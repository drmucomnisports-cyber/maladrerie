const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const idsToDelete = [27, 28, 29];
  const deleteResult = await prisma.expense.deleteMany({
    where: {
      id: { in: idsToDelete }
    }
  });

  console.log(`Deleted ${deleteResult.count} duplicate expenses.`);
  await prisma.$disconnect();
}

main();
