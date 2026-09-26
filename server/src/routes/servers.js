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

module.exports = router;
