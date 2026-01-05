const transporter = require('./emailService');

async function sendPasswordSetupEmail(email, token) {
  const resetUrl =
    `https://potracker.blossomhill.ie/reset-password.html?token=${token}`;

  await transporter.sendMail({
    from: '"Castlerock Homes" <no-reply@blossomhill.ie>',
    to: email,
    subject: 'Set your Castlerock PO Tracker password',
    html: `
      <p>You have been added to the Castlerock Purchase Order Tracker.</p>
      <p>Click the link below to set your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    `
  });
}

module.exports = { sendPasswordSetupEmail };
