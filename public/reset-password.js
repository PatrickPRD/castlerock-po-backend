const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  alert('Invalid password reset link');
}

async function resetPassword() {
  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm').value;

  if (!password || password.length < 8) {
    alert('Password must be at least 8 characters');
    return;
  }

  if (password !== confirm) {
    alert('Passwords do not match');
    return;
  }

  const res = await fetch('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'Invalid or expired link');
    return;
  }

  alert('Password set successfully. You can now log in.');
  window.location.href = 'login.html';
}
