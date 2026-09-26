const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  // role exposé en lecture seule : aucune route n'accepte role en entrée,
  // le tag admin se donne uniquement en SQL direct (owner BDD).
  return { id: row.id, username: row.username, email: row.email, role: row.role || 'user', created_at: row.created_at };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username = '', email = '', password = '' } = req.body || {};
    const u = String(username).trim();
    const e = String(email).trim().toLowerCase();
    const p = String(password);

    if (!USERNAME_RE.test(u)) {
      return res.status(400).json({ error: "Pseudo invalide : 3-16 caractères, lettres/chiffres/_ uniquement." });
    }
    if (!EMAIL_RE.test(e)) {
      return res.status(400).json({ error: "Email invalide." });
    }
    if (p.length < 6 || p.length > 128) {
      return res.status(400).json({ error: "Mot de passe : 6 caractères minimum." });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [u, e]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Pseudo ou email déjà utilisé." });
    }

    const hash = await bcrypt.hash(p, 12);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [u, e, hash]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId]);
    const user = publicUser(rows[0]);
    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier = '', password = '' } = req.body || {};
    const ident = String(identifier).trim();
    const p = String(password);

    if (!ident || !p) {
      return res.status(400).json({ error: "Pseudo/email + mot de passe requis." });
    }

    const isEmail = ident.includes('@');
    const [rows] = await pool.query(
      isEmail ? 'SELECT * FROM users WHERE email = ? LIMIT 1' : 'SELECT * FROM users WHERE username = ? LIMIT 1',
      [isEmail ? ident.toLowerCase() : ident]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: "Identifiants incorrects." });
    }
    const row = rows[0];
    const ok = await bcrypt.compare(p, row.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Identifiants incorrects." });
    }

    const user = publicUser(row);
    const token = signToken(user);
    return res.json({ token, user });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Utilisateur introuvable." });
    return res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
