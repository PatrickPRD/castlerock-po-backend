/* =========================================================
   Global UI Utilities (Toast + Confirm)
   Single-file version (CSS + HTML injected via JS)
   ========================================================= */



/*------HELPERS------*/
function ensureUI() {
  if (document.getElementById('ui-backdrop')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div id="ui-backdrop" class="ui-backdrop hidden"></div>

    <div id="ui-toast" class="ui-toast hidden"></div>

    <div id="ui-confirm" class="ui-confirm hidden">
      <p id="ui-confirm-message"></p>
      <div class="ui-confirm-actions">
        <button id="ui-confirm-cancel" class="btn btn-secondary">Cancel</button>
        <button id="ui-confirm-ok" class="btn btn-danger">Confirm</button>
      </div>
    </div>
  `;

  // Ensure body exists
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(wrapper);
    });
  } else {
    document.body.appendChild(wrapper);
  }
}


/* ---------- Inject CSS ---------- */
(function injectUICSS() {
  if (document.getElementById('ui-style')) return;

  const style = document.createElement('style');
  style.id = 'ui-style';
  style.textContent = `
  .hidden {
    display: none !important;
  }

  /* ===== Backdrop base ===== */
.ui-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;      
  transition: background 0.15s ease;
}

.ui-backdrop.active {
  pointer-events: auto;      
}

/* Neutral (confirm) */
.ui-backdrop.neutral {
  background: rgba(0, 0, 0, 0.35);
}

/* Success toast */
.ui-backdrop.success {
  background: rgba(22, 163, 74, 0.18);
}

/* Error toast */
.ui-backdrop.error {
  background: rgba(220, 38, 38, 0.20);
}


  /* ===== Toast ===== */
  .ui-toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 320px;
    max-width: 90%;
    padding: 16px 20px;
    background: #e5e7eb;
    color: #111827;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    z-index: 9999;
    text-align: center;
    font-weight: 500;
  }

  .ui-toast.success {
    border-left: 5px solid #16a34a;
  }

  .ui-toast.error {
    border-left: 5px solid #dc2626;
  }

  /* ===== Confirm modal ===== */
  .ui-confirm {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: 320px;
    max-width: 90%;
    padding: 20px;
    background: #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    z-index: 9999;
    text-align: center;
  }

  .ui-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }
`;


  document.head.appendChild(style);
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
        <button id="ui-confirm-cancel" class="btn btn-secondary">Cancel</button>
        <button id="ui-confirm-ok" class="btn btn-danger">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);
})();

/* ---------- Toast ---------- */
window.showToast = function (message, type = 'success', timeout = 5000) {
  ensureUI();

  const toast = document.getElementById('ui-toast');
  const backdrop = document.getElementById('ui-backdrop');
  if (!toast || !backdrop) return;

  toast.textContent = message;
  toast.className = `ui-toast ${type}`;

  backdrop.className = `ui-backdrop ${type} active`;

  toast.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  clearTimeout(toast._timer);

  function hideToast() {
    toast.classList.add('hidden');
    backdrop.classList.add('hidden');

    backdrop.className = 'ui-backdrop';   // 👈 removes active + color
    backdrop.onclick = null;
  }

  backdrop.onclick = hideToast;
  toast._timer = setTimeout(hideToast, timeout);
};





/* ---------- Confirm Dialog ---------- */
window.confirmDialog = function (message) {
  ensureUI();

  return new Promise(resolve => {
    const modal = document.getElementById('ui-confirm');
    const backdrop = document.getElementById('ui-backdrop');
    const msg = document.getElementById('ui-confirm-message');
    const ok = document.getElementById('ui-confirm-ok');
    const cancel = document.getElementById('ui-confirm-cancel');

    if (!modal || !backdrop || !msg) return resolve(false);

    msg.textContent = message;

    backdrop.className = 'ui-backdrop neutral active';

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    function cleanup(result) {
      modal.classList.add('hidden');
      backdrop.classList.add('hidden');

      backdrop.className = 'ui-backdrop';  // 👈 CRITICAL
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




