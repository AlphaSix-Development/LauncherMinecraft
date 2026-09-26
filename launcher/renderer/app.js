let API_URL = 'http://localhost:3001';
let session = null; // { token, user }

const $ = (id) => document.getElementById(id);

function show(view) {
  ['view-login', 'view-register', 'view-connected'].forEach((v) => $(v).classList.add('hidden'));
  $(view).classList.remove('hidden');
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

function renderConnected() {
  $('hello').textContent = `Bienvenue, ${session.user.username} !`;
  $('connected-sub').textContent = 'Tu es bien connecté. Le lancement du jeu arrivera à la prochaine étape.';
  $('user-pseudo').textContent = session.user.username;
  $('user-email').textContent = session.user.email;
  $('user-created').textContent = session.user.created_at
    ? new Date(session.user.created_at).toLocaleString('fr-FR')
    : '—';
  show('view-connected');
}

async function checkHealth() {
  try {
    await api('/api/health');
    $('dot').className = 'dot online';
    $('apiStatus').textContent = `API : connectée (${API_URL})`;
  } catch {
    $('dot').className = 'dot offline';
    $('apiStatus').textContent = `API : injoignable (${API_URL})`;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const config = await window.launcherAPI.getConfig();
  API_URL = config.apiUrl.replace(/\/$/, '');
  $('serverName').textContent = config.serverName || 'Mon Serveur';
  checkHealth();
  setInterval(checkHealth, 10000);

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
    show('view-login');
  };
});
