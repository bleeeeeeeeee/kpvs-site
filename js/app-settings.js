(function () {
    var THEME_KEY = 'kpvs.theme';

    function applyTheme() {
        var t = '';
        try { t = localStorage.getItem(THEME_KEY) || ''; } catch { t = ''; }
        if (t !== 'dark' && t !== 'light') return;
        document.documentElement.setAttribute('data-theme', t);
    }

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme();
    });
})();

