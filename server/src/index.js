require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const serversRoutes = require('./routes/servers');
const filesRoutes = require('./routes/files');

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN || '*').split(',') }));

// Anti-bruteforce sur l'auth jeu + admin
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use('/api/admin/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/files', filesRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route inconnue.' }));

(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn('[WARN] JWT_SECRET trop court / manquant. Définis-en un long dans .env !');
  }
  await initDb();
  app.listen(PORT, () => console.log(`[API] http://localhost:${PORT} -> /api/health`));
})();
