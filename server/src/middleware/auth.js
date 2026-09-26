const jwt = require('jsonwebtoken');
const { pool } = require('../db');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { signToken, authMiddleware, requireAdmin };

// Garde-fou des routes admin : relu EN BDD à chaque appel, jamais le JWT seul.
// Si le owner retire le tag en BDD, l'accès coupe dès la requête suivante,
// sans déconnexion/reconnexion à gérer côté client.
async function requireAdmin(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (rows.length === 0 || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
    }
    next();
  } catch (err) {
    console.error('[requireAdmin]', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
