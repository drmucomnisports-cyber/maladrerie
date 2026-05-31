const fs = require('fs');
const file = 'backend/server.js';
let content = fs.readFileSync(file, 'utf8');

// replace description fields
content = content.replace(/description:\s*`Client: \$\{existingReservation\.client\.nom\}[^`]+`/g, 'description: getStripeDescription(existingReservation)');
content = content.replace(/description:\s*`Client: \$\{devis\.client\.nom\}[^`]+`/g, 'description: getStripeDescription(devis)');
content = content.replace(/description:\s*`Client: \$\{reservation\.client\.nom\}[^`]+`/g, (match) => {
    return match.includes('Ce montant ne sera pas') ? 'description: getStripeDescription(reservation, true)' : 'description: getStripeDescription(reservation)';
});
content = content.replace(/description:\s*`Du \$\{new Date\(reser\.dateDebut\)[^`]+`/g, 'description: getStripeDescription(reser)');

fs.writeFileSync(file, content);
console.log('done');
