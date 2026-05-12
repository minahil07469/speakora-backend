const express        = require('express');
const router         = express.Router();
const SupportMessage = require('../models/SupportMessage');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/support/message
// Body: { name, email, message }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email and message are required.' });
    }

    const msg = new SupportMessage({
      name:    name.trim(),
      email:   email.trim().toLowerCase(),
      message: message.trim(),
    });
    await msg.save();

    res.status(201).json({ message: 'Message received. We will get back to you within 24 hours.' });
  } catch (err) {
    console.error('[support/message]', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
