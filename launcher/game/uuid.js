const crypto = require('crypto');

// UUID offline (crack) : UUID v3 = MD5("OfflinePlayer:" + pseudo), comme le jeu vanilla.
// Déterministe : même pseudo -> même UUID (inventaire/stats cohérents par serveur).
function offlineUuid(username) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = hash.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function authorizationOffline(username) {
  return {
    access_token: '0',
    client_token: '0',
    uuid: offlineUuid(username).replace(/-/g, ''),
    name: username,
    user_properties: '{}',
    meta: { type: 'mojang', demo: false }
  };
}

module.exports = { offlineUuid, authorizationOffline };
