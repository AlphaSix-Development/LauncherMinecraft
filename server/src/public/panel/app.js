// Panel admin : même origine que l'API, appels relatifs (marche sur n'importe quelle IP).
const $ = (id) => document.getElementById(id);

function show(view) {
  ['view-login', 'view-connected'].forEach((v) => $(v).classList.add('hidden'));
  $(view).classList.remove('hidden');
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

function renderConnected(user) {
  $('hello-user').textContent = user.username;
  show('view-connected');
}

window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('panel_token');
  if (token) {
    try {
      const { user } = await api('/api/panel/me', { token });
      renderConnected(user);
    } catch {
      localStorage.removeItem('panel_token');
      show('view-login');
    }
  } else {
    show('view-login');
  }

  $('btn-login').onclick = async () => {
    $('login-error').textContent = '';
    try {
      const data = await api('/api/panel/login', {
        method: 'POST',
        body: { username: $('login-username').value, password: $('login-password').value }
      });
      localStorage.setItem('panel_token', data.token);
      renderConnected(data.user);
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  };

  $('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-login').click();
  });

  $('btn-logout').onclick = () => {
    localStorage.removeItem('panel_token');
    $('login-password').value = '';
    show('view-login');
  };
});
