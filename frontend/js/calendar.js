const _pageRender = () => {
    document.querySelector('.card div').innerHTML = window.icon('calendar');
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
