// Page d'inscription TEMPORAIRE : utilise l'API jeu existante, rien de plus.
const $ = (id) => document.getElementById(id);

window.addEventListener('DOMContentLoaded', () => {
  const submit = async () => {
    $('register-error').textContent = '';
    $('register-ok').textContent = '';
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('reg-username').value,
          email: $('reg-email').value,
          password: $('reg-password').value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      $('register-ok').textContent = `✅ Compte "${data.user.username}" créé ! Connecte-toi dans le launcher.`;
      $('reg-password').value = '';
    } catch (err) {
      $('register-error').textContent = err.message;
    }
  };

  $('btn-register').onclick = submit;
  ['reg-username', 'reg-email', 'reg-password'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  });
});
