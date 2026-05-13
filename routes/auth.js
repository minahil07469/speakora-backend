const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const nodemailer   = require('nodemailer');
const User         = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

// Nodemailer transporter — Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/signup
// Body: { name, email, password }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name = '', email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'An account already exists with this email.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user   = new User({ name: name.trim(), email: email.toLowerCase(), password: hashed });
    await user.save();

    res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    console.error('[signup]', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }
// Returns: { token, name, email }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'No account found with this email.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, name: user.name, email: user.email });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// Header: Authorization: Bearer <token>
// Body: { email, currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[change-password]', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { email }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'No account found with this email.' });
    }

    // Generate 8-character random reset code
    const code = Math.random().toString(36).substring(2, 6).toUpperCase() +
                 Math.random().toString(36).substring(2, 6).toUpperCase();

    // Save code and expiry on user
    user.resetCode       = code;
    user.resetCodeExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send email
    await transporter.sendMail({
      from:    `"Speakora Support" <${process.env.GMAIL_USER}>`,
      to:      user.email,
      subject: 'Password Reset — Speakora',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#5300AC">Reset your password</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>We received a request to reset your Speakora password.</p>
          <p>Your reset code (valid for 1 hour):</p>
          <div style="background:#F3E8FF;padding:24px;border-radius:8px;
                      font-size:28px;font-weight:bold;color:#290451;
                      letter-spacing:6px;text-align:center">
            ${code}
          </div>
          <p>Enter this code in the app to reset your password.</p>
          <p style="color:#888;font-size:12px;margin-top:24px">
            If you did not request this, ignore this email.
          </p>
        </div>
      `,
    });

    res.json({ message: 'Reset code sent to your email.' });
  } catch (err) {
    console.error('[forgot-password]', err.message);
    res.status(500).json({ message: 'Failed to send email. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { email, code, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'No account found with this email.' });
    }

    // Verify code
    if (!user.resetCode || user.resetCode !== code.toUpperCase()) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    // Check expiry
    if (!user.resetCodeExpiry || user.resetCodeExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    // Update password
    user.password        = await bcrypt.hash(newPassword, 10);
    user.resetCode       = undefined;
    user.resetCodeExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
