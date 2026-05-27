const fs = require('fs');

let data = fs.readFileSync('backend/server.js', 'utf8');

data = data.replace(
  /name: 'Acompte \(30% [^]+? \+ 100% Repas\) - S[^]+?jour G[^]+?te de La Maladrerie'/g,
  (match) => {
    return `name: (devis ? calculerTotalRepasServeur(devis.repas) : (typeof reservation !== 'undefined' ? calculerTotalRepasServeur(reservation.repas) : 0)) > 0 ? 'Acompte (30% Hébergement + 100% Repas) - Séjour Gîte de La Maladrerie' : 'Acompte (30% Hébergement) - Séjour Gîte de La Maladrerie'`;
  }
);

data = data.replace(
  /typeAttendu: r.statutPaiement === 'EN_ATTENTE' \? 'Acompte \(30% [^]+? \+ 100% Repas\)' : 'SOLDE \(70%\)'/g,
  `typeAttendu: r.statutPaiement === 'EN_ATTENTE' ? (calculerTotalRepasServeur(r.repas) > 0 ? 'Acompte (30% Hébergement + 100% Repas)' : 'Acompte (30% Hébergement)') : 'SOLDE (70%)'`
);

data = data.replace(
  /<p>Pour finaliser votre r[^]+?servation, veuillez proc[^]+?der au paiement de l'Acompte \(30% [^]+? \+ 100% Repas\)\.<\/p>/g,
  `<p>Pour finaliser votre réservation, veuillez procéder au paiement de l'Acompte \${calculerTotalRepasServeur(reservation.repas) > 0 ? '(30% Hébergement + 100% Repas)' : '(30% Hébergement)'}.</p>`
);

fs.writeFileSync('backend/server.js', data, 'utf8');
console.log('Done!');
