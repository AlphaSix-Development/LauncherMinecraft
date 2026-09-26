const mysql = require('mysql2/promise');

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
          role ENUM('user','admin') NOT NULL DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      // Migration : ajoute la colonne role sur les tables créées avant (ignore si déjà là, errno 1060)
      // Le rôle ne peut être modifié que directement en BDD (aucune route API ne l'accepte).
      try {
        await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`);
        console.log('[DB] Migration : colonne users.role ajoutée');
      } catch (err) {
        if (err.errno !== 1060) throw err;
      }
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

module.exports = { pool, initDb };
