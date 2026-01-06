const nodemailer = require('nodemailer');

function createTransporter() {
  if (!process.env.SMTP_HOST) {
    throw new Error('SMTP_HOST is not set');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // TLS for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

module.exports = createTransporter;
