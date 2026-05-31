const fs = require('fs');
let content = fs.readFileSync('backend/server.js', 'utf8');

// 1. Revert calendar endpoint
const badCode = `    });
    
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

const goodCodeCalendar = `    });\n    res.json(reservations);\n  } catch (error) {`;

content = content.replace(badCode, goodCodeCalendar);
content = content.replace(badCode.replace(/\n/g, '\r\n'), goodCodeCalendar.replace(/\n/g, '\r\n'));

// 2. Add to admin reservations endpoint
// The admin reservations endpoint has:
//     });
//     res.json(reservations);
//   } catch (error) {
// but it's preceded by:
//       orderBy: { createdAt: 'desc' }
//     });

const targetAdmin = `      orderBy: { createdAt: 'desc' }
    });
    res.json(reservations);
  } catch (error) {`;

const targetAdminCRLF = targetAdmin.replace(/\n/g, '\r\n');

const newAdminCode = `      orderBy: { createdAt: 'desc' }
    });

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

if (content.includes(targetAdmin)) {
  content = content.replace(targetAdmin, newAdminCode);
} else if (content.includes(targetAdminCRLF)) {
  content = content.replace(targetAdminCRLF, newAdminCode.replace(/\n/g, '\r\n'));
}

fs.writeFileSync('backend/server.js', content);
console.log('Fixed server.js');
