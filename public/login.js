async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showToast('Email and password are required', 'error');
    return;
  }

  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Login failed', 'error');
    return;
  }

  // Store auth info
  localStorage.setItem('token', data.token);
  localStorage.setItem('role', data.role);

  window.location.href = 'dashboard.html';
}

/* ============================
   Forgot Password
   ============================ */
async function forgotPassword() {
  const email = prompt('Enter your email address');
  if (!email) return;

  await fetch('/auth/request-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  showToast(
    'If the email exists, a password reset link has been sent.',
    'success'
  );
}
