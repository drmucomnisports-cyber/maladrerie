const fs = require('fs');
const file = 'backend/server.js';
let content = fs.readFileSync(file, 'utf8');

// Update text in helper
content = content.replace('Dont taxe de séjour incluse :', 'Taxe de séjour incluse dans le prix total :');

// Add billing_address_collection: 'required' to all mode: 'payment'
content = content.replace(/mode: 'payment',/g, 'mode: \'payment\',\n        billing_address_collection: \'required\',');

fs.writeFileSync(file, content);
console.log('done');
