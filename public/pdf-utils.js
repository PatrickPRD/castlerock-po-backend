/**
 * PDF Utilities - Browser-based PDF Generation using PDFKit
 * Replaces server-side Puppeteer generation to reduce RAM usage on EC2
 * Can be included in any page that needs PDF functionality
 * 
 * Usage: 
 * <script src="/pdfkit-generator.js"></script>
 * <script src="/pdf-utils.js"></script>
 */

/**
 * Set button loading state
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

/**
 * Download a PO as PDF (browser-based generation)
 * @param {number} poId - Purchase order ID
 * @param {HTMLElement} buttonEl - Button element for loading state
 */
async function downloadPOPDF(poId, buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to download PDFs', 'error');
      return;
    }

    // Show loading state
    setButtonLoading(buttonEl, true);

    // Ensure PDFKit libraries are loaded
    if (typeof loadPDFKitLibraries === 'function') {
      await loadPDFKitLibraries();
    }

    // Fetch PO data from new /pdf-data endpoint
    const response = await fetch(`/pdf-data/po/${poId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to fetch PO data', 'error');
      return;
    }

    const { poData, invoices, settings } = await response.json();

    // Generate PDF using browser-based PDFKit
    if (typeof generatePOPDF === 'function') {
      await generatePOPDF(poData, invoices, settings, 'download');
      showToast('PDF downloaded successfully', 'success');
    } else {
      throw new Error('PDFKit generator not loaded. Please include pdfkit-generator.js');
    }
  } catch (error) {
    console.error('Error downloading PDF:', error);
    showToast('Error downloading PDF: ' + error.message, 'error');
  } finally {
    setButtonLoading(buttonEl, false);
  }
}

/**
 * View a PO as PDF in new window (browser-based generation)
 * @param {number} poId - Purchase order ID
 * @param {HTMLElement} buttonEl - Button element for loading state
 */
async function viewPOPDF(poId, buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to view PDFs', 'error');
      return;
    }

    // Show loading state
    setButtonLoading(buttonEl, true);

    // Ensure PDFKit libraries are loaded
    if (typeof loadPDFKitLibraries === 'function') {
      await loadPDFKitLibraries();
    }

    // Fetch PO data
    const response = await fetch(`/pdf-data/po/${poId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to fetch PO data', 'error');
      return;
    }

    const { poData, invoices, settings } = await response.json();

    // Generate and view PDF
    if (typeof generatePOPDF === 'function') {
      await generatePOPDF(poData, invoices, settings, 'view');
    } else {
      throw new Error('PDFKit generator not loaded. Please include pdfkit-generator.js');
    }
  } catch (error) {
    console.error('Error viewing PDF:', error);
    showToast('Error viewing PDF: ' + error.message, 'error');
  } finally {
    setButtonLoading(buttonEl, false);
  }
}

/**
 * Download worker PDF
 * @param {number} workerId - Worker ID
 * @param {HTMLElement} buttonEl - Button element for loading state
 */
async function downloadWorkerPDF(workerId, buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to download PDFs', 'error');
      return;
    }

    setButtonLoading(buttonEl, true);

    if (typeof loadPDFKitLibraries === 'function') {
      await loadPDFKitLibraries();
    }

    const response = await fetch(`/pdf-data/worker/${workerId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to fetch worker data', 'error');
      return;
    }

    const { workerData, leaveSummary, settings } = await response.json();

    if (typeof generateWorkerPDF === 'function') {
      await generateWorkerPDF(workerData, leaveSummary, settings, 'download');
      showToast('PDF downloaded successfully', 'success');
    } else {
      throw new Error('PDFKit generator not loaded. Please include pdfkit-generator.js');
    }
  } catch (error) {
    console.error('Error downloading worker PDF:', error);
    showToast('Error downloading PDF: ' + error.message, 'error');
  } finally {
    setButtonLoading(buttonEl, false);
  }
}

/**
 * Download blank worker form PDF
 * @param {HTMLElement} buttonEl - Button element for loading state
 */
async function downloadBlankWorkerPDF(buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to download PDFs', 'error');
      return;
    }

    setButtonLoading(buttonEl, true);

    if (typeof loadPDFKitLibraries === 'function') {
      await loadPDFKitLibraries();
    }

    const response = await fetch('/pdf-data/worker-blank', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to fetch data', 'error');
      return;
    }

    const { workerData, leaveSummary, settings } = await response.json();

    if (typeof generateWorkerPDF === 'function') {
      await generateWorkerPDF(workerData || {}, leaveSummary, settings, 'download');
      showToast('PDF downloaded successfully', 'success');
    } else {
      throw new Error('PDFKit generator not loaded. Please include pdfkit-generator.js');
    }
  } catch (error) {
    console.error('Error downloading blank worker PDF:', error);
    showToast('Error downloading PDF: ' + error.message, 'error');
  } finally {
    setButtonLoading(buttonEl, false);
  }
}

/**
 * Download GDPR privacy notice PDF
 * @param {HTMLElement} buttonEl - Button element for loading state
 */
async function downloadGDPRPDF(buttonEl) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Please log in to download PDFs', 'error');
      return;
    }

    setButtonLoading(buttonEl, true);

    if (typeof loadPDFKitLibraries === 'function') {
      await loadPDFKitLibraries();
    }

    const response = await fetch('/pdf-data/gdpr', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.error || 'Failed to fetch data', 'error');
      return;
    }

    const { settings } = await response.json();

    if (typeof generateGDPRPDF === 'function') {
      await generateGDPRPDF(settings, 'download');
      showToast('PDF downloaded successfully', 'success');
    } else {
      throw new Error('PDFKit generator not loaded. Please include pdfkit-generator.js');
    }
  } catch (error) {
    console.error('Error downloading GDPR PDF:', error);
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

  // View button
  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-outline-secondary';
  viewBtn.innerHTML = '<i class="bi bi-eye me-1"></i>View';
  viewBtn.style.fontSize = '0.85rem';
  viewBtn.style.padding = '0.4rem 0.8rem';
  viewBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    viewPOPDF(poId, viewBtn);
  };
  buttonGroup.appendChild(viewBtn);

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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay for client-side generation
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
    viewPOPDF,
    downloadWorkerPDF,
    downloadBlankWorkerPDF,
    downloadGDPRPDF,
    addPDFButtons,
    createPDFButton,
    downloadMultiplePOs
  };
}
