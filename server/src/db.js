const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'launcher_minecraft',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

async function initDb(retries = 15) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      // Crée la table si elle n'existe pas (pratique si schema.sql non exécuté)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(16) NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ensurePanelAdmin(conn);
      conn.release();
      console.log('[DB] MySQL connecté + table users OK');
      return;
    } catch (err) {
      console.log(`[DB] tentative ${i}/${retries} échouée (${err.code || err.message}), retry dans 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.error('[DB] Impossible de se connecter à MySQL après plusieurs tentatives.');
  process.exit(1);
}

// Table séparée pour le panel web admin (isolée des comptes jeu).
// Le compte admin est créé au boot depuis PANEL_ADMIN_USER / PANEL_ADMIN_PASSWORD.
// Il n'existe AUCUNE route d'inscription panel : impossible de créer
// d'autres comptes que via le .env (toi seul y as accès).
async function ensurePanelAdmin(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS panel_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const adminUser = (process.env.PANEL_ADMIN_USER || '').trim();
  const adminPass = process.env.PANEL_ADMIN_PASSWORD || '';
  if (!adminUser || !adminPass) {
    console.log('[DB] PANEL_ADMIN_USER/PASSWORD non définis : aucun compte panel créé');
    return;
  }
  const [rows] = await conn.query('SELECT id FROM panel_users WHERE username = ? LIMIT 1', [adminUser]);
  if (rows.length > 0) return;
  const hash = await bcrypt.hash(adminPass, 12);
  await conn.query('INSERT INTO panel_users (username, password_hash) VALUES (?, ?)', [adminUser, hash]);
  console.log(`[DB] Compte panel admin "${adminUser}" créé`);
}

module.exports = { pool, initDb };
