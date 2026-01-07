const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  showToast('Invalid password reset link', 'error');
}

async function resetPassword() {
  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm').value;

  if (!password || password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  if (password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  const res = await fetch('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password })
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Invalid or expired link', 'error');
    return;
  }

  showToast('Password set successfully. You can now log in.', 'success');
  window.location.href = 'login.html';
}
