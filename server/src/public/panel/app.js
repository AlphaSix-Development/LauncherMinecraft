// Panel admin : même origine que l'API, appels relatifs (marche sur n'importe quelle IP).
const $ = (id) => document.getElementById(id);

// Anti-XSS : les pseudos/emails viennent de la BDD, on les échappe avant insertion HTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// show() pilote la classe ET l'attribut hidden natif : le dashboard reste
// masqué même si le CSS externe ne charge pas (cache/extension/proxy).
function show(view) {
  ['view-login', 'view-connected'].forEach((v) => {
    const el = $(v);
    const visible = v === view;
    el.classList.toggle('hidden', !visible);
    el.hidden = !visible;
  });
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
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

async function checkHealth() {
  try {
    await api('/api/health');
    $('dot').className = 'dot online';
    $('apiStatus').textContent = 'API : connectée';
  } catch (err) {
    $('dot').className = 'dot offline';
    $('apiStatus').textContent = `API : injoignable — ${err.message}`;
  }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR');
  } catch {
    return '—';
  }
}

function renderDashboard(admin, users) {
  $('hello-user').textContent = admin.username;
  $('stat-total').textContent = users.length;
  if (users.length > 0) {
    // Liste triée DESC par l'API : le premier = le dernier inscrit.
    $('stat-last').textContent = users[0].username;
    $('stat-last').title = users[0].username;
    $('stat-date').textContent = fmtDate(users[0].created_at);
    $('stat-date').title = fmtDate(users[0].created_at);
  } else {
    $('stat-last').textContent = '—';
    $('stat-date').textContent = '—';
  }
  $('users-body').innerHTML = users.length === 0
    ? '<tr><td colspan="4">Aucun joueur inscrit pour l\'instant.</td></tr>'
    : users.map((u) => (
      `<tr><td>${esc(u.id)}</td><td>${esc(u.username)}</td>` +
      `<td>${esc(u.email)}</td><td>${esc(fmtDate(u.created_at))}</td></tr>`
    )).join('');
  show('view-connected');
}

async function loadDashboard(token) {
  const [{ user }, { users }] = await Promise.all([
    api('/api/panel/me', { token }),
    api('/api/panel/users', { token })
  ]);
  renderDashboard(user, users);
}

window.addEventListener('DOMContentLoaded', async () => {
  checkHealth();
  const token = localStorage.getItem('panel_token');
  if (token) {
    try {
      await loadDashboard(token);
    } catch {
      localStorage.removeItem('panel_token');
      show('view-login');
    }
  } else {
    show('view-login');
  }

  const submit = async () => {
    $('login-error').textContent = '';
    try {
      const data = await api('/api/panel/login', {
        method: 'POST',
        body: { username: $('login-username').value, password: $('login-password').value }
      });
      localStorage.setItem('panel_token', data.token);
      await loadDashboard(data.token);
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  };

  $('btn-login').onclick = submit;
  $('login-username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  $('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  $('btn-logout').onclick = () => {
    localStorage.removeItem('panel_token');
    $('login-password').value = '';
    show('view-login');
  };
});
