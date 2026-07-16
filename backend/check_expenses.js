const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: { date: 'desc' }
    });
    console.log("Total expenses found:", expenses.length);
    expenses.forEach(e => {
      console.log(`Expense ID: ${e.id}`);
      console.log(`  Label: ${e.label}`);
      console.log(`  Montant: ${e.montant} €`);
      console.log(`  PCG: ${e.comptePcg}`);
      console.log(`  Catégorie: ${e.categorie}`);
      console.log(`  Date: ${e.date}`);
      console.log("-----------------------------------------");
    });
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

check();
