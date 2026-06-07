function currentTheme() {
    return localStorage.getItem('manual-theme') || 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('manual-theme', theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '\u2600\ufe0f \u4eae\u8272' : '\ud83c\udf19 \u6697\u8272';
    const frame = document.getElementById('manualFrame');
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'manual-theme', theme }, '*');
    }
}

function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function setActiveSection(section) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === section);
    });
    window.location.hash = section;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
}

window.addEventListener('DOMContentLoaded', () => {
    const initial = (window.location.hash || '#intro').slice(1);
    const link = document.querySelector(`.sidebar-link[data-section="${initial}"]`);
    const frame = document.getElementById('manualFrame');
    if (link && frame) {
        frame.src = link.getAttribute('href');
        setActiveSection(initial);
    }
    applyTheme(currentTheme());
    if (frame) frame.addEventListener('load', () => applyTheme(currentTheme()));
});
