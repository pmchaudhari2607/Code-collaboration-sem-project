const _pageRender = async () => {
    const user = await Store.getCurrentUser();
    if(!user) return;
    
    document.getElementById('prof-avatar').textContent = Utils.getInitials(user.full_name);
    document.getElementById('prof-avatar').style.backgroundColor = Utils.getAvatarColor(user.full_name);
    
    document.getElementById('prof-name').textContent = user.full_name;
    document.getElementById('prof-user').textContent = `@${user.username}`;
    
    document.getElementById('prof-input-name').value = user.full_name;
    document.getElementById('prof-input-email').value = user.email;
    document.getElementById('prof-input-bio').value = user.bio || '';
    
    document.getElementById('form-profile').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        try {
            const users = await Store.getUsers();
            const u = users.find(u => u.id === user.id);
            if(u) {
                u.full_name = document.getElementById('prof-input-name').value;
                u.email = document.getElementById('prof-input-email').value;
                u.bio = document.getElementById('prof-input-bio').value;
                Store.setStorage('crh_users', users);
            }
            UI.toast('Profile updated', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } catch(err) {
            UI.toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
