const transporter = require('./emailService');
const inviteHtml = `
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
          
          <!-- Header -->
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #eee;">
              <h2 style="margin:0;color:#c62828;font-weight:600;">
                Castlerock Purchase Order Tracker
              </h2>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px;color:#1c1b1f;font-size:15px;line-height:1.6;">
              <p style="margin-top:0;">
                Hi ${user.first_name},
              </p>

              <p>
                You’ve been invited to access the <strong>Castlerock Purchase Order Tracker</strong>.
              </p>

              <p>
                To get started, please set your password using the button below:
              </p>

              <p style="text-align:center;margin:32px 0;">
                <a href="${resetUrl}"
                   style="
                     display:inline-block;
                     background:#c62828;
                     color:#ffffff;
                     text-decoration:none;
                     padding:12px 22px;
                     border-radius:6px;
                     font-weight:600;
                   ">
                  Set Your Password
                </a>
              </p>

              <p>
                This link will expire in <strong>24 hours</strong>.
              </p>

              <p>
                If you weren’t expecting this invitation, you can safely ignore this email.
              </p>

              <p style="margin-bottom:0;">
                Thanks,<br />
                <strong>Castlerock Homes</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
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


async function sendPasswordSetupEmail(email, token) {
  const resetUrl =
    `https://potracker.blossomhill.ie/reset-password.html?token=${token}`;

  await transporter.sendMail({
    from: '"Castlerock PO Tracker" <castlerockepc@gmail.com>',
  to: user.email,
  subject: 'You’ve been invited to Castlerock PO Tracker',
  html: inviteHtml
  });
}

module.exports = { sendPasswordSetupEmail };
