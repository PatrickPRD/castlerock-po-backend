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
function forgotPassword() {
  window.location.href = 'mailto:webadmin@castlerockhomes.ie?subject=Password%20Reset%20Request&body=Hello,%0D%0A%0D%0APlease%20reset%20my%20password%20for%20the%20Purchase%20Order%20System.%0D%0A%0D%0AThank%20you.';
}
