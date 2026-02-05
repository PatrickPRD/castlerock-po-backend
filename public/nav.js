const navRole = localStorage.getItem("role");
const navToken = localStorage.getItem("token");

function logout() {
  localStorage.clear();
  location.href = 'login.html';
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-roles]').forEach((el) => {
    const roles = el.getAttribute('data-roles')
      .split(',')
      .map(r => r.trim());

    if (!navRole || !roles.includes(navRole)) {
      el.remove();
    }
  });

  if (!navToken) {
    const onLoginPage = location.pathname.endsWith('login.html') || location.pathname === '/' || location.pathname.endsWith('/login');
    if (!onLoginPage) location.href = 'login.html';
  }
});
