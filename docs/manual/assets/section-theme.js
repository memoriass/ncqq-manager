(function () {
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme || 'light');
    }
    try {
        applyTheme(localStorage.getItem('manual-theme') || 'light');
    } catch {
        applyTheme('light');
    }
    window.addEventListener('message', event => {
        if (event.data && event.data.type === 'manual-theme') {
            applyTheme(event.data.theme);
        }
    });
})();
