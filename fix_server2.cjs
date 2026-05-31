const fs = require('fs');
let content = fs.readFileSync('backend/server.js', 'utf8');

const target1 = `    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    
    chambres.forEach(chId => {
      const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalPrixBase / ((totalPersonnes || 1) * nuits);
    const taxeSejourCalculee = totalAdultes * (tarifMoyen * 0.044) * nuits;`;

const target2 = target1.replace(/\n/g, '\r\n');

const newCode = `    let totalAdultes = 0;
    let totalMineurs = 0;
    let totalPrixBase = 0;
    let taxeSejourCalculee = 0;
    
    chambres.forEach(chId => {
      const details = (chambresDetails && chambresDetails[chId]) || { adultes: 0, enfants: 0 };
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.enfants || 0);
      const occupantsCount = nbAdultes + nbMineurs;
      const capacite = CHAMBRES_CAPACITE[chId] || 5;
      const tarifPers = occupantsCount >= capacite ? 22 : 25;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;
      totalPrixBase += occupantsCount * tarifPers * nuits;
      taxeSejourCalculee += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    const tarifMoyen = totalAdultes > 0 ? (taxeSejourCalculee / (totalAdultes * nuits * 0.044)) : 25;`;

if (content.includes(target1)) {
  content = content.replace(target1, newCode);
  console.log("Replaced target1");
} else if (content.includes(target2)) {
  content = content.replace(target2, newCode.replace(/\n/g, '\r\n'));
  console.log("Replaced target2");
} else {
  console.log("Target not found");
}

fs.writeFileSync('backend/server.js', content);
