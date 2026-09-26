let API_URL = 'http://localhost:3001';
let session = null; // { token, user }

const $ = (id) => document.getElementById(id);

const VIEWS = ['view-login', 'view-register', 'view-connected', 'view-admin-dashboard', 'view-admin-users'];

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
  updateAdminUI();
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
    show('view-login');
  };
});
