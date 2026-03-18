const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, query, validationResult } = require('express-validator');
const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect, restrictTo, optionalAuth } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|avi|pdf|doc|docx/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Invalid file type.'));
  }
});

// Helper: create notification
async function createNotification(recipientId, type, title, message, complaintId, complaintRef) {
  try {
    await Notification.create({ recipient: recipientId, type, title, message, complaintId, complaintRef });
  } catch (e) {
    console.error('Notification error:', e.message);
  }
}

// Simple AI urgency detection
function detectUrgency(title, description) {
  const criticalKeywords = ['ragging', 'harassment', 'assault', 'suicide', 'emergency', 'fire', 'flood', 'danger', 'threat', 'violence', 'abuse'];
  const highKeywords = ['broken', 'urgent', 'critical', 'immediate', 'serious', 'major', 'injury'];
  const text = `${title} ${description}`.toLowerCase();
  
  let score = 0;
  let detected = [];
  
  criticalKeywords.forEach(kw => { if (text.includes(kw)) { score += 10; detected.push(kw); } });
  highKeywords.forEach(kw => { if (text.includes(kw)) { score += 3; detected.push(kw); } });

  let suggestedPriority = 'medium';
  if (score >= 10) suggestedPriority = 'critical';
  else if (score >= 6) suggestedPriority = 'high';
  else if (score >= 3) suggestedPriority = 'medium';
  
  return { score, suggestedPriority, keywords: detected };
}

