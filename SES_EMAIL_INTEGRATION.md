# AWS SES Email Integration Implementation

## Overview
Successfully integrated AWS SES (Simple Email Service) into the Castlerock PO Backend system. New users are now automatically sent a welcome email with a password setup link, and admins can trigger password reset emails from the user management interface.

## Changes Made

### 1. New Email Service Module
**File:** `src/services/sesEmailService.js` (Created)
- AWS SES transporter creation using IAM role attached to EC2 instance
- `sendEmail()` function for sending HTML emails via AWS SES
- No credentials needed in code - uses EC2 IAM role for authentication

### 2. Updated User Email Service
**File:** `src/services/userEmailService.js` (Modified)
- Replaced Nodemailer SMTP with AWS SES
- Updated to import `sendEmail` from `sesEmailService`
- Uses `APP_BASE_URL` environment variable for constructing password reset links
- Email template remains the same with improved URL handling

### 3. User Creation Flow
**File:** `src/routes/admin.js` (Modified)
- Removed password requirement from user creation
- Users now created with empty password hash
- Password reset token automatically generated
- Welcome email automatically sent to new users
- Added new endpoint: `POST /admin/users/:id/reset-password`
  - Allows admins to trigger password reset email for existing users
  - Generates new token and sends email non-blocking

### 4. User Management Forms
**File:** `src/views/users.ejs` (Modified)
- **Add User Modal:**
  - Removed password input field
  - Removed "Email Login Details" button
  - Form now only requires: First Name, Last Name, Email, Role
  
- **Edit User Modal:**
  - Removed password input field
  - Removed "Email Login Details" button
  - Added "Reset Password" button to trigger password email
  - Form now only requires: First Name, Last Name, Role, Status

### 5. User Management JavaScript
**File:** `public/users.js` (Modified)
- `addUser()` - Removed password validation
- `resetAddForm()` - Removed password field reset
- `resetEditForm()` - Removed password field reset
- `saveEditUser()` - Removed password payload handling
- `resetPassword()` - New function for admin-triggered password reset
- Removed obsolete functions:
  - `sendLoginEmail()`
  - `sendInvite()`
  - `buildEmailText()`
  - `updateEmailButtonsState()`
- Removed password field event listeners

### 6. Environment Configuration
**File:** `.env.example` (Modified)
- Added AWS SES configuration variables:
  - `AWS_REGION` - AWS region for SES (e.g., eu-west-1)
  - `SES_FROM_EMAIL` - Verified sender email address
  - `APP_BASE_URL` - Application base URL for email links
- Removed old SMTP email configuration

### 7. Dependencies
**File:** `package.json` (Modified)
- Added `aws-sdk` ^2.1545.0 for AWS SES integration

### 8. Auth Routes
**File:** `src/routes/auth.js` (Minor cleanup)
- Cleaned up unused `APP_URL` reference
- Already uses `sendPasswordSetupEmail` from userEmailService

## Environment Variables Required

```env
# AWS Configuration
AWS_REGION=eu-west-1                           # AWS region for SES
SES_FROM_EMAIL=your-verified-email@example.com # Verified sender email
APP_BASE_URL=http://localhost:3000             # Base URL for email links
```

## User Flow

### New User Creation (Admin)
1. Admin fills form: First Name, Last Name, Email, Role
2. System creates user with empty password hash
3. System generates password reset token (1 hour expiry)
4. Welcome email automatically sent with password setup link
5. User receives email with "Set Your Password" button
6. User clicks link and sets password via reset-password.html

### Password Reset (Admin)
1. Admin opens user in edit modal
2. Admin clicks "Reset Password" button
3. Confirmation dialog appears
4. System generates new reset token
5. Password reset email sent to user
6. User follows same flow as new user

## Security Notes

✅ **IAM Role Authentication:** Uses EC2 instance IAM role - no credentials in code
✅ **Token Expiry:** Password reset tokens expire after 1 hour
✅ **Email Verification:** SES requires verified sender email address
✅ **No Password in Email:** Password not sent via email, only setup link
✅ **Audit Logging:** Actions logged in audit trail

## EC2 Deployment Requirements

1. **SES Verification:**
   ```bash
   # Verify sender email in AWS SES Console
   # Send test email to recipients if in sandbox mode
   ```

2. **IAM Role Policy:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ses:SendEmail",
         "Resource": "*"
       }
     ]
   }
   ```

3. **Environment Variables:**
   Set in `.env` file on EC2:
   ```
   AWS_REGION=eu-west-1
   SES_FROM_EMAIL=verified-email@example.com
   APP_BASE_URL=https://your-domain.com
   ```

## Testing Locally

1. Update `.env`:
   ```env
   AWS_REGION=eu-west-1
   SES_FROM_EMAIL=test@example.com
   APP_BASE_URL=http://localhost:3000
   ```

2. Note: Local testing requires:
   - AWS credentials configured (via ~/.aws/credentials or environment variables)
   - SES restricted to sandbox (requires both sender and recipient verified)

3. Install dependencies:
   ```bash
   npm install
   ```

## Rollback Plan

If issues occur:

1. **SMTP Fallback:** Old `emailService.js` still exists, can revert `userEmailService.js`
2. **User Creation:** Still creates users normally, just without email
3. **Password Reset Endpoint:** Still works via `/auth/request-reset`

## Future Enhancements

- [ ] Email templates customization via database
- [ ] Email retry mechanism for failed sends
- [ ] Email delivery tracking via SES notifications
- [ ] Template variables for company name, logo, etc.
- [ ] Bulk user import with email sending

