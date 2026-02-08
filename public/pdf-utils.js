/**
 * PDF Utilities for PO Generation
 * Can be included in any page that needs PDF functionality
 * Usage: <script src="/pdf-utils.js"></script>
 */

/**
 * Download a PO as PDF
 * @param {number} poId - Purchase order ID
 */
function setButtonLoading(btn, isLoading) {
  if (!btn) return null;
  if (!btn.dataset.originalHtml) {
    btn.dataset.originalHtml = btn.innerHTML;
  }

  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Generating PDF...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml;
  }

  return btn.dataset.originalHtml;
}

async function downloadPOPDF(poId, buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to download PDFs', 'error');
      return;
    }

    // Show loading state
    setButtonLoading(buttonEl, true);

    // Fetch PDF
    const response = await fetch(`/pdfs/po/${poId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to generate PDF', 'error');
      return;
    }

    // Create blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PO-${poId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    showToast('PDF downloaded successfully', 'success');
  } catch (error) {
    console.error('Error downloading PDF:', error);
    showToast('Error downloading PDF: ' + error.message, 'error');
  } finally {
    setButtonLoading(buttonEl, false);
  }
}

/**
 * Add PDF action buttons to a table row or element
 * @param {number} poId - Purchase order ID
 * @param {HTMLElement} container - Container element to add buttons to
 */
function addPDFButtons(poId, container) {
  const buttonGroup = document.createElement('div');
  buttonGroup.style.display = 'flex';
  buttonGroup.style.gap = '8px';

  // Download button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-outline-secondary';
  downloadBtn.innerHTML = '<i class="bi bi-download me-1"></i>Download';
  downloadBtn.style.fontSize = '0.85rem';
  downloadBtn.style.padding = '0.4rem 0.8rem';
  downloadBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    downloadPOPDF(poId, downloadBtn);
  };
  buttonGroup.appendChild(downloadBtn);
  container.appendChild(buttonGroup);

  return buttonGroup;
}

/**
 * Create a "Download PDF" button element
 * @param {number} poId - Purchase order ID
 * @param {string} buttonText - Button text (default: "Download PDF")
 * @returns {HTMLElement} Button element
 */
function createPDFButton(poId, buttonText = 'Download PDF') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline-secondary';
  btn.innerHTML = `<i class="bi bi-filetype-pdf me-1"></i>${buttonText}`;
  btn.onclick = (e) => {
    e.preventDefault();
    downloadPOPDF(poId, btn);
  };
  return btn;
}

/**
 * Batch download multiple POs as PDFs
 * @param {number[]} poIds - Array of purchase order IDs
 */
async function downloadMultiplePOs(poIds) {
  if (!poIds || poIds.length === 0) {
    showToast('No purchase orders selected', 'error');
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    showToast('Please log in to download PDFs', 'error');
    return;
  }

  try {
    for (const poId of poIds) {
      // Add delay between downloads to avoid overwhelming the server
      await downloadPOPDF(poId);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Error batch downloading PDFs:', error);
    showToast('Error downloading PDFs: ' + error.message, 'error');
  }
}

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    downloadPOPDF,
    addPDFButtons,
    createPDFButton,
    downloadMultiplePOs
  };
}
