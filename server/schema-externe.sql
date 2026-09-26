-- Table users pour TA base existante (ex : Launcher, visible dans phpMyAdmin)
-- A executer dans phpMyAdmin : selectionne ta base -> onglet SQL -> colle -> Executer
-- ou en CLI : mysql -u root -p Launcher < schema-externe.sql

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
