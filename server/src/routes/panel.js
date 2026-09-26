const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

// Token panel : scope dédié + durée courte. Un token jeu est refusé ici et inversement.
function signPanelToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, scope: 'panel' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Vérifie le token ET que le compte existe toujours en BDD (panel_users).
async function panelAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non connecté.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== 'panel') {
      return res.status(403).json({ error: 'Token invalide pour le panel.' });
    }
    const [rows] = await pool.query(
      'SELECT id, username, created_at FROM panel_users WHERE id = ? LIMIT 1',
      [decoded.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Compte panel introuvable.' });
    }
    req.panelUser = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée. Reconnecte-toi.' });
  }
}

// POST /api/panel/login — pas de /register : compte unique créé via .env au boot.
router.post('/login', async (req, res) => {
  try {
    const { username = '', password = '' } = req.body || {};
    const [rows] = await pool.query(
      'SELECT * FROM panel_users WHERE username = ? LIMIT 1',
      [String(username).trim()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    const ok = await bcrypt.compare(String(password), rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    const user = { id: rows[0].id, username: rows[0].username, created_at: rows[0].created_at };
    return res.json({ token: signPanelToken(user), user });
  } catch (err) {
    console.error('[panel/login]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/panel/me
router.get('/me', panelAuth, (req, res) => {
  return res.json({ user: req.panelUser });
});

// GET /api/panel/users — liste des joueurs (lecture seule, jamais les hash).
router.get('/users', panelAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY id DESC LIMIT 500'
    );
    return res.json({ users: rows });
  } catch (err) {
    console.error('[panel/users]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
