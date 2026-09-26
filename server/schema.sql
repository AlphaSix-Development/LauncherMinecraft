-- Base de données launcher_minecraft
-- À exécuter automatiquement via docker-compose (dossier docker-entrypoint-initdb.d)
-- ou manuellement : mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS launcher_minecraft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE launcher_minecraft;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
