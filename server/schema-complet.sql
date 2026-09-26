-- ============================================================
-- SCHEMA COMPLET pour phpMyAdmin (base existante, ex : Launcher)
-- Selectionne ta base -> onglet SQL -> colle tout -> Executer.
-- (L'API cree aussi ces tables toute seule au demarrage ;
--  ce fichier sert pour le controle manuel / une install fraiche.)
-- ============================================================

-- 1. Comptes JEU (launcher) : remplie via inscription/connexion du launcher.
--    Ne JAMAIS mettre de mot de passe en clair ici (colonne password_hash = bcrypt).
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Comptes PANEL WEB admin : 1 seul compte, cree auto au boot de l'API
--    depuis PANEL_ADMIN_USER / PANEL_ADMIN_PASSWORD du .env.
--    Pas d'inscription publique sur le panel.
CREATE TABLE IF NOT EXISTS panel_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Pour une base FRAICHE (nouveau serveur), decommente : ----
-- CREATE DATABASE IF NOT EXISTS Launcher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE Launcher;
