/**
 * CampusBridge — MongoDB Setup & Migration Script
 * Run: node scripts/setup-db.js
 * 
 * Creates indexes and seeds initial data.
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

async function setup() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusbridge');
  console.log('Connected.\n');

  // ── Collections & Indexes ────────────────────────────────────────────────
  const db = mongoose.connection.db;

  console.log('Creating indexes...');

  // Users
  await db.collection('users').createIndexes([
    { key: { email: 1 }, unique: true, name: 'email_unique' },
    { key: { role: 1 }, name: 'role' },
    { key: { isActive: 1 }, name: 'isActive' }
  ]);

  // Complaints
  await db.collection('complaints').createIndexes([
    { key: { complaintId: 1 }, unique: true, name: 'complaintId_unique' },
    { key: { status: 1, priority: 1 }, name: 'status_priority' },
    { key: { category: 1 }, name: 'category' },
    { key: { submittedBy: 1 }, name: 'submittedBy' },
    { key: { assignedTo: 1 }, name: 'assignedTo' },
    { key: { createdAt: -1 }, name: 'createdAt_desc' },
    { key: { anonymousToken: 1 }, sparse: true, name: 'anonymousToken' }
  ]);

  // Notifications
  await db.collection('notifications').createIndexes([
    { key: { recipient: 1, isRead: 1 }, name: 'recipient_read' },
    { key: { createdAt: -1 }, name: 'createdAt_desc' },
    { key: { createdAt: 1 }, expireAfterSeconds: 2592000, name: 'ttl_30days' }
  ]);

  console.log('Indexes created.\n');

  // ── Validation Rules ─────────────────────────────────────────────────────
  await db.command({
    collMod: 'complaints',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['title', 'description', 'category', 'priority', 'status'],
        properties: {
          title: { bsonType: 'string', maxLength: 200 },
          category: { enum: ['infrastructure','academic','administrative','safety','maintenance','mental_health','other'] },
          priority: { enum: ['low','medium','high','critical'] },
          status: { enum: ['submitted','under_review','in_progress','resolved','closed','escalated'] }
        }
      }
    },
    validationLevel: 'moderate'
  }).catch(() => console.log('Skipping complaints validation (collection may not exist yet)'));

  console.log('Schema validation configured.\n');
  console.log('Database setup complete!');
  await mongoose.disconnect();
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
