const express = require('express');
const path = require('path');
const multer = require('multer');
const unzipper = require('unzipper');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { sha1Of, assertValidJar, saveIfMissing, cleanupOrphanFiles, maxUploadBytes } = require('../files');

const router = express.Router();

// Upload drag-drop : .zip (modpack, jars extraits même en sous-dossiers) et .jar seuls.
// Mémoire vive (pas de fichier temp) + taille max via MAX_MOD_MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes(), files: 5 },
  fileFilter: (req, file, cb) => {
    const n = String(file.originalname || '').toLowerCase();
    if (n.endsWith('.zip') || n.endsWith('.jar')) return cb(null, true);
    cb(new Error('Seuls les fichiers .zip et .jar sont acceptés.'));
  }
});

// Toutes les routes ici exigent : token jeu valide + tag admin relu en BDD.
// GET /api/admin/users — liste des joueurs (lecture seule, jamais les hash).
router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY id DESC LIMIT 500'
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('[admin/users]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ---------- Serveurs de jeu (CRUD admin) ----------

const MC_VERSION_RE = /^[0-9]+\.[0-9]+(\.[0-9]+)?(-[\w.]+)?$/;
const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,253}[a-zA-Z0-9])?(:\d+)?$/;

function validateServerInput(body) {
  const name = String(body.name || '').trim();
  const ip = String(body.ip || '').trim();
  const port = body.port === undefined || body.port === '' ? 25565 : Number(body.port);
  const mc_version = String(body.mc_version || '').trim();
  const loader = String(body.loader || 'vanilla').trim().toLowerCase();
  const loader_version = body.loader_version === undefined || body.loader_version === null || body.loader_version === ''
    ? null
    : String(body.loader_version).trim();

  if (name.length < 1 || name.length > 64) return { error: 'Nom : 1-64 caractères.' };
  if (!HOST_RE.test(ip) || ip.length > 255) return { error: 'IP/host invalide (ex : play.monserveur.fr ou 1.2.3.4).' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'Port : 1-65535.' };
  if (!MC_VERSION_RE.test(mc_version) || mc_version.length > 16) return { error: 'Version MC invalide (ex : 1.20.1).' };
  if (loader !== 'vanilla' && loader !== 'forge') return { error: "Loader : 'vanilla' ou 'forge'." };
  if (loader === 'vanilla' && loader_version) return { error: 'Pas de version de loader en vanilla.' };
  if (loader_version && loader_version.length > 32) return { error: 'Version loader : 32 caractères max.' };
  return { value: { name, ip, port, mc_version, loader, loader_version } };
}

// POST /api/admin/servers — créer un serveur (modpack_version démarre à 1).
router.post('/servers', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const checked = validateServerInput(req.body || {});
    if (checked.error) return res.status(400).json({ error: checked.error });
    const v = checked.value;
    const [result] = await pool.query(
      'INSERT INTO servers (name, ip, port, mc_version, loader, loader_version) VALUES (?, ?, ?, ?, ?, ?)',
      [v.name, v.ip, v.port, v.mc_version, v.loader, v.loader_version]
    );
    const [rows] = await pool.query('SELECT * FROM servers WHERE id = ? LIMIT 1', [result.insertId]);
    return res.status(201).json({ server: { ...rows[0], mod_count: 0 } });
  } catch (err) {
    console.error('[admin/servers/create]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/admin/servers/:id — modifier (champs partiels acceptés, modpack_version inchangé).
router.put('/servers/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID serveur invalide.' });
    }
    const [existing] = await pool.query('SELECT * FROM servers WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Serveur introuvable.' });
    }
    const merged = {
      name: req.body.name !== undefined ? req.body.name : existing[0].name,
      ip: req.body.ip !== undefined ? req.body.ip : existing[0].ip,
      port: req.body.port !== undefined ? req.body.port : existing[0].port,
      mc_version: req.body.mc_version !== undefined ? req.body.mc_version : existing[0].mc_version,
      loader: req.body.loader !== undefined ? req.body.loader : existing[0].loader,
      loader_version: req.body.loader_version !== undefined ? req.body.loader_version : existing[0].loader_version
    };
    const checked = validateServerInput(merged);
    if (checked.error) return res.status(400).json({ error: checked.error });
    const v = checked.value;
    await pool.query(
      'UPDATE servers SET name = ?, ip = ?, port = ?, mc_version = ?, loader = ?, loader_version = ? WHERE id = ?',
      [v.name, v.ip, v.port, v.mc_version, v.loader, v.loader_version, id]
    );
    const [rows] = await pool.query('SELECT * FROM servers WHERE id = ? LIMIT 1', [id]);
    const [[count]] = await pool.query('SELECT COUNT(*) AS mod_count FROM mods WHERE server_id = ?', [id]);
    return res.json({ server: { ...rows[0], mod_count: count.mod_count } });
  } catch (err) {
    console.error('[admin/servers/update]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/admin/servers/:id — supprime (mods BDD en cascade, fichiers orphelins nettoyés).
router.delete('/servers/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID serveur invalide.' });
    }
    const [mods] = await pool.query('SELECT sha1 FROM mods WHERE server_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM servers WHERE id = ? LIMIT 1', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Serveur introuvable.' });
    }
    await cleanupOrphanFiles(pool, mods.map((m) => m.sha1));
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin/servers/delete]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ---------- Mods (upload / suppression, tag admin) ----------

