require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN || '*').split(',') }));

// Anti-bruteforce sur l'auth jeu + panel
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use('/api/panel/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/panel', panelRoutes);

// Panel web admin (fichiers dans src/public/panel, embarqués dans l'image Docker)
app.use('/panel', express.static(path.join(__dirname, 'public', 'panel')));

app.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));

(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn('[WARN] JWT_SECRET trop court / manquant. Définis-en un long dans .env !');
  }
  await initDb();
  app.listen(PORT, () => console.log(`[API] http://localhost:${PORT} -> /api/health`));
})();
