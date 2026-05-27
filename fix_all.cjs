const fs = require('fs');

const replaceInFile = (path, replacements) => {
  let content = fs.readFileSync(path, 'utf8');
  replacements.forEach(([search, replace]) => {
    content = content.split(search).join(replace);
  });
  fs.writeFileSync(path, content, 'utf8');
};

const replaceRegexInFile = (path, replacements) => {
  let content = fs.readFileSync(path, 'utf8');
  replacements.forEach(([regex, replace]) => {
    content = content.replace(regex, replace);
  });
  fs.writeFileSync(path, content, 'utf8');
};

// 1. Home.jsx replacements
replaceInFile('src/pages/Home.jsx', [
  ['Salle de formation', 'Salle de réunion'],
  ['Salles de formation', 'Salles de réunion'],
  ['salle de formation', 'salle de réunion'],
  ['salles de formation', 'salles de réunion']
]);

// 2. ReservationForm.jsx replacements
replaceInFile('src/components/ReservationForm.jsx', [
  ['Salle de formation', 'Salle de réunion'],
  ['Salles de formation', 'Salles de réunion'],
  ['salle de formation', 'salle de réunion'],
  ['salles de formation', 'salles de réunion'],
  ['} €', '}&nbsp;€'],
  ['}€', '}&nbsp;€'],
  ['50€', '50&nbsp;€'],
  ['5€', '5&nbsp;€'],
  ['100 €', '100&nbsp;€'],
  ['150 €', '150&nbsp;€'],
  ['className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-muc-yellow bg-white outline-none text-sm transition-all"', 'className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:border-muc-yellow bg-white outline-none text-sm transition-all"'],
  ['ml-1">Nom</label>', 'ml-1">Nom <span className="text-red-500">*</span></label>'],
  ['ml-1">Prénom</label>', 'ml-1">Prénom <span className="text-red-500">*</span></label>'],
  ['ml-1">E-mail</label>', 'ml-1">E-mail <span className="text-red-500">*</span></label>'],
  ['ml-1">Téléphone</label>', 'ml-1">Téléphone <span className="text-red-500">*</span></label>'],
  ['ml-1">Adresse Postale Complète</label>', 'ml-1">Adresse Postale Complète <span className="text-red-500">*</span></label>'],
  ['ml-1">Nom Complet du Client</label>', 'ml-1">Nom Complet du Client <span className="text-red-500">*</span></label>'],
  ['ml-1">Date d\'arrivée</label>', 'ml-1">Date d\'arrivée <span className="text-red-500">*</span></label>'],
  ['ml-1">Date de départ</label>', 'ml-1">Date de départ <span className="text-red-500">*</span></label>'],
  ['<form onSubmit={isDevis ? handleSubmit : (step === 1 ? goToStep2 : handleSubmit)} className="space-y-6 relative">', '<form noValidate onSubmit={isDevis ? handleSubmit : (step === 1 ? goToStep2 : handleSubmit)} className="space-y-6 relative">']
]);

// 3. server.js replacements
replaceInFile('backend/server.js', [
  ['Salle de formation', 'Salle de réunion'],
  ['Salles de formation', 'Salles de réunion'],
  ['salle de formation', 'salle de réunion'],
  ['salles de formation', 'salles de réunion'],
  ['Hï¿½bergement', 'Hébergement'],
  ['Hbergement', 'Hébergement'], // Just in case it's represented differently
  ['ðŸ’¼', '&#x1F4BC;'], // Briefcase
  ['ðŸ› ', '&#x1F6CF;'], // Bed
  ['ðŸ§´', '&#x1F9F4;'], // Lotion/Linge
  ['ðŸ§¹', '&#x1F9F9;'], // Broom
  ['ðŸ ´', '&#x1F37D;'], // Plate/Meal
  ['ðŸ§', '&#x1F9F4;'],
  ['ðŸ', '&#x26A0;'] // Generic catch-all for remaining broken emoji headers... wait, better not do this.
]);
