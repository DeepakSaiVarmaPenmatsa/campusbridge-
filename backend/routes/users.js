const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');

// GET /api/users — Admin: list all users
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const total = await User.countDocuments(filter);
    const users = await User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    res.json({ success: true, data: users, pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/staff — Get maintenance staff for assignment
router.get('/staff', protect, restrictTo('admin'), async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: ['maintenance', 'admin'] }, isActive: true }).select('name email role department');
    res.json({ success: true, data: staff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/users/:id/role — Change user role
router.patch('/:id/role', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['student', 'faculty', 'admin', 'maintenance'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', protect, restrictTo('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
