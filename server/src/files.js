const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Stockage fichiers mods : adressé par contenu (sha1). Un même jar sur
// plusieurs serveurs = 1 seul fichier sur disque (dédupliqué).
// Prod Docker : /app/files via le volume mods_data (voir docker-compose.yml).
const FILES_DIR = process.env.FILES_DIR || path.join(__dirname, '..', 'files');

function ensureFilesDir() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function sha1Of(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function filePathFor(sha1) {
  return path.join(FILES_DIR, `${sha1}.jar`);
}

// Vérif minimale d'un jar : signature ZIP (PK\x03\x04) + taille > 0.
// (Pas de scan antivirus en V1 : n'uploader que des sources de confiance.)
function assertValidJar(buffer, filename) {
  if (!buffer || buffer.length < 4) throw new Error(`Fichier vide : ${filename}.`);
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(`Pas un .jar valide : ${filename}.`);
  }
}

function saveIfMissing(sha1, buffer) {
  ensureFilesDir();
  const p = filePathFor(sha1);
  if (!fs.existsSync(p)) fs.writeFileSync(p, buffer);
  return p;
}

// Supprime les fichiers dont le sha1 n'est plus référencé par aucun mod.
async function cleanupOrphanFiles(pool, sha1List) {
  ensureFilesDir();
  for (const sha1 of [...new Set(sha1List)]) {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM mods WHERE sha1 = ?', [sha1]);
    if (rows[0].n === 0) {
      try { fs.unlinkSync(filePathFor(sha1)); } catch {}
    }
  }
}

function maxUploadBytes() {
  const mb = Number(process.env.MAX_MOD_MB || 512);
  return (Number.isFinite(mb) && mb > 0 ? mb : 512) * 1024 * 1024;
}

module.exports = { FILES_DIR, ensureFilesDir, sha1Of, filePathFor, assertValidJar, saveIfMissing, cleanupOrphanFiles, maxUploadBytes };
