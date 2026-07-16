const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const missions = await prisma.mission.findMany({
      include: {
        intervenant: true,
        reservation: true
      }
    });
    console.log("Total missions found:", missions.length);
    missions.forEach(m => {
      console.log(`Mission ID: ${m.id}`);
      console.log(`  Type: ${m.typeMission}`);
      console.log(`  Montant: ${m.montant} €`);
      console.log(`  Statut: ${m.statut}`);
      console.log(`  Intervenant: ${m.intervenant.prenom} ${m.intervenant.nom} (Statut: ${m.intervenant.statut}, Email: ${m.intervenant.email})`);
      console.log(`  Reservation ID: ${m.reservationId} (Dates: ${m.reservation?.dateDebut} to ${m.reservation?.dateFin})`);
      console.log("-----------------------------------------");
    });
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

check();
