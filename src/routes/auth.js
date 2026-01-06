const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const createTransporter = require('../services/emailService');



router.get('/test-email', async (req, res) => {
  try {
    const transporter = createTransporter();
await transporter.sendMail({

      from: `"Castlerock Homes" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject: 'Email Test',
      html: '<p>If you received this, email is working.</p>'
    });

    res.send('Email sent');
  } catch (err) {
    console.error(err);
    res.status(500).send('Email failed');
  }
});







/* ======================================================
   REQUEST PASSWORD RESET / INVITE
   ====================================================== */
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;

  const [[user]] = await pool.query(
    'SELECT id FROM users WHERE email=? AND active=1',
    [email]
  );

  if (!user) {
    // Do NOT reveal whether email exists
    return res.json({ success: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await pool.query(
    `
    UPDATE users
    SET reset_token=?, reset_token_expires=?
    WHERE id=?
    `,
    [token, expires, user.id]
  );

  const link = `${process.env.APP_URL}/reset-password.html?token=${token}`;


 try {
  const { sendPasswordSetupEmail } = require('../services/userEmailService');

await sendPasswordSetupEmail(user, token);

} catch (err) {
  console.error('❌ EMAIL SEND FAILED:', err);
  return res.status(500).json({ error: 'Email failed to send' });
}


  res.json({ success: true });
});

/* ======================================================
   RESET PASSWORD
   ====================================================== */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  const [[user]] = await pool.query(
    `
    SELECT id FROM users
    WHERE reset_token=? AND reset_token_expires > NOW()
    `,
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }

  const hash = await bcrypt.hash(password, 12);

  await pool.query(
    `
    UPDATE users
    SET password_hash=?, reset_token=NULL, reset_token_expires=NULL
    WHERE id=?
    `,
    [hash, user.id]
  );

  res.json({ success: true });
});


const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [[user]] = await pool.query(
      `
      SELECT
        id,
        email,
        password_hash,
        role,
        active
      FROM users
      WHERE email = ?
      `,
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      role: user.role
    });

  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});





module.exports = router;
