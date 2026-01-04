const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const params = new URLSearchParams(location.search);
const userId = params.get('id');
if (!userId) location.href = 'admin.html';

const el = id => document.getElementById(id);

/* =========================
   Load user
   ========================= */
async function loadUser() {
  const res = await fetch(`/admin/users/${userId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    alert('Failed to load user');
    return;
  }

  const u = await res.json();

  el('firstName').value = u.first_name || '';
  el('lastName').value  = u.last_name || '';
  el('email').value     = u.email;
  el('role').value      = u.role;
  el('active').value    = u.active ? '1' : '0';
}

/* =========================
   Save changes
   ========================= */
el('userForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    first_name: el('firstName').value.trim(),
    last_name:  el('lastName').value.trim(),
    role:       el('role').value,
    active:     Number(el('active').value)
  };

  const res = await fetch(`/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'Update failed');
    return;
  }

  alert('User updated');
  location.href = 'admin.html';
});

function back() {
  location.href = 'admin.html';
}

loadUser();
