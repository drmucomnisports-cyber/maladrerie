const fs = require('fs');
let content = fs.readFileSync('backend/server.js', 'utf8');

const target1 = `    });\n    res.json(reservations);\n  } catch (error) {`;
const target2 = `    });\r\n    res.json(reservations);\r\n  } catch (error) {`;

const newCode = `    });
    
    const CHAMBRES_CAPACITE = { 1: 5, 2: 6, 3: 6, 4: 8, 5: 6, 6: 5 };
    const reservationsWithTaxe = reservations.map(r => {
      let taxe = 0;
      if (r.dateDebut && r.dateFin && r.chambres && r.chambres.length > 0) {
        const start = new Date(r.dateDebut);
        const end = new Date(r.dateFin);
        const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const detailsSource = r.chambresDetails || {};
        
        r.chambres.forEach(chId => {
          const details = detailsSource[chId] || { adultes: 0, enfants: 0, mineurs: 0 };
          const nbAdultes = parseInt(details.adultes || 0);
          const nbMineurs = parseInt(details.enfants || details.mineurs || 0);
          const occupants = nbAdultes + nbMineurs;
          const capacite = CHAMBRES_CAPACITE[chId] || 5;
          const tarifPers = occupants >= capacite ? 22 : 25;
          taxe += nbAdultes * tarifPers * nuits * 0.044;
        });
      }
      return { ...r, taxeSejour: Math.round(taxe * 100) / 100 };
    });
    
    res.json(reservationsWithTaxe);
  } catch (error) {`;

if (content.includes(target1)) {
  content = content.replace(target1, newCode);
  console.log("Replaced target1");
} else if (content.includes(target2)) {
  content = content.replace(target2, newCode);
  console.log("Replaced target2");
} else {
  console.log("Target not found");
}

fs.writeFileSync('backend/server.js', content);
