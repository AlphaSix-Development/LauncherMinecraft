// Écriture minimale de servers.dat (NBT non compressé, big-endian) :
// racine TAG_Compound("") { TAG_List("servers") [ TAG_Compound { ip, name } ] }.
// Le 1er de la liste = le serveur affiché en premier dans le multijoueur.
// Pas de dépendance : ~60 lignes, format stable depuis des années.
const TAG_END = 0;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

function strBytes(s) {
  const b = Buffer.from(String(s), 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}

function header(type, name) {
  return Buffer.concat([Buffer.from([type]), strBytes(name)]);
}

function serverCompound(server) {
  return Buffer.concat([
    header(TAG_STRING, 'ip'), strBytes(`${server.ip}:${server.port || 25565}`),
    header(TAG_STRING, 'name'), strBytes(server.name),
    Buffer.from([TAG_END])
  ]);
}

function writeServersDat(servers) {
  const elements = servers.map(serverCompound);
  const count = Buffer.alloc(4);
  count.writeInt32BE(elements.length, 0);
  return Buffer.concat([
    header(TAG_COMPOUND, ''),
    header(TAG_LIST, 'servers'),
    Buffer.from([TAG_COMPOUND]),
    count,
    ...elements,
    Buffer.from([TAG_END])
  ]);
}

module.exports = { writeServersDat };