async function bumpModpackVersion(serverId) {
  await pool.query('UPDATE servers SET modpack_version = modpack_version + 1 WHERE id = ? LIMIT 1', [serverId]);
  const [[row]] = await pool.query('SELECT modpack_version FROM servers WHERE id = ? LIMIT 1', [serverId]);
  return row.modpack_version;
}

// POST /api/admin/servers/:id/mods — upload drag-drop (champ "mods", max 5 fichiers).
// Accepte .zip (extrait tous les .jar, même en sous-dossiers) et .jar seuls.
// Même jar déjà présent sur ce serveur = ignoré (compté en skipped).
router.post(
  '/servers/:id/mods',
  authMiddleware,
  requireAdmin,
  (req, res, next) => upload.array('mods', 5)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Fichier trop gros (max ${process.env.MAX_MOD_MB || 512} Mo).` });
      }
      return res.status(400).json({ error: err.message || 'Upload invalide.' });
    }
    next();
  }),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID serveur invalide.' });
      }
      const [srv] = await pool.query('SELECT id FROM servers WHERE id = ? LIMIT 1', [id]);
      if (srv.length === 0) {
        return res.status(404).json({ error: 'Serveur introuvable.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Aucun fichier reçu (champ "mods").' });
      }

      // 1. Collecte les jars (directs + extraits des zips).
      const jars = [];
      for (const file of req.files) {
        const lower = String(file.originalname || '').toLowerCase();
        if (lower.endsWith('.jar')) {
          jars.push({ buffer: file.buffer, filename: path.basename(file.originalname) });
        } else if (lower.endsWith('.zip')) {
          let directory;
          try {
            directory = await unzipper.Open.buffer(file.buffer);
          } catch {
            return res.status(400).json({ error: `Zip illisible : ${file.originalname}.` });
          }
          for (const entry of directory.files) {
            if (entry.type !== 'File') continue;
            if (!entry.path.toLowerCase().endsWith('.jar')) continue;
            jars.push({ buffer: await entry.buffer(), filename: path.basename(entry.path) });
          }
        }
      }
      if (jars.length === 0) {
        return res.status(400).json({ error: 'Aucun .jar trouvé dans l’upload.' });
      }

      // 2. Valide + stocke (dédupliqué par sha1) + enregistre en BDD.
      const added = [];
      let skipped = 0;
      for (const jar of jars) {
        try {
          assertValidJar(jar.buffer, jar.filename);
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }
        const sha1 = sha1Of(jar.buffer);
        const [dup] = await pool.query(
          'SELECT id FROM mods WHERE server_id = ? AND sha1 = ? LIMIT 1',
          [id, sha1]
        );
        if (dup.length > 0) {
          skipped += 1;
          continue;
        }
        saveIfMissing(sha1, jar.buffer);
        const name = path.basename(jar.filename, '.jar').slice(0, 128) || jar.filename.slice(0, 128);
        const [result] = await pool.query(
          'INSERT INTO mods (server_id, name, filename, sha1, size) VALUES (?, ?, ?, ?, ?)',
          [id, name, jar.filename.slice(0, 255), sha1, jar.buffer.length]
        );
        added.push({ id: result.insertId, name, filename: jar.filename, sha1, size: jar.buffer.length });
      }

      const modpack_version = await bumpModpackVersion(id);
      return res.status(201).json({ modpack_version, added, skipped });
    } catch (err) {
      console.error('[admin/mods/upload]', err);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }
);

// DELETE /api/admin/mods/:modId — retire un mod (fichier supprimé si plus utilisé ailleurs).
router.delete('/mods/:modId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const modId = Number(req.params.modId);
    if (!Number.isInteger(modId) || modId <= 0) {
      return res.status(400).json({ error: 'ID mod invalide.' });
    }
    const [rows] = await pool.query('SELECT * FROM mods WHERE id = ? LIMIT 1', [modId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Mod introuvable.' });
    }
    const mod = rows[0];
    await pool.query('DELETE FROM mods WHERE id = ? LIMIT 1', [modId]);
    const modpack_version = await bumpModpackVersion(mod.server_id);
    await cleanupOrphanFiles(pool, [mod.sha1]);
    return res.json({ ok: true, modpack_version });
  } catch (err) {
    console.error('[admin/mods/delete]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
