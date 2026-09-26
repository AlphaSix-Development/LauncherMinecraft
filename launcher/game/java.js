const { execFile } = require('child_process');
const path = require('path');

// Version Java requise selon la version Minecraft (règles Mojang) :
// <= 1.16.x -> Java 8 | 1.17 -> 16 (on exige 17, compatible) | 1.18 -> 1.20.4 -> 17 | >= 1.20.5 -> 21.
function requiredJavaMajor(mcVersion) {
  const m = String(mcVersion || '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 17;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3] || 0);
  if (major > 1) return 21;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 17) return 17;
  return 8;
}

function parseJavaMajor(output) {
  // Ancien format : java version "1.8.0_392" | Nouveau : openjdk version "17.0.9" / "21.0.2"
  const m = String(output).match(/version "([^"]+)"/);
  if (!m) return null;
  const v = m[1];
  if (v.startsWith('1.')) {
    const n = Number(v.split('.')[1]);
    return Number.isInteger(n) ? n : null;
  }
  const n = Number(v.split('.')[0]);
  return Number.isInteger(n) ? n : null;
}

function execVersion(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], { timeout: 15000 }, (err, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`;
      if (err && !/version "/.test(out)) return resolve(null);
      resolve(parseJavaMajor(out));
    });
  });
}

// Cherche un Java compatible : PATH puis JAVA_HOME. Retourne { path, major }
// ou { error } avec message + lien Adoptium si rien de compatible.
async function findJava(mcVersion) {
  const required = requiredJavaMajor(mcVersion);
  const candidates = ['java'];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  }
  for (const candidate of candidates) {
    const major = await execVersion(candidate);
    if (major !== null && major >= required) {
      return { path: candidate === 'java' ? 'java' : candidate, major, required };
    }
  }
  return {
    error: `Java ${required}+ requis pour Minecraft ${mcVersion} (aucun Java compatible trouvé). Installe-le ici : https://adoptium.net/fr/temurin/releases/ puis relance.`
  };
}

module.exports = { requiredJavaMajor, parseJavaMajor, findJava };
