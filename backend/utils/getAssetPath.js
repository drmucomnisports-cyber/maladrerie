const path = require('path');
const fs = require('fs');

/**
 * Résout le chemin absolu d'un fichier asset (ex: CGV, logo), 
 * que l'on soit en exécution locale, ou sur l'environnement serverless Vercel.
 * @param {string} filename - Le nom du fichier (ex: 'logo-muc.jpg', 'CGV - Gite de la Maladrerie.pdf')
 * @returns {string|null} - Le chemin absolu, ou null si introuvable
 */
const getAssetPath = (filename) => {
    const cwd = process.cwd();
    
    // 1. Exécution sur Vercel (la fonction /api/index.js se trouve souvent dans un root où /backend est préservé)
    const pathVercel = path.join(cwd, 'backend', 'assets', filename);
    if (fs.existsSync(pathVercel)) return pathVercel;
    
    // 2. Exécution locale classique (depuis la racine du projet ou si Vercel met les assets à la racine)
    const pathLocal = path.join(cwd, 'assets', filename);
    if (fs.existsSync(pathLocal)) return pathLocal;
    
    // 3. Fallback robuste basé sur le dossier actuel (au cas où la structure est altérée)
    // __dirname pointe vers backend/utils, on remonte d'un cran
    const pathFallback = path.join(__dirname, '..', 'assets', filename);
    if (fs.existsSync(pathFallback)) return pathFallback;

    // 4. Cas particulier : recherche à la racine même du projet (pour des fichiers comme CGV.txt s'ils n'ont pas été bougés)
    const pathRootFallback = path.join(cwd, filename);
    if (fs.existsSync(pathRootFallback)) return pathRootFallback;

    return null;
};

module.exports = getAssetPath;
