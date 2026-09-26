-- ============================================================
-- SCHEMA COMPLET pour phpMyAdmin (base existante, ex : Launcher)
-- Selectionne ta base -> onglet SQL -> colle tout -> Executer.
-- (L'API cree aussi cette table toute seule au demarrage ;
--  ce fichier sert pour le controle manuel / une install fraiche.)
-- ============================================================

-- Comptes JEU (launcher) : remplie via inscription/connexion du launcher.
-- Ne JAMAIS mettre de mot de passe en clair ici (colonne password_hash = bcrypt).
-- role = tag admin : 'user' par defaut. Seul le owner donne 'admin' en SQL direct,
-- aucune route API ne l'accepte. Le launcher affiche l'admin auto si role='admin'.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Donner le tag admin (remplace TonPseudo) :
-- UPDATE users SET role = 'admin' WHERE username = 'TonPseudo';

-- Retirer le tag admin :
-- UPDATE users SET role = 'user' WHERE username = 'TonPseudo';

-- Nettoyage : l'ancien panel web utilisait panel_users (supprime du projet).
-- Pour effacer la table orpheline :
-- DROP TABLE IF EXISTS panel_users;

-- ---- Pour une base FRAICHE (nouveau serveur), decommente : ----
-- CREATE DATABASE IF NOT EXISTS Launcher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE Launcher;
