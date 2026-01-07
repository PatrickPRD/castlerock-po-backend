/* =========================================================
   Global UI Utilities (Toast + Confirm)
   ========================================================= */

/* ---------- Inject CSS from same folder ---------- */
(function injectUICSS() {
  if (document.getElementById('ui-css')) return;

  const script = document.currentScript;
  if (!script) return;

  const basePath = script.src.substring(0, script.src.lastIndexOf('/'));
  const cssPath = `${basePath}/ui.css`;

  const link = document.createElement('link');
  link.id = 'ui-css';
  link.rel = 'stylesheet';
  link.href = cssPath;

  document.head.appendChild(link);
})();

/* ---------- Inject UI HTML ---------- */
(function injectUIHTML() {
  if (document.getElementById('ui-backdrop')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="ui-backdrop" class="ui-backdrop hidden"></div>

    <div id="ui-toast" class="ui-toast hidden"></div>

    <div id="ui-confirm" class="ui-confirm hidden">
      <p id="ui-confirm-message"></p>
      <div class="ui-confirm-actions">
        <button id="ui-confirm-cancel" class="btn-outline">Cancel</button>
        <button id="ui-confirm-ok" class="btn-danger">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);
})();

/* ---------- Toast ---------- */
window.showToast = function (message, type = 'success', timeout = 3000) {
  const toast = document.getElementById('ui-toast');
  const backdrop = document.getElementById('ui-backdrop');
  if (!toast || !backdrop) return;

  toast.textContent = message;
  toast.className = `ui-toast ${type}`;

  toast.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
    backdrop.classList.add('hidden');
  }, timeout);
};

/* ---------- Confirm Dialog ---------- */
window.confirmDialog = function (message) {
  return new Promise(resolve => {
    const modal = document.getElementById('ui-confirm');
    const backdrop = document.getElementById('ui-backdrop');
    const msg = document.getElementById('ui-confirm-message');
    const ok = document.getElementById('ui-confirm-ok');
    const cancel = document.getElementById('ui-confirm-cancel');

    if (!modal || !backdrop) return resolve(false);

    msg.textContent = message;

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    function cleanup(result) {
      modal.classList.add('hidden');
      backdrop.classList.add('hidden');

      ok.onclick = null;
      cancel.onclick = null;
      backdrop.onclick = null;

      resolve(result);
    }

    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
    backdrop.onclick = () => cleanup(false);
  });
};
