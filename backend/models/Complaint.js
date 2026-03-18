const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const timelineEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  description: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorName: { type: String },
  authorRole: { type: String },
  isInternal: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const complaintSchema = new mongoose.Schema({
  complaintId: {
    type: String,
    unique: true,
    default: () => 'CB-' + Math.floor(100 + Math.random() * 900) + '-' + Date.now().toString().slice(-4)
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['infrastructure', 'academic', 'administrative', 'safety', 'maintenance', 'mental_health', 'other']
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'in_progress', 'resolved', 'closed', 'escalated'],
    default: 'submitted'
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  // Stored even for anonymous — only admins can see if they have special permission
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  submittedByName: {
    type: String  // Only stored if not anonymous
  },
  anonymousToken: {
    type: String  // For anonymous users to track their own complaint
  },
  location: {
    building: String,
    floor: String,
    room: String,
    description: String
  },
  department: {
    type: String
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedToName: String,
  assignedDepartment: String,
  timeline: [timelineEntrySchema],
  comments: [commentSchema],
  escalationLevel: {
    type: Number,
    default: 0
  },
  escalatedAt: Date,
  resolvedAt: Date,
  resolutionNote: String,
  resolutionAttachments: [{
    filename: String,
    url: String
  }],
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  viewedByAdmin: {
    type: Boolean,
    default: false
  },
  tags: [String],
  // AI categorization fields
  aiSuggestedCategory: String,
  aiUrgencyScore: Number,
  aiKeywords: [String]
}, {
  timestamps: true
});

// Index for efficient queries
complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ category: 1 });
complaintSchema.index({ submittedBy: 1 });
complaintSchema.index({ assignedTo: 1 });
complaintSchema.index({ createdAt: -1 });
complaintSchema.index({ complaintId: 1 });

// Add timeline entry when status changes
complaintSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.timeline.push({
      action: 'status_change',
      description: `Status changed to: ${this.status.replace('_', ' ')}`,
      timestamp: new Date()
    });
  }
  if (this.status === 'resolved' && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
