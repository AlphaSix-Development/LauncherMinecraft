const express = require('express');
const fs = require('fs');
const { filePathFor, ensureFilesDir } = require('../files');

const router = express.Router();

// GET /api/files/:sha1 — téléchargement d'un mod (public, cache immutable).
// Le sha1 contraint le chemin : aucune traversal possible.
router.get('/:sha1', (req, res) => {
  const sha1 = String(req.params.sha1 || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha1)) {
    return res.status(400).json({ error: 'Empreinte invalide.' });
  }
  ensureFilesDir();
  const p = filePathFor(sha1);
  fs.stat(p, (err, stat) => {
    if (err || !stat.isFile()) {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }
    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(p).pipe(res);
  });
});

module.exports = router;
