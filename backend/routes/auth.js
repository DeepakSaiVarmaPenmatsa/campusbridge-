const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Generate JWT
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['student', 'faculty', 'admin', 'maintenance'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role, department, rollNumber, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password, role: role || 'student', department, rollNumber, phone });
    const token = signToken(user._id);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account is deactivated.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// PATCH /api/auth/update-profile
router.patch('/update-profile', protect, async (req, res) => {
  try {
    const { name, phone, department, notificationPreferences } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, department, notificationPreferences },
      { new: true, runValidators: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/auth/change-password
router.patch('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
