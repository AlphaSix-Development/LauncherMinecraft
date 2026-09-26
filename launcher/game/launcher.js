const fs = require('fs');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const { authorizationOffline } = require('./uuid');
const { writeServersDat } = require('./serversDat');
const { findJava } = require('./java');
const { syncMods } = require('./mods');

// État : une seule instance à la fois (spec : popup + Fermer si autre serveur).
let client = null;
let child = null;
let runningServerId = null;
let launching = false;

function isRunning() {
  return child !== null;
}

function getState() {
  return { running: isRunning(), launching, serverId: runningServerId };
}

// Télécharge l'installeur Forge officiel et le met en cache (réutilisé ensuite).
async function ensureForgeInstaller({ mcVersion, forgeVersion, cacheDir, send }) {
  const file = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
  const dest = path.join(cacheDir, file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) return dest;
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/${file}`;
  send({ type: 'log', line: `Téléchargement installeur Forge ${forgeVersion}…` });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Installeur Forge introuvable (${res.status}). Vérifie la version du loader.`);
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buffer);
  return dest;
}

// Lancement complet : Java -> mods -> servers.dat -> MCLC offline (crack).
// send({type}) pousse les événements vers le renderer (progress/log/closed/error).
async function launchGame({ server, username, apiUrl, userDataDir, send }) {
  if (launching) throw new Error('Lancement déjà en cours.');
  if (isRunning()) throw new Error('ALREADY_RUNNING');
  launching = true;
  try {
    send({ type: 'status', step: 'java', message: 'Vérification de Java…' });
    const java = await findJava(server.mc_version);
    if (java.error) {
      const err = new Error(java.error);
      err.code = 'JAVA_MISSING';
      throw err;
    }

    const instanceDir = path.join(userDataDir, 'instances', String(server.id));
    const sharedRoot = path.join(userDataDir, 'minecraft');
    await fs.promises.mkdir(instanceDir, { recursive: true });

    send({ type: 'status', step: 'mods', message: 'Synchronisation des mods…' });
    const sync = await syncMods({
      apiUrl,
      serverId: server.id,
      instanceDir,
      onProgress: (p) => send({ type: 'progress', scope: 'mods', ...p })
    });
    send({ type: 'log', line: `Mods : ${sync.synced} au manifeste, ${sync.downloaded} téléchargé(s) (modpack v${sync.modpack_version}).` });

    // servers.dat réécrit avec NOTRE serveur en premier (multijoueur).
    await fs.promises.writeFile(
      path.join(instanceDir, 'servers.dat'),
      writeServersDat([{ name: server.name, ip: server.ip, port: server.port }])
    );

    const version = { number: server.mc_version, type: 'release' };
    if (server.loader === 'forge') {
      if (!server.loader_version) throw new Error('Version Forge manquante pour ce serveur.');
      version.forge = await ensureForgeInstaller({
        mcVersion: server.mc_version,
        forgeVersion: server.loader_version,
        cacheDir: path.join(sharedRoot, 'forge-installers'),
        send
      });
    }

    send({ type: 'status', step: 'launch', message: 'Téléchargement des fichiers Minecraft…' });
    client = new Client();
    client.on('download-status', (e) => send({ type: 'progress', scope: 'game', ...e }));
    client.on('progress', (e) => send({ type: 'progress', scope: 'game', ...e }));
    client.on('data', (line) => send({ type: 'log', line: String(line).slice(0, 500) }));
    client.on('debug', (line) => send({ type: 'log', line: '[debug] ' + String(line).slice(0, 300) }));
    client.on('close', (code) => {
      send({ type: 'closed', code });
      child = null;
      runningServerId = null;
      client = null;
    });

    child = await client.launch({
      authorization: authorizationOffline(username),
      root: sharedRoot,
      version,
      memory: { max: '4G', min: '2G' },
      javaPath: java.path,
      overrides: { gameDirectory: instanceDir }
    });
    runningServerId = server.id;
    send({ type: 'status', step: 'running', message: 'Jeu lancé. Bon jeu !' });
    return { ok: true };
  } catch (err) {
    child = null;
    runningServerId = null;
    client = null;
    throw err;
  } finally {
    launching = false;
  }
}

function killGame() {
  if (!child) return false;
  try {
    child.kill();
    return true;
  } catch {
    return false;
  }
}

module.exports = { launchGame, killGame, isRunning, getState };
