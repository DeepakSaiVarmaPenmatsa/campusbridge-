require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Auto-escalation cron (runs every 30 minutes) ───────────────────────────────
const Complaint = require('./models/Complaint');
const Notification = require('./models/Notification');
const User = require('./models/User');

async function runAutoEscalation() {
  try {
    const now = new Date();
    const escalationHours = {
      low: parseInt(process.env.ESCALATION_LOW) || 72,
      medium: parseInt(process.env.ESCALATION_MEDIUM) || 48,
      high: parseInt(process.env.ESCALATION_HIGH) || 24,
      critical: parseInt(process.env.ESCALATION_CRITICAL) || 6
    };

    const activeStatuses = ['submitted', 'under_review', 'in_progress'];

    for (const [priority, hours] of Object.entries(escalationHours)) {
      const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const overdue = await Complaint.find({
        priority,
        status: { $in: activeStatuses },
        createdAt: { $lt: cutoff },
        escalationLevel: { $lt: 3 }
      });

      for (const complaint of overdue) {
        complaint.escalationLevel = (complaint.escalationLevel || 0) + 1;
        complaint.escalatedAt = now;
        if (complaint.status !== 'escalated') complaint.status = 'escalated';

        const priorities = ['low', 'medium', 'high', 'critical'];
        const idx = priorities.indexOf(complaint.priority);
        if (idx < priorities.length - 1) complaint.priority = priorities[idx + 1];

        complaint.timeline.push({
          action: 'auto_escalated',
          description: `Auto-escalated after ${hours}h without resolution`,
          performedByName: 'System',
          timestamp: now
        });

        await complaint.save();

        // Notify admins
        const admins = await User.find({ role: 'admin', isActive: true });
        for (const admin of admins) {
          await Notification.create({
            recipient: admin._id,
            type: 'escalation',
            title: 'Auto-escalation triggered',
            message: `Complaint "${complaint.title}" auto-escalated after ${hours}h`,
            complaintId: complaint._id,
            complaintRef: complaint.complaintId
          });
        }
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[AutoEscalation] Ran at ${now.toISOString()}`);
    }
  } catch (err) {
    console.error('[AutoEscalation] Error:', err.message);
  }
}

// Run escalation check every 30 minutes
setInterval(runAutoEscalation, 30 * 60 * 1000);

// ── MongoDB + Seed ─────────────────────────────────────────────────────────────
async function seedDatabase() {
  const userCount = await User.countDocuments();
  if (userCount > 0) return;

  console.log('Seeding demo data...');
  const bcrypt = require('bcryptjs');

  const users = await User.insertMany([
    { name: 'Admin User', email: 'admin@campus.edu', password: await bcrypt.hash('admin123', 12), role: 'admin', department: 'Administration' },
    { name: 'Riya Sharma', email: 'riya@campus.edu', password: await bcrypt.hash('student123', 12), role: 'student', department: 'Computer Science', rollNumber: 'CS2021001' },
    { name: 'Arjun Mehta', email: 'arjun@campus.edu', password: await bcrypt.hash('student123', 12), role: 'student', department: 'Electronics', rollNumber: 'EC2021042' },
    { name: 'Dr. Priya Nair', email: 'priya.faculty@campus.edu', password: await bcrypt.hash('faculty123', 12), role: 'faculty', department: 'Computer Science' },
    { name: 'Ramesh Kumar', email: 'ramesh@campus.edu', password: await bcrypt.hash('maint123', 12), role: 'maintenance', department: 'Facilities' }
  ]);

  const [admin, riya, arjun, faculty, maint] = users;

  await Complaint.insertMany([
    {
      complaintId: 'CB-291',
      title: 'Broken AC in Lab 4 – Block A',
      description: 'The air conditioning unit in Lab 4 has been non-functional since Monday. Temperature is very high, affecting students during practicals.',
      category: 'infrastructure', priority: 'high', status: 'in_progress',
      submittedBy: riya._id, submittedByName: riya.name,
      location: { building: 'Block A', floor: '2nd Floor', room: 'Lab 4' },
      department: 'Facilities', assignedTo: maint._id, assignedToName: maint.name,
      timeline: [
        { action: 'submitted', description: 'Complaint submitted', performedByName: riya.name, timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { action: 'assigned', description: 'Assigned to Ramesh Kumar', performedByName: admin.name, timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
      ]
    },
    {
      complaintId: 'CB-290',
      title: 'Ragging incident reported – Hostel Block C',
      description: 'I witnessed senior students ragging juniors near Block C hostel corridor at night. This needs immediate attention.',
      category: 'safety', priority: 'critical', status: 'submitted',
      isAnonymous: true, anonymousToken: 'demo-anon-token-123',
      location: { building: 'Hostel Block C', description: 'Near corridor, ground floor' },
      department: 'Administration', isEmergency: true,
      timeline: [{ action: 'submitted', description: 'Anonymous complaint submitted', performedByName: 'Anonymous', timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000) }]
    },
    {
      complaintId: 'CB-289',
      title: 'Grade dispute – CS301 Mid-term',
      description: 'My mid-term paper for CS301 has been incorrectly evaluated. I believe I deserve at least 8 more marks based on the model answer.',
      category: 'academic', priority: 'medium', status: 'in_progress',
      submittedBy: arjun._id, submittedByName: arjun.name,
      department: 'Computer Science', assignedTo: faculty._id, assignedToName: faculty.name,
      timeline: [{ action: 'submitted', description: 'Complaint submitted', performedByName: arjun.name, timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }]
    },
    {
      complaintId: 'CB-288',
      title: 'Water leakage – Hostel B2 bathroom',
      description: 'Severe water leakage in Hostel B2 ground floor bathroom. Floor is always wet and slippery.',
      category: 'maintenance', priority: 'high', status: 'resolved',
      submittedBy: riya._id, submittedByName: riya.name,
      resolvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      assignedTo: maint._id, assignedToName: maint.name,
      feedback: { rating: 4, comment: 'Fixed quickly, good work!', submittedAt: new Date() },
      timeline: [
        { action: 'submitted', description: 'Complaint submitted', performedByName: riya.name, timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { action: 'status_change', description: 'Status changed to resolved', performedByName: maint.name, timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }
      ]
    },
    {
      complaintId: 'CB-287',
      title: 'Internet outage – Central Library',
      description: 'No internet connectivity in the central library for the past 2 days. Students unable to access online resources.',
      category: 'infrastructure', priority: 'medium', status: 'resolved',
      submittedBy: arjun._id, submittedByName: arjun.name,
      resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      timeline: [{ action: 'submitted', description: 'Complaint submitted', performedByName: arjun.name, timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }]
    }
  ]);

  console.log('Demo data seeded successfully!');
  console.log('Demo accounts:');
  console.log('  Admin:       admin@campus.edu      / admin123');
  console.log('  Student:     riya@campus.edu        / student123');
  console.log('  Student:     arjun@campus.edu       / student123');
  console.log('  Faculty:     priya.faculty@campus.edu / faculty123');
  console.log('  Maintenance: ramesh@campus.edu      / maint123');
}

// ── Start ──────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    await seedDatabase();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`CampusBridge API running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
