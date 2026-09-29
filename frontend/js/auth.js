const _pageRender = () => {
  // Theme initialization
  const isDark = localStorage.getItem('crh_theme') === 'dark';
  if (isDark) document.body.classList.add('theme-dark');

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('login-identifier').value.trim();
      const password = document.getElementById('login-password').value;
      const errorDiv = document.getElementById('login-error');
      const btn = loginForm.querySelector('button');
      
      errorDiv.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = 'Signing In...';
      
      try {
        await Store.login(identifier, password);
        window.location.href = 'dashboard.html';
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Sign In';
      }
    });
    
    document.getElementById('demo-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-identifier').value = 'prasanna';
      document.getElementById('login-password').value = 'password';
      // Mock-only: we accept any password since mock-data has 'password'
    });
    
    const toggleBtn = document.getElementById('btn-toggle-password');
    if(toggleBtn) {
       toggleBtn.addEventListener('click', () => {
         const pwInput = document.getElementById('login-password');
         if(pwInput.type === 'password') {
           pwInput.type = 'text';
           toggleBtn.textContent = 'Hide';
         } else {
           pwInput.type = 'password';
           toggleBtn.textContent = 'Show';
         }
       });
    }
  }
  
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;
      const errorDiv = document.getElementById('reg-error');
      const btn = registerForm.querySelector('button');
      
      if (password !== confirm) {
        errorDiv.textContent = 'Passwords do not match.';
        errorDiv.style.display = 'block';
        return;
      }
      
      errorDiv.style.display = 'none';
      btn.disabled = true;
      btn.innerHTML = 'Signing Up...';
      
      try {
        await Store.register({ full_name: name, username, email, password }); // Mock-only: storing plaintext password
        UI.toast('Account created successfully!', 'success');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Sign Up';
      }
    });
  }
};
document.addEventListener('DOMContentLoaded', _pageRender);
document.addEventListener('crh_user_changed', _pageRender);