// ─── GET /api/complaints ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status, category, priority, page = 1, limit = 20, search, assignedTo, myComplaints } = req.query;
    const filter = {};

    // Non-admins only see their own or assigned complaints
    if (req.user.role === 'student' || req.user.role === 'faculty') {
      filter.submittedBy = req.user._id;
    } else if (req.user.role === 'maintenance') {
      filter.assignedTo = req.user._id;
    }

    if (myComplaints === 'true') filter.submittedBy = req.user._id;
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { complaintId: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Complaint.countDocuments(filter);
    const complaints = await Complaint.find(filter)
      .populate('submittedBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: complaints,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/complaints ──────────────────────────────────────────────────────
router.post('/', optionalAuth, upload.array('attachments', 5), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').isIn(['infrastructure', 'academic', 'administrative', 'safety', 'maintenance', 'mental_health', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { title, description, category, priority, isAnonymous, location, department, isEmergency } = req.body;

    // AI urgency detection
    const aiResult = detectUrgency(title, description);

    const complaintData = {
      title, description, category,
      priority: priority || aiResult.suggestedPriority,
      isAnonymous: isAnonymous === 'true' || isAnonymous === true,
      department,
      isEmergency: isEmergency === 'true' || isEmergency === true,
      aiUrgencyScore: aiResult.score,
      aiSuggestedCategory: category,
      aiKeywords: aiResult.keywords
    };

    // Location parsing
    if (location) {
      try {
        complaintData.location = typeof location === 'string' ? JSON.parse(location) : location;
      } catch (e) {
        complaintData.location = { description: location };
      }
    }

    // Identity
    if (req.user && !complaintData.isAnonymous) {
      complaintData.submittedBy = req.user._id;
      complaintData.submittedByName = req.user.name;
    } else if (complaintData.isAnonymous) {
      complaintData.anonymousToken = uuidv4();
      if (req.user) complaintData.submittedBy = req.user._id; // Hidden from view
    }

    // Attachments
    if (req.files && req.files.length > 0) {
      complaintData.attachments = req.files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/${f.filename}`
      }));
    }

    // Initial timeline entry
    complaintData.timeline = [{
      action: 'submitted',
      description: 'Complaint submitted',
      performedByName: complaintData.isAnonymous ? 'Anonymous' : complaintData.submittedByName,
      timestamp: new Date()
    }];

    const complaint = await Complaint.create(complaintData);

    // Notify admins of critical/high
    if (['critical', 'high'].includes(complaint.priority) || complaint.isEmergency) {
      const admins = await User.find({ role: 'admin', isActive: true });
      for (const admin of admins) {
        await createNotification(admin._id, 'complaint_submitted',
          `${complaint.priority.toUpperCase()} complaint submitted`,
          `New ${complaint.priority} complaint: "${complaint.title}"`,
          complaint._id, complaint.complaintId
        );
      }
    }

    // Notify submitter
    if (req.user && !complaintData.isAnonymous) {
      await createNotification(req.user._id, 'complaint_submitted',
        'Complaint submitted successfully',
        `Your complaint "${complaint.title}" has been submitted. ID: ${complaint.complaintId}`,
        complaint._id, complaint.complaintId
      );
    }

    res.status(201).json({
      success: true,
      data: complaint,
      anonymousToken: complaint.anonymousToken,
      aiDetection: aiResult
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/complaints/analytics ────────────────────────────────────────────
router.get('/analytics', protect, restrictTo('admin'), async (req, res) => {
  try {
    const [byCategory, byStatus, byPriority, resolutionTimes, monthly] = await Promise.all([
      Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Complaint.aggregate([
        { $match: { status: 'resolved', resolvedAt: { $exists: true } } },
        { $project: { resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] } } },
        { $group: { _id: null, avg: { $avg: '$resolutionTime' }, min: { $min: '$resolutionTime' }, max: { $max: '$resolutionTime' } } }
      ]),
      Complaint.aggregate([
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ])
    ]);

    const total = await Complaint.countDocuments();
    const resolved = await Complaint.countDocuments({ status: 'resolved' });
    const critical = await Complaint.countDocuments({ priority: 'critical', status: { $ne: 'resolved' } });
    const anonymous = await Complaint.countDocuments({ isAnonymous: true });

    res.json({
      success: true,
      data: {
        totals: { total, resolved, critical, anonymous, resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0 },
        byCategory, byStatus, byPriority, monthly,
        avgResolutionTime: resolutionTimes[0] ? Math.round(resolutionTimes[0].avg / (1000 * 60 * 60)) + ' hours' : 'N/A'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/complaints/:id ───────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      $or: [{ _id: req.params.id }, { complaintId: req.params.id }]
    })
      .populate('submittedBy', 'name email role department')
      .populate('assignedTo', 'name email role department')
      .populate('timeline.performedBy', 'name role')
      .populate('comments.author', 'name role');

    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    // Access control
    const isOwner = complaint.submittedBy && complaint.submittedBy._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isAssigned = complaint.assignedTo && complaint.assignedTo._id.toString() === req.user._id.toString();

    if (!isOwner && !isAdmin && !isAssigned) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Mark as viewed
    if (isAdmin && !complaint.viewedByAdmin) {
      complaint.viewedByAdmin = true;
      await complaint.save();
    }

    // Hide submitter identity if anonymous (for non-owners)
    const data = complaint.toObject();
    if (complaint.isAnonymous && !isOwner) {
      delete data.submittedBy;
      data.submittedByName = 'Anonymous';
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/complaints/:id/status ─────────────────────────────────────────
router.patch('/:id/status', protect, restrictTo('admin', 'maintenance'), async (req, res) => {
  try {
    const { status, note } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const prevStatus = complaint.status;
    complaint.status = status;

    if (note) complaint.resolutionNote = note;
    if (status === 'resolved') complaint.resolvedAt = new Date();

    complaint.timeline.push({
      action: 'status_change',
      description: `Status changed from ${prevStatus} to ${status}${note ? ': ' + note : ''}`,
      performedBy: req.user._id,
      performedByName: req.user.name
    });

    await complaint.save();

    // Notify submitter
    if (complaint.submittedBy) {
      await createNotification(complaint.submittedBy, 'status_update',
        'Complaint status updated',
        `Your complaint "${complaint.title}" is now: ${status.replace('_', ' ')}`,
        complaint._id, complaint.complaintId
      );
    }

    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/complaints/:id/assign ─────────────────────────────────────────
router.patch('/:id/assign', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { userId, department } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    let assignee;
    if (userId) {
      assignee = await User.findById(userId);
      if (!assignee) return res.status(404).json({ success: false, message: 'User not found.' });
      complaint.assignedTo = assignee._id;
      complaint.assignedToName = assignee.name;
    }

    if (department) complaint.assignedDepartment = department;
    if (complaint.status === 'submitted') complaint.status = 'under_review';

    complaint.timeline.push({
      action: 'assigned',
      description: `Assigned to ${assignee ? assignee.name : department}`,
      performedBy: req.user._id,
      performedByName: req.user.name
    });

    await complaint.save();

    // Notify assignee
    if (assignee) {
      await createNotification(assignee._id, 'assigned',
        'New complaint assigned to you',
        `Complaint "${complaint.title}" has been assigned to you.`,
        complaint._id, complaint.complaintId
      );
    }

    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/complaints/:id/comment ─────────────────────────────────────────
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text, isInternal } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Comment text required.' });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    // Only admin/maintenance can post internal comments
    const internal = isInternal && ['admin', 'maintenance'].includes(req.user.role);

    complaint.comments.push({
      text,
      author: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      isInternal: internal
    });

    complaint.timeline.push({
      action: 'comment_added',
      description: `Comment added by ${req.user.name}`,
      performedBy: req.user._id,
      performedByName: req.user.name
    });

    await complaint.save();

    // Notify relevant parties
    if (complaint.submittedBy && complaint.submittedBy.toString() !== req.user._id.toString()) {
      await createNotification(complaint.submittedBy, 'comment_added',
        'New comment on your complaint',
        `A comment was added to "${complaint.title}"`,
        complaint._id, complaint.complaintId
      );
    }

    res.json({ success: true, data: complaint.comments[complaint.comments.length - 1] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/complaints/:id/feedback ────────────────────────────────────────
router.post('/:id/feedback', protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    if (complaint.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the submitter can leave feedback.' });
    }

    complaint.feedback = { rating, comment, submittedAt: new Date() };
    await complaint.save();

    res.json({ success: true, message: 'Feedback submitted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/complaints/:id/escalate ────────────────────────────────────────
router.post('/:id/escalate', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    complaint.status = 'escalated';
    complaint.escalationLevel = (complaint.escalationLevel || 0) + 1;
    complaint.escalatedAt = new Date();

    // Bump priority
    const priorities = ['low', 'medium', 'high', 'critical'];
    const currentIdx = priorities.indexOf(complaint.priority);
    if (currentIdx < priorities.length - 1) complaint.priority = priorities[currentIdx + 1];

    complaint.timeline.push({
      action: 'escalated',
      description: `Escalated to level ${complaint.escalationLevel}. Reason: ${reason || 'Not specified'}`,
      performedBy: req.user._id,
      performedByName: req.user.name
    });

    await complaint.save();
    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/complaints/track/:token ─────────────────────────────────────────
// Anonymous tracking
router.get('/track/:token', async (req, res) => {
  try {
    const complaint = await Complaint.findOne({ anonymousToken: req.params.token })
      .select('-submittedBy -anonymousToken');
    if (!complaint) return res.status(404).json({ success: false, message: 'No complaint found with this token.' });
    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
