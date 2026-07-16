const ADMIN_EMAIL = "david.roujet@mucomnisports.fr";
const ADMIN_PASSWORD = "Ebon195Gmusic!";
const BASE_URL = "https://www.gite-maladrerie.fr";

async function verify() {
  try {
    console.log("Logging into production admin...");
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText}`);
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Logged in successfully. Token received.");
    
    console.log("Fetching finances...");
    const financesRes = await fetch(`${BASE_URL}/api/admin/finances`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!financesRes.ok) {
      throw new Error(`Finances fetch failed: ${financesRes.status} ${financesRes.statusText}`);
    }
    
    const finances = await financesRes.json();
    console.log("Finances data received successfully.");
    console.log("Checking for missionsDetails in payload...");
    
    if (finances.missionsDetails && Array.isArray(finances.missionsDetails)) {
      console.log(`Success! Found ${finances.missionsDetails.length} missions in missionsDetails.`);
      const ndsMissions = finances.missionsDetails.filter(m => m.intervenant === "Nicolas Da Silva");
      console.log(`Nicolas Da Silva has ${ndsMissions.length} missions.`);
      let totalNds = 0;
      ndsMissions.forEach(m => {
        console.log(`  - Type: ${m.typeMission}, Montant: ${m.montant} €, Statut: ${m.statut}, Réf: Résa #${m.reservationId}`);
        totalNds += m.montant;
      });
      console.log(`Total for Nicolas Da Silva: ${totalNds} €`);
    } else {
      console.error("FAIL: missionsDetails is missing or not an array!");
    }
  } catch (error) {
    console.error("Error during verification:", error);
  }
}

verify();
