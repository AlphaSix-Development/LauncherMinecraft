let API_URL = 'http://localhost:3001';
let session = null; // { token, user }

const $ = (id) => document.getElementById(id);

const VIEWS = ['view-login', 'view-register', 'view-connected', 'view-admin-dashboard', 'view-admin-users', 'view-admin-servers', 'view-play'];

function show(view) {
  VIEWS.forEach((v) => $(v).classList.add('hidden'));
  $(view).classList.remove('hidden');
  document.querySelectorAll('#admin-submenu a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === view);
  });
}

// Échappe le HTML (pseudos/emails BDD affichés dans le tableau admin).
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR');
  } catch {
    return '—';
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function fillConnected() {
  $('hello').textContent = `Bienvenue, ${session.user.username} !`;
  $('connected-sub').textContent = 'Tu es bien connecté. Le lancement du jeu arrivera à la prochaine étape.';
  $('user-pseudo').textContent = session.user.username;
  $('user-email').textContent = session.user.email;
  $('user-created').textContent = session.user.created_at
    ? new Date(session.user.created_at).toLocaleString('fr-FR')
    : '—';
}

function renderConnected() {
  fillConnected();
  show('view-connected');
  updatePlayUI();
  updateAdminUI();
}

function updatePlayUI() {
  $('play-block').classList.toggle('hidden', !session);
}

// Bouton Admin du menu gauche : visible uniquement avec le tag admin en BDD.
// Le clic ouvre le SOUS-MENU (jamais le dashboard en direct).
function updateAdminUI() {
  const isAdmin = !!session && session.user.role === 'admin';
  $('admin-block').classList.toggle('hidden', !isAdmin);
  if (!isAdmin) {
    $('admin-submenu').classList.add('hidden');
    $('admin-chevron').classList.remove('open');
    if (!$('view-admin-dashboard').classList.contains('hidden') ||
        !$('view-admin-users').classList.contains('hidden')) {
      show('view-connected');
    }
    return;
  }
  refreshAdminData();
}

// Remplit dashboard + tableau (sans changer de vue).
async function refreshAdminData() {
  if (!session || session.user.role !== 'admin') return;
  try {
    $('admin-load-error').textContent = '';
    const { users } = await api('/api/admin/users', { token: session.token });
    $('admin-hello').textContent = session.user.username;
    $('admin-total').textContent = users.length;
    if (users.length > 0) {
      $('stat-last').textContent = users[0].username;
      $('stat-last').title = users[0].username;
      $('stat-date').textContent = fmtDate(users[0].created_at);
      $('stat-date').title = fmtDate(users[0].created_at);
    } else {
      $('stat-last').textContent = '—';
      $('stat-date').textContent = '—';
    }
    $('admin-users-body').innerHTML = users.length === 0
      ? '<tr><td colspan="4">Aucun joueur inscrit pour l\'instant.</td></tr>'
      : users.map((u) => (
        `<tr><td>${esc(u.id)}</td><td>${esc(u.username)}</td>` +
        `<td>${esc(u.email)}</td><td>${esc(fmtDate(u.created_at))}</td></tr>`
      )).join('');
  } catch (err) {
    $('admin-load-error').textContent = err.message;
  }
}

// Revalide la session jeu toutes les 30s : le tag admin pris/retiré en BDD
// s'applique sans déconnexion/reconnexion, sans changer la vue en cours.
async function refreshSession() {
  if (!session?.token) return;
  try {
    const { user } = await api('/api/auth/me', { token: session.token });
    session.user = user;
    await window.launcherAPI.saveSession(session);
    fillConnected();
    updatePlayUI();
    updateAdminUI();
  } catch {
    await window.launcherAPI.clearSession();
    session = null;
    show('view-login');
  }
}

async function checkHealth() {
  try {
    await api('/api/health');
    $('dot').className = 'dot online';
    $('apiStatus').textContent = `API : connectée (${API_URL})`;
  } catch (err) {
    $('dot').className = 'dot offline';
    $('apiStatus').textContent = `API : injoignable (${API_URL}) — ${err.message}`;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const config = await window.launcherAPI.getConfig();
  API_URL = config.apiUrl.replace(/\/$/, '');
  $('serverName').textContent = config.serverName || 'Mon Serveur';
  checkHealth();
  setInterval(checkHealth, 10000);
  setInterval(refreshSession, 30000);

  // Session existante -> vérifie le token côté API
  session = await window.launcherAPI.getSession();
  if (session?.token) {
    try {
      const { user } = await api('/api/auth/me', { token: session.token });
      session.user = user;
      renderConnected();
    } catch {
      await window.launcherAPI.clearSession();
      session = null;
      show('view-login');
    }
  } else {
    show('view-login');
  }

  $('go-register').onclick = (e) => { e.preventDefault(); show('view-register'); };
  $('go-login').onclick = (e) => { e.preventDefault(); show('view-login'); };

  // Sous-menu Admin : le bouton ouvre le menu, les liens changent de vue.
  $('btn-admin-menu').onclick = () => {
    $('admin-submenu').classList.toggle('hidden');
    $('admin-chevron').classList.toggle('open');
  };
  document.querySelectorAll('#admin-submenu a').forEach((a) => {
    a.onclick = async (e) => {
      e.preventDefault();
      await refreshAdminData();
      show(a.dataset.view);
      if (a.dataset.view === 'view-admin-servers') {
        await Promise.all([loadMcVersions(), loadServersAdmin()]);
      }
    };
  });

  $('btn-login').onclick = async () => {
    $('login-error').textContent = '';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { identifier: $('login-identifier').value, password: $('login-password').value }
      });
      session = data;
      await window.launcherAPI.saveSession(session);
      renderConnected();
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  };

  $('btn-register').onclick = async () => {
    $('register-error').textContent = '';
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          username: $('reg-username').value,
          email: $('reg-email').value,
          password: $('reg-password').value
        }
      });
      session = data;
      await window.launcherAPI.saveSession(session);
      renderConnected();
    } catch (err) {
      $('register-error').textContent = err.message;
    }
  };

  $('btn-logout').onclick = async () => {
    await window.launcherAPI.clearSession();
    session = null;
    $('login-password').value = '';
    $('admin-block').classList.add('hidden');
    $('admin-submenu').classList.add('hidden');
    $('admin-chevron').classList.remove('open');
    $('play-block').classList.add('hidden');
    editingServerId = null;
    modsServerId = null;
    show('view-login');
  };

  // ---------- P4 : jouer (lancement crack, une seule instance) ----------
  let playServers = [];
  let pendingServer = null;
  let playBusy = false;

  function playButtonState() {
    return window.launcherAPI.gameStatus().catch(() => ({ running: false, serverId: null }));
  }

  function updatePlayButtons(state) {
    document.querySelectorAll('[data-play-id]').forEach((b) => {
      const id = Number(b.dataset.playId);
      if (playBusy) {
        b.disabled = true;
        b.textContent = '⏳…';
      } else if (state.running && state.serverId === id) {
        b.disabled = true;
        b.textContent = '🎮 EN JEU';
      } else {
        b.disabled = false;
        b.textContent = '▶ JOUER';
      }
    });
  }

  function appendPlayLog(line) {
    const pre = $('play-log');
    pre.textContent += line + '\n';
    const lines = pre.textContent.split('\n');
    if (lines.length > 200) pre.textContent = lines.slice(-200).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  async function enterPlay() {
    if (!session) { show('view-login'); return; }
    $('play-pseudo').textContent = session.user.username;
    show('view-play');
    await loadPlayServers();
    updatePlayButtons(await playButtonState());
  }

  async function loadPlayServers() {
    try {
      const res = await fetch(`${API_URL}/api/servers`);
      const data = await res.json();
      playServers = data.servers || [];
      renderPlayServers();
    } catch (err) {
      $('play-servers').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  function renderPlayServers() {
    if (playServers.length === 0) {
      $('play-servers').innerHTML = '<p class="sub">Aucun serveur pour l’instant. Reviens plus tard !</p>';
      return;
    }
    $('play-servers').innerHTML = playServers.map((s) => (
      `<div class="server-card"><div class="info"><b>${esc(s.name)}</b>` +
      `<span>${esc(s.ip)}:${esc(s.port)} • MC ${esc(s.mc_version)} • ${esc(s.loader)}${s.loader_version ? ' ' + esc(s.loader_version) : ''} • ${s.mod_count} mods</span></div>` +
      `<div class="actions"><button data-play-id="${s.id}">▶ JOUER</button></div></div>`
    )).join('');
    document.querySelectorAll('[data-play-id]').forEach((b) => {
      b.onclick = () => onPlayClick(Number(b.dataset.playId));
    });
  }

  async function onPlayClick(id) {
    const server = playServers.find((s) => s.id === id);
    if (!server || playBusy) return;
    const st = await playButtonState();
    if (st.running) {
      if (st.serverId === id) return; // déjà lancé dessus
      pendingServer = server; // autre serveur -> popup d'attente
      $('modal-wait').classList.remove('hidden');
      return;
    }
    startLaunch(server);
  }

  async function startLaunch(server) {
    playBusy = true;
    updatePlayButtons({ running: false, serverId: null });
    $('play-error').textContent = '';
    $('play-log').textContent = '';
    $('play-bar').style.width = '0%';
    $('play-progress-block').classList.remove('hidden');
    $('play-status').textContent = `Lancement de ${server.name}…`;
    try {
      const r = await window.launcherAPI.gameLaunch({
        server: {
          id: server.id, name: server.name, ip: server.ip, port: server.port,
          mc_version: server.mc_version, loader: server.loader, loader_version: server.loader_version
        },
        username: session.user.username
      });
      if (!r.ok) {
        if (r.error === 'ALREADY_RUNNING') {
          pendingServer = server;
          $('modal-wait').classList.remove('hidden');
        } else {
          $('play-error').textContent = r.error;
          $('play-status').textContent = 'Échec du lancement.';
        }
      }
    } catch (err) {
      $('play-error').textContent = err.message;
      $('play-status').textContent = 'Échec du lancement.';
    }
    playBusy = false;
    updatePlayButtons(await playButtonState());
  }

  window.launcherAPI.onGameEvent(async (msg) => {
    if (!msg) return;
    if (msg.type === 'status') {
      $('play-progress-block').classList.remove('hidden');
      $('play-status').textContent = msg.message;
    } else if (msg.type === 'progress') {
      $('play-progress-block').classList.remove('hidden');
      const total = Number(msg.total || 0);
      const done = Number(msg.done ?? msg.current ?? 0);
      if (total > 0) $('play-bar').style.width = Math.min(100, Math.round((done / total) * 100)) + '%';
      const label = msg.scope === 'mods'
        ? `Mods ${done}/${total}${msg.filename ? ' • ' + msg.filename : ''}`
        : `Téléchargement ${done}/${total}`;
      $('play-status').textContent = label;
    } else if (msg.type === 'log') {
      appendPlayLog(msg.line);
    } else if (msg.type === 'closed') {
      $('play-status').textContent = `Jeu fermé (code ${msg.code}).`;
      updatePlayButtons({ running: false, serverId: null });
      if (pendingServer) {
        const next = pendingServer;
        pendingServer = null;
        $('modal-wait').classList.add('hidden');
        startLaunch(next);
      }
    }
  });

  $('btn-play-menu').onclick = enterPlay;

  $('btn-kill-game').onclick = async () => {
    $('play-status').textContent = 'Fermeture du jeu…';
    await window.launcherAPI.gameKill();
  };

  $('btn-wait-cancel').onclick = () => {
    pendingServer = null;
    $('modal-wait').classList.add('hidden');
  };

  // ---------- P3 : gestion serveurs + mods (tag admin) ----------
  let editingServerId = null;
  let modsServerId = null;
  let mcVersionsCache = null;

  async function loadMcVersions() {
    if (mcVersionsCache) return fillMcSelect();
    try {
      const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
      const data = await res.json();
      mcVersionsCache = data.versions.filter((v) => v.type === 'release').map((v) => v.id);
    } catch {
      mcVersionsCache = ['1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'];
    }
    fillMcSelect();
  }

  function fillMcSelect() {
    const sel = $('srv-mc');
    const current = sel.value;
    sel.innerHTML = mcVersionsCache.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    sel.value = mcVersionsCache.includes(current) ? current : (mcVersionsCache.includes('1.20.1') ? '1.20.1' : mcVersionsCache[0]);
    loadForgeVersions();
  }

  async function loadForgeVersions() {
    const mc = $('srv-mc').value;
    const dl = $('forge-versions');
    dl.innerHTML = '';
    if ($('srv-loader').value !== 'forge' || !mc) return;
    try {
      const res = await fetch('https://files.minecraftforge.net/maven/net/minecraftforge/forge/maven-metadata.xml');
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const vers = [...doc.getElementsByTagName('version')]
        .map((n) => n.textContent.trim())
        .filter((v) => v.startsWith(mc + '-'))
        .map((v) => v.slice(mc.length + 1))
        .reverse();
      dl.innerHTML = vers.map((v) => `<option value="${esc(v)}">`).join('');
    } catch { /* saisie manuelle possible */ }
  }

  $('srv-mc').onchange = loadForgeVersions;
  $('srv-loader').onchange = () => {
    if ($('srv-loader').value !== 'forge') $('srv-loader-version').value = '';
    loadForgeVersions();
  };

  async function loadServersAdmin() {
    try {
      const res = await fetch(`${API_URL}/api/servers`);
      const data = await res.json();
      const list = $('servers-list');
      if (!data.servers || data.servers.length === 0) {
        list.innerHTML = '<p class="sub">Aucun serveur pour l’instant. Crée le premier ci-dessous.</p>';
        return;
      }
      list.innerHTML = data.servers.map((s) => (
        `<div class="server-card"><div class="info"><b>${esc(s.name)}</b>` +
        `<span>${esc(s.ip)}:${esc(s.port)} • MC ${esc(s.mc_version)} • ${esc(s.loader)}${s.loader_version ? ' ' + esc(s.loader_version) : ''} • ${s.mod_count} mods • modpack v${s.modpack_version}</span></div>` +
        `<div class="actions"><button class="small" data-act="mods" data-id="${s.id}">📦 Mods</button>` +
        `<button class="small" data-act="edit" data-id="${s.id}">✏️</button>` +
        `<button class="small link-danger" data-act="del" data-id="${s.id}">🗑️</button></div></div>`
      )).join('');
      list.querySelectorAll('button').forEach((b) => {
        const id = Number(b.dataset.id);
        if (b.dataset.act === 'mods') b.onclick = () => selectModsServer(id);
        if (b.dataset.act === 'edit') b.onclick = () => startEditServer(id);
        if (b.dataset.act === 'del') b.onclick = () => deleteServer(id);
      });
    } catch (err) {
      $('servers-list').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  function resetSrvForm() {
    editingServerId = null;
    ['srv-name', 'srv-ip', 'srv-loader-version'].forEach((id) => { $(id).value = ''; });
    $('srv-port').value = '25565';
    $('srv-loader').value = 'vanilla';
    $('srv-error').textContent = '';
    $('srv-form-title').textContent = '➕ Nouveau serveur';
    $('btn-srv-save').textContent = 'Créer le serveur';
    $('btn-srv-cancel').classList.add('hidden');
  }

  async function startEditServer(id) {
    try {
      const data = await api(`/api/servers/${id}`, { token: session.token });
      const s = data.server;
      editingServerId = id;
      $('srv-name').value = s.name;
      $('srv-ip').value = s.ip;
      $('srv-port').value = s.port;
      await loadMcVersions();
      if (!mcVersionsCache.includes(s.mc_version)) {
        mcVersionsCache.unshift(s.mc_version);
        fillMcSelect();
      }
      $('srv-mc').value = s.mc_version;
      $('srv-loader').value = s.loader;
      $('srv-loader-version').value = s.loader_version || '';
      await loadForgeVersions();
      $('srv-error').textContent = '';
      $('srv-form-title').textContent = `✏️ Modifier : ${s.name}`;
      $('btn-srv-save').textContent = 'Enregistrer';
      $('btn-srv-cancel').classList.remove('hidden');
    } catch (err) {
      $('srv-error').textContent = err.message;
    }
  }

  async function deleteServer(id) {
    if (!confirm('Supprimer ce serveur et tous ses mods ?')) return;
    try {
      await api(`/api/admin/servers/${id}`, { method: 'DELETE', token: session.token });
      if (modsServerId === id) { modsServerId = null; $('srv-mods-block').classList.add('hidden'); }
      resetSrvForm();
      await loadServersAdmin();
    } catch (err) {
      $('srv-error').textContent = err.message;
    }
  }

  $('btn-srv-save').onclick = async () => {
    $('srv-error').textContent = '';
    const body = {
      name: $('srv-name').value,
      ip: $('srv-ip').value,
      port: Number($('srv-port').value),
      mc_version: $('srv-mc').value,
      loader: $('srv-loader').value,
      loader_version: $('srv-loader-version').value || null
    };
    try {
      if (editingServerId) {
        await api(`/api/admin/servers/${editingServerId}`, { method: 'PUT', body, token: session.token });
      } else {
        await api(`/api/admin/servers`, { method: 'POST', body, token: session.token });
      }
      resetSrvForm();
      await loadServersAdmin();
    } catch (err) {
      $('srv-error').textContent = err.message;
    }
  };
  $('btn-srv-cancel').onclick = (e) => { e.preventDefault(); resetSrvForm(); };

  async function selectModsServer(id) {
    modsServerId = id;
    $('srv-mods-block').classList.remove('hidden');
    await loadSrvMods();
  }

  async function loadSrvMods() {
    if (!modsServerId) return;
    try {
      $('upload-msg').textContent = '';
      $('upload-msg').className = 'error';
      const data = await api(`/api/servers/${modsServerId}/mods`);
      const srv = (await api(`/api/servers/${modsServerId}`)).server;
      $('srv-mods-name').textContent = srv.name;
      $('srv-modpack-v').textContent = data.modpack_version;
      $('srv-mods-list').innerHTML = data.mods.length === 0
        ? '<p class="sub">Aucun mod. Glisse un zip ou des .jar ci-dessus.</p>'
        : data.mods.map((m) => (
          `<div class="mod-row"><div><b>${esc(m.name)}</b> <span>${esc(m.filename)} • ${(m.size / 1048576).toFixed(1)} Mo</span></div>` +
          `<button class="small link-danger" data-id="${m.id}">🗑️</button></div>`
        )).join('');
      $('srv-mods-list').querySelectorAll('button').forEach((b) => {
        b.onclick = () => deleteSrvMod(Number(b.dataset.id));
      });
    } catch (err) {
      $('upload-msg').textContent = err.message;
    }
  }

  async function deleteSrvMod(modId) {
    if (!confirm('Supprimer ce mod ?')) return;
    try {
      await api(`/api/admin/mods/${modId}`, { method: 'DELETE', token: session.token });
      await loadSrvMods();
      await loadServersAdmin();
    } catch (err) {
      $('upload-msg').textContent = err.message;
    }
  }

  function uploadModsXHR(files) {
    return new Promise((resolve, reject) => {
      const okFiles = [...files].filter((f) => /\.zip$/i.test(f.name) || /\.jar$/i.test(f.name));
      if (okFiles.length === 0) {
        reject(new Error('Seuls .zip et .jar acceptés.'));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/admin/servers/${modsServerId}/mods`);
      xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          $('upload-bar').style.width = Math.round((e.loaded / e.total) * 100) + '%';
        }
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Erreur ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Échec réseau pendant l’upload.'));
      const fd = new FormData();
      okFiles.forEach((f) => fd.append('mods', f, f.name));
      $('upload-progress').classList.remove('hidden');
      $('upload-bar').style.width = '0%';
      xhr.send(fd);
    });
  }

  async function handleModFiles(files) {
    if (!modsServerId) return;
    $('upload-msg').textContent = '';
    try {
      const data = await uploadModsXHR(files);
      $('upload-progress').classList.add('hidden');
      $('upload-msg').textContent = `✅ ${data.added.length} mod(s) ajouté(s)` +
        (data.skipped > 0 ? `, ${data.skipped} déjà présent(s)` : '') +
        ` — modpack v${data.modpack_version}.`;
      $('upload-msg').className = 'ok';
      await loadSrvMods();
      await loadServersAdmin();
    } catch (err) {
      $('upload-progress').classList.add('hidden');
      $('upload-msg').textContent = err.message;
      $('upload-msg').className = 'error';
    }
  }

  const dz = $('dropzone');
  dz.onclick = () => $('mods-file').click();
  $('mods-file').onchange = (e) => handleModFiles(e.target.files);
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', (e) => handleModFiles(e.dataTransfer.files));
});
