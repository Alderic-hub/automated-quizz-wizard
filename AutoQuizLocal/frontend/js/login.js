const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  loginStatus.innerText = 'Validating credentials...';
  loginStatus.style.color = '#333';

  try {
    const resp = await fetch('http://localhost:3000/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, headless: true }) // headless:true by default
    });

    const data = await resp.json();

    if (resp.ok && data.success) {
      loginStatus.innerText = 'Login successful! Redirecting...';
      loginStatus.style.color = '#27ae60';
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } else {
      loginStatus.innerText = data.message || 'Invalid credentials';
      loginStatus.style.color = '#e74c3c';
    }
  } catch (err) {
    loginStatus.innerText = 'Error connecting to local validation service. Make sure server is running.';
    loginStatus.style.color = '#e74c3c';
    console.error(err);
  }
});
