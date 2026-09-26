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
      // Migration : ajoute le tag admin sur les tables créées avant (ignore si déjà là, errno 1060).
      // Le tag ne se donne QUE en SQL direct (owner BDD) : aucune route API ne l'accepte.
      try {
        await conn.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`);
        console.log('[DB] Migration : colonne users.role ajoutée');
      } catch (err) {
        if (err.errno !== 1060) throw err;
      }
      // Serveurs de jeu (créés depuis le launcher admin) : 1 serveur -> 0,N mods.
      // modpack_version = "numéro du modpack", bumpé à chaque changement de mods.
      await conn.query(`
        CREATE TABLE IF NOT EXISTS servers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(64) NOT NULL,
          ip VARCHAR(255) NOT NULL,
          port INT NOT NULL DEFAULT 25565,
          mc_version VARCHAR(16) NOT NULL,
          loader ENUM('vanilla','forge') NOT NULL DEFAULT 'vanilla',
          loader_version VARCHAR(32) NULL,
          modpack_version INT NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS mods (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id INT NOT NULL,
          name VARCHAR(128) NOT NULL,
          filename VARCHAR(255) NOT NULL,
          sha1 CHAR(40) NOT NULL,
          size BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_server (server_id),
          INDEX idx_sha1 (sha1),
          CONSTRAINT fk_mods_server FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      conn.release();
      console.log('[DB] MySQL connecté + tables users/servers/mods OK');
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
