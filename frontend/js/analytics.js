const _pageRender = () => {
    document.querySelector('.card').innerHTML = `
        <div style="font-size:48px; color:var(--text-muted); margin-bottom:16px; display:flex; justify-content:center;">${window.icon('pieChart')}</div>
        <h3>Analytics Dashboard Coming Soon</h3>
        <p class="text-muted">We are gathering enough data to show you meaningful insights.</p>
    `;
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
