const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Synchro des mods d'un serveur : manifeste API -> dossier mods de l'instance.
// - Télécharge uniquement ce qui manque ou dont le sha1 diffère.
// - Supprime les .jar locaux qui ne sont plus dans le manifeste (miroir exact).
// - onProgress({ done, total, filename, phase }) pour la barre du launcher.
async function sha1File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
  return buffer.length;
}

async function syncMods({ apiUrl, serverId, instanceDir, onProgress }) {
  const emit = (info) => { if (typeof onProgress === 'function') { try { onProgress(info); } catch {} } };
  emit({ phase: 'mods-manifest', done: 0, total: 1, filename: '' });

  const res = await fetch(`${apiUrl}/api/servers/${serverId}/mods`);
  if (!res.ok) throw new Error(`Manifeste mods indisponible (HTTP ${res.status}).`);
  const manifest = await res.json();
  const wanted = new Map((manifest.mods || []).map((m) => [m.filename.toLowerCase(), m]));

  const modsDir = path.join(instanceDir, 'mods');
  await fs.promises.mkdir(modsDir, { recursive: true });

  // 1. Nettoie les jars qui ne sont plus dans le pack.
  const local = await fs.promises.readdir(modsDir).catch(() => []);
  for (const file of local) {
    if (!file.toLowerCase().endsWith('.jar')) continue;
    if (!wanted.has(file.toLowerCase())) {
      await fs.promises.unlink(path.join(modsDir, file)).catch(() => {});
    }
  }

  // 2. Télécharge ce qui manque / diffère (comparaison sha1).
  const entries = [...wanted.values()];
  let downloaded = 0;
  for (let i = 0; i < entries.length; i++) {
    const mod = entries[i];
    emit({ phase: 'mods', done: i, total: entries.length, filename: mod.filename });
    const dest = path.join(modsDir, mod.filename);
    let ok = false;
    try {
      if (fs.existsSync(dest) && (await sha1File(dest)) === mod.sha1.toLowerCase()) ok = true;
    } catch {}
    if (!ok) {
      await downloadFile(`${apiUrl}${mod.url}`, dest);
      const check = await sha1File(dest);
      if (check !== mod.sha1.toLowerCase()) {
        throw new Error(`Fichier corrompu après téléchargement : ${mod.filename}. Relance le jeu.`);
      }
      downloaded += 1;
    }
  }
  emit({ phase: 'mods', done: entries.length, total: entries.length, filename: '' });
  return { synced: entries.length, downloaded, modpack_version: manifest.modpack_version };
}

module.exports = { syncMods, sha1File };
