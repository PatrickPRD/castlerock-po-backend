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
  if (data.first_name) {
    localStorage.setItem('firstName', data.first_name);
  } else {
    localStorage.removeItem('firstName');
  }

  window.location.href = 'dashboard.html';
}

/* ============================
   Forgot Password
   ============================ */
function forgotPassword() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('forgotEmail').focus();
  }
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();

  if (!email) {
    showToast('Please enter your email address', 'error');
    return;
  }

  try {
    const res = await fetch('/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to send reset email', 'error');
      return;
    }

    // Success - show message and close
    showToast('Password reset link sent to your email', 'success');
    closeForgotPasswordModal();
    document.getElementById('forgotPasswordForm').reset();

  } catch (err) {
    showToast('Error sending reset email', 'error');
  }
}

/* ============================
   Page Initialization
   ============================ */

// Forgot password form submission
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener('submit', handleForgotPassword);
}

// Modal close buttons
document.querySelectorAll('[data-modal-close]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modalId = btn.dataset.modalClose;
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
  });
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal && e.target === modal) {
    modal.style.display = 'none';
  }
});

