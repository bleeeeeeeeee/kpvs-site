document.addEventListener('DOMContentLoaded', async () => {
    try {
        const r = await fetch('/api/auth/me');
        if (r.ok) {
            window.location.replace('/admin.html');
            return;
        }
    } catch {}

    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            showError('Введите логин и пароль');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Вход…';
        clearError();

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                window.location.replace('/admin.html');
            } else {
                const data = await res.json().catch(() => ({}));
                showError(data.error || 'Неверный логин или пароль');
            }
        } catch {
            showError('Ошибка соединения с сервером');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Войти';
        }
    });

    function showError(msg) {
        if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
    }

    function clearError() {
        if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    }
});
