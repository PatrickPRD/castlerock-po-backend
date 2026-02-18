const { sendEmail } = require('./sesEmailService');
const SettingsService = require('./settingsService');

function buildInviteEmail({ firstName, resetUrl, branding = {} }) {
  const headerColor = branding.header_color || '#212529';
  const companyName = branding.header_logo_text || 'Castlerock Homes';
  const logoUrl = branding.logo_path ? `<img src="${branding.logo_path}" alt="${companyName}" style="max-height:40px;margin-bottom:12px;">` : '';
  const buttonColor = branding.accent_color || headerColor;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Segoe UI, Roboto, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #eee;background:${headerColor};text-align:center;">
              ${logoUrl}
              <h2 style="margin:0;color:#ffffff;font-weight:600;font-size:18px;">
                ${companyName} - Purchase Order Tracker
              </h2>
            </td>
          </tr>

          <tr>
            <td style="padding:28px;color:#1c1b1f;font-size:15px;line-height:1.6;">
              <p>Hi ${firstName},</p>

              <p>
                You’ve been invited to access the
                <strong>${companyName} Purchase Order Tracker</strong>.
              </p>

              <p>
                To get started, please set your password using the button below:
              </p>

              <p style="text-align:center;margin:32px 0;">
                <a href="${resetUrl}"
                   style="
                     display:inline-block;
                     background:${buttonColor};
                     color:#ffffff;
                     text-decoration:none;
                     padding:12px 24px;
                     border-radius:6px;
                     font-weight:600;
                   ">
                  Set Your Password
                </a>
              </p>

              <p>This link will expire in <strong>6 hours</strong>.</p>

              <p>
                If you weren’t expecting this invitation, you can safely ignore this email.
              </p>

              <p>
                Thanks,<br />
                <strong>${companyName}</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px;font-size:12px;color:#6f6f6f;border-top:1px solid #eee;">
              This is an automated message — please do not reply.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

async function sendPasswordSetupEmail(user, token) {
  const appBaseUrl = process.env.APP_BASE_URL || 'https://potracker.blossomhill.ie';
  const resetUrl = `${appBaseUrl}/reset-password.html?token=${token}`;

  // Fetch site branding settings
  let branding = {};
  try {
    branding = await SettingsService.getSettings() || {};
  } catch (err) {
    console.error('Failed to fetch branding settings:', err);
    // Use defaults if fetch fails
  }

  const companyName = branding.header_logo_text || 'Castlerock Homes';

  const html = buildInviteEmail({
    firstName: user.first_name,
    resetUrl,
    branding
  });

  await sendEmail({
    to: user.email,
    subject: `You've been invited to ${companyName} PO Tracker`,
    html
  });
}

module.exports = { sendPasswordSetupEmail };
