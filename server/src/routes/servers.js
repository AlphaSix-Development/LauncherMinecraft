const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Liste publique des serveurs (avec nombre de mods). Pas de hash exposé ici.
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, COUNT(m.id) AS mod_count
      FROM servers s
      LEFT JOIN mods m ON m.server_id = s.id
      GROUP BY s.id
      ORDER BY s.id ASC
    `);
    return res.json({ servers: rows });
  } catch (err) {
    console.error('[servers/list]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Détail public d'un serveur (sans la liste des mods : voir /:id/mods en P2).
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID serveur invalide.' });
    }
    const [rows] = await pool.query('SELECT * FROM servers WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Serveur introuvable.' });
    }
    const [[count]] = await pool.query('SELECT COUNT(*) AS mod_count FROM mods WHERE server_id = ?', [id]);
    return res.json({ server: { ...rows[0], mod_count: count.mod_count } });
  } catch (err) {
    console.error('[servers/detail]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Manifeste public des mods d'un serveur (utilisé par le launcher pour la synchro).
// Chaque entrée a sha1 + url : le launcher ne télécharge que ce qui manque/change.
router.get('/:id/mods', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID serveur invalide.' });
    }
    const [srv] = await pool.query('SELECT id, modpack_version FROM servers WHERE id = ? LIMIT 1', [id]);
    if (srv.length === 0) {
      return res.status(404).json({ error: 'Serveur introuvable.' });
    }
    const [rows] = await pool.query(
      'SELECT id, name, filename, sha1, size, created_at FROM mods WHERE server_id = ? ORDER BY name ASC',
      [id]
    );
    return res.json({
      server_id: id,
      modpack_version: srv[0].modpack_version,
      mods: rows.map((m) => ({ ...m, url: `/api/files/${m.sha1}` }))
    });
  } catch (err) {
    console.error('[servers/mods]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
