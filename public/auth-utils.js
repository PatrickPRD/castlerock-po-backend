/**
 * Authentication Utilities
 * Handles token validation and redirects to login on expiration
 */

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists in localStorage
 */
function isAuthenticated() {
  return !!localStorage.getItem("token");
}

/**
 * Get the JWT token from localStorage
 * @returns {string|null} The token or null if not found
 */
function getToken() {
  return localStorage.getItem("token");
}

/**
 * Get the user role from localStorage
 * @returns {string|null} The role or null if not found
 */
function getUserRole() {
  return localStorage.getItem("role");
}

/**
 * Clear authentication data from localStorage
 */
function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
  clearAuth();
  window.location.href = "login.html";
}

/**
 * Make an authenticated API fetch call with automatic error handling
 * @param {string} url - The endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 * @throws Will redirect to login if token is invalid/expired
 */
async function authenticatedFetch(url, options = {}) {
  const token = getToken();
  
  // If no token, redirect to login
  if (!token) {
    redirectToLogin();
    throw new Error("No authentication token found");
  }

  // Merge headers with authorization
  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Check if token is invalid/expired (401 Unauthorized)
  if (response.status === 401) {
    console.warn("Authentication token expired or invalid");
    redirectToLogin();
    throw new Error("Authentication token expired");
  }

  // Return response for caller to handle other status codes
  return response;
}

/**
 * Validate token with the server
 * @returns {Promise<boolean>} True if token is valid, false otherwise
 */
async function validateToken() {
  const token = getToken();
  
  if (!token) {
    return false;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      clearAuth();
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error("Token validation error:", error);
    return false;
  }
}

/**
 * Ensure user is authenticated before loading page
 * Call this at the start of each protected page
 */
async function ensureAuthenticated() {
  if (!isAuthenticated()) {
    redirectToLogin();
    return;
  }

  // Optional: Validate token with server on page load
  // Uncomment if you want to validate every page load
  // const isValid = await validateToken();
  // if (!isValid) {
  //   redirectToLogin();
  // }
}
