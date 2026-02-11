/**
 * Setup Wizard - Frontend JavaScript
 * Handles multi-step form navigation and submission
 */

const setupForm = document.getElementById('setupForm');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const loadingSpinner = document.getElementById('loadingSpinner');

let currentStep = 1;
const totalSteps = 5;

/**
 * Initialize the wizard
 */
function initWizard() {
  showStep(1);
  setupEventListeners();
  setupColorPickers();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  prevBtn.addEventListener('click', previousStep);
  nextBtn.addEventListener('click', nextStep);
  setupForm.addEventListener('submit', (e) => e.preventDefault());

  // Allow Enter key to go to next step
  setupForm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && currentStep < totalSteps) {
      nextStep();
    }
  });
}

/**
 * Setup color pickers to sync with hex inputs
 */
function setupColorPickers() {
  const headerColor = document.getElementById('headerColor');
  const headerColorHex = document.getElementById('headerColorHex');
  const accentColor = document.getElementById('accentColor');
  const accentColorHex = document.getElementById('accentColorHex');

  // Header color
  if (headerColor && headerColorHex) {
    headerColor.addEventListener('change', (e) => {
      headerColorHex.value = e.target.value;
    });
    headerColorHex.addEventListener('change', (e) => {
      if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
        headerColor.value = e.target.value;
      }
    });
  }

  // Accent color
  if (accentColor && accentColorHex) {
    accentColor.addEventListener('change', (e) => {
      accentColorHex.value = e.target.value;
    });
    accentColorHex.addEventListener('change', (e) => {
      if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
        accentColor.value = e.target.value;
      }
    });
  }
}

/**
 * Show a specific step
 */
function showStep(step) {
  // Hide all steps
  document.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.remove('active');
  });

  // Show current step
  const stepElement = document.getElementById(`step${step}`);
  if (stepElement) {
    stepElement.classList.add('active');
  }

  // Update button states
  prevBtn.classList.toggle('d-none', step === 1);
  
  if (step === totalSteps) {
    nextBtn.textContent = '✓ Complete Setup';
    nextBtn.classList.add('btn-primary-setup');
  } else {
    nextBtn.textContent = 'Next →';
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Validate current step
 */
function validateStep(step) {
  const inputs = document.querySelectorAll(`#step${step} input[required], #step${step} textarea[required]`);
  let isValid = true;
  let missingFields = [];

  inputs.forEach((input) => {
    if (!input.value.trim()) {
      isValid = false;
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        missingFields.push(label.textContent.replace('*', '').trim());
      }
    }
  });

  // Special validation for step 1 (passwords)
  if (step === 1) {
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    const email = document.getElementById('adminEmail').value;

    if (password !== passwordConfirm) {
      showError('Passwords do not match');
      return false;
    }

    if (password.length < 8) {
      showError('Password must be at least 8 characters long');
      return false;
    }

    if (!email.includes('@')) {
      showError('Please enter a valid email address');
      return false;
    }
  }

  if (!isValid) {
    showError(`Please fill in all required fields: ${missingFields.join(', ')}`);
    return false;
  }

  hideError();
  return true;
}

/**
 * Go to next step
 */
function nextStep() {
  if (!validateStep(currentStep)) {
    return;
  }

  if (currentStep === totalSteps) {
    completeSetup();
  } else {
    currentStep++;
    showStep(currentStep);
  }
}

/**
 * Go to previous step
 */
function previousStep() {
  if (currentStep > 1) {
    currentStep--;
    showStep(currentStep);
  }
}

/**
 * Complete the setup
 */
async function completeSetup() {
  if (!validateStep(totalSteps)) {
    return;
  }

  // Show loading state
  setupForm.style.display = 'none';
  document.querySelector('.setup-actions').style.display = 'none';
  loadingSpinner.style.display = 'block';

  try {
    const setupData = {
      admin: {
        first_name: document.getElementById('adminFirstName').value,
        last_name: document.getElementById('adminLastName').value,
        email: document.getElementById('adminEmail').value,
        password: document.getElementById('adminPassword').value
      },
      site: {
        name: document.getElementById('siteName').value,
        description: document.getElementById('siteDescription').value
      },
      location: {
        name: document.getElementById('locationName').value,
        address: document.getElementById('locationAddress').value,
        description: document.getElementById('locationDescription').value
      },
      stage: {
        name: document.getElementById('stageName').value
      },
      worker: {
        first_name: document.getElementById('workerFirstName').value,
        last_name: document.getElementById('workerLastName').value,
        email: document.getElementById('workerEmail').value || null,
        phone: document.getElementById('workerPhone').value || null
      },
      settings: {
        company_name: document.getElementById('companyName').value,
        header_color: document.getElementById('headerColor').value,
        accent_color: document.getElementById('accentColor').value
      }
    };

    const response = await fetch('/setup-wizard/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(setupData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Setup failed');
    }

    // Show success message
    setupForm.style.display = 'none';
    loadingSpinner.style.display = 'none';
    successMessage.style.display = 'block';

    // Redirect to login/dashboard after 2 seconds
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 2000);
  } catch (error) {
    console.error('Setup error:', error);
    loadingSpinner.style.display = 'none';
    setupForm.style.display = 'block';
    document.querySelector('.setup-actions').style.display = 'flex';
    showError(error.message);
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = '❌ ' + message;
  errorMessage.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.style.display = 'none';
  errorMessage.textContent = '';
}

// Initialize wizard when DOM is loaded
document.addEventListener('DOMContentLoaded', initWizard);
