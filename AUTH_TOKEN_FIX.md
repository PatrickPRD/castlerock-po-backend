# Authentication Token Expiration Fix - Implementation Summary

## Problem
When a JWT token expired, users loading protected pages (like dashboard.html) would see empty data with no indication that they needed to log in again. The app didn't handle 401 Unauthorized responses from the API.

## Solution
Implemented comprehensive token validation and authentication error handling across the application.

## Changes Made

### 1. Created Auth Utilities Library (`public/auth-utils.js`)
A centralized authentication utility library providing:
- `isAuthenticated()` - Check if token exists
- `getToken()` - Retrieve JWT token
- `getUserRole()` - Get user role
- `clearAuth()` - Clear all auth data
- `redirectToLogin()` - Redirect to login page and clear auth
- `authenticatedFetch()` - Enhanced fetch wrapper that:
  - Automatically adds Bearer token to Authorization header
  - Intercepts 401 responses and redirects to login
  - Clears stored credentials on expiration
- `validateToken()` - Server-side token validation endpoint
- `ensureAuthenticated()` - Guard function to check auth on page load

### 2. Updated Footer Template (`src/views/partials/footer.ejs`)
Added `auth-utils.js` to the script list so it loads on all pages before other scripts.

### 3. Updated Protected Pages
Added `ensureAuthenticated()` call to the top of all protected page scripts:
- `public/dashboard.js`
- `public/audit-log.js`
- `public/suppliers.js`
- `public/users.js`
- `public/invoice-entry.js`
- `public/locations.js`
- `public/sites.js`
- `public/edit-supplier.js`
- `public/edit-user.js`
- `public/timesheets.js`
- `public/labour-costs.js`

### 4. Updated API Calls
Replaced all `fetch()` calls with `authenticatedFetch()` in critical pages:

#### Dashboard (`public/dashboard.js`)
- `loadPOs()` - Main PO loading function
- `ensureVatRates()` - VAT settings loading
- `fetchLineItemSuggestions()` - Line item search
- `loadPOSuppliers()` - Supplier loading
- `loadPOSites()` - Site loading
- `loadPOStages()` - Stage loading
- `loadEditPO*()` - Edit form data loading
- `deletePO()` - Delete operation
- `editPO()` - Load PO for editing
- Create/Update PO form submissions

#### Invoice Entry (`public/invoice-entry.js`)
- `loadVatRates()` - VAT settings
- `loadPO()` - Load PO data
- Invoice form submission and deletion

#### Audit Log (`public/audit-log.js`)
- Centralized `api()` helper function

#### Suppliers (`public/suppliers.js`)
- Centralized `api()` helper function

#### Users (`public/users.js`)
- Centralized `api()` helper function

### 5. Removed Direct Token Passing
Removed manual `Authorization: 'Bearer ' + token` headers from all fetch calls since `authenticatedFetch()` handles this automatically.

## How It Works

1. **On Page Load**: When a protected page loads, `ensureAuthenticated()` checks if a token exists in localStorage. If not, it immediately redirects to login.html.

2. **During API Calls**: All API calls use `authenticatedFetch()` which:
   - Automatically adds the Bearer token to the Authorization header
   - Checks the response status code
   - If 401 (Unauthorized) is received:
     - Clears stored auth data (token, role, userId, userEmail)
     - Redirects user to login.html
     - The user will see the login page instead of blank/empty data

3. **Error Handling**: Each API call includes proper error handling with user-facing toast notifications for failures.

## User Experience Improvements

**Before:**
- Load dashboard.html with expired token
- See blank data table with no message
- No indication of authentication issue

**After:**
- Load dashboard.html with expired token
- Automatically redirected to login.html
- Clear message to re-enter credentials
- On any subsequent request with expired token, immediately redirected to login

## Testing the Fix

1. Log in normally - token is stored in localStorage
2. Wait for token to expire (or manually clear localStorage: `localStorage.removeItem('token')`)
3. Try loading dashboard.html or other protected pages
4. System will redirect you to login.html automatically

## Backend Endpoint Requirements

The solution assumes the following backend endpoints exist (already in your code):
- `POST /api/auth/login` - Login and return JWT token
- `/purchase-orders` - Requires valid Bearer token
- `/suppliers` - Requires valid Bearer token
- Other protected endpoints that return 401 for invalid tokens

All endpoints should return 401 Unauthorized when the token is expired or invalid.
