const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;
