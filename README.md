# 🏫 CampusBridge — Smart Campus Issue Management Platform

A full-stack web application for transparent, secure, and efficient complaint management in educational institutions.

---

## 📁 Project Structure

```
campusbridge/
├── backend/
│   ├── models/
│   │   ├── User.js          # User schema (student/faculty/admin/maintenance)
│   │   ├── Complaint.js     # Complaint schema with timeline, comments, feedback
│   │   └── Notification.js  # Notification schema
│   ├── routes/
│   │   ├── auth.js          # Register, login, profile, password change
│   │   ├── complaints.js    # Full CRUD + assign, escalate, comments, feedback
│   │   ├── users.js         # Admin user management
│   │   └── notifications.js # In-app notifications
│   ├── middleware/
│   │   └── auth.js          # JWT protect, restrictTo, optionalAuth
│   ├── scripts/
│   │   └── setup-db.js      # Database indexes & validation setup
│   ├── uploads/             # Uploaded files (auto-created)
│   ├── server.js            # Express app + MongoDB + auto-escalation cron
│   ├── package.json
│   └── .env                 # Configuration (copy from .env.example)
└── frontend/
    └── index.html           # Complete single-file frontend (no build needed)
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+
- **MongoDB** v6+ (local or MongoDB Atlas)
- Any modern browser

---

### 1. Clone & Install Backend

```bash
cd campusbridge/backend
npm install
```

### 2. Configure Environment

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/campusbridge
JWT_SECRET=your_super_secret_key_here_change_this
JWT_EXPIRES_IN=7d

# Email (optional — for real email notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### 3. Start Backend

```bash
npm run dev    # Development (auto-reload)
# or
npm start      # Production
```

Backend runs at: **http://localhost:5000**

### 4. Open Frontend

Simply open `frontend/index.html` in your browser.

> ⚡ **No build step needed.** The frontend is a single HTML file.

---

## 🔐 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@campus.edu | admin123 |
| Student | riya@campus.edu | student123 |
| Student | arjun@campus.edu | student123 |
| Faculty | priya.faculty@campus.edu | faculty123 |
| Maintenance | ramesh@campus.edu | maint123 |

---

## 🌐 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/update-profile` | Update profile |
| PATCH | `/api/auth/change-password` | Change password |

### Complaints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/complaints` | All | List complaints (filtered by role) |
| POST | `/api/complaints` | All | Submit new complaint |
| GET | `/api/complaints/analytics` | Admin | Analytics data |
| GET | `/api/complaints/:id` | Owner/Admin | Get complaint detail |
| PATCH | `/api/complaints/:id/status` | Admin/Maint | Update status |
| PATCH | `/api/complaints/:id/assign` | Admin | Assign to staff |
| POST | `/api/complaints/:id/comment` | Authenticated | Add comment |
| POST | `/api/complaints/:id/feedback` | Owner | Rate resolution |
| POST | `/api/complaints/:id/escalate` | Admin | Manual escalation |
| GET | `/api/complaints/track/:token` | Public | Track anonymous complaint |

### Users (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/staff` | Get staff for assignment |
| PATCH | `/api/users/:id/role` | Change user role |
| PATCH | `/api/users/:id/toggle-active` | Activate/deactivate user |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications |
| PATCH | `/api/notifications/:id/read` | Mark as read |
| PATCH | `/api/notifications/read-all` | Mark all read |

---

## 🧩 Key Features

### 🔒 Security
- JWT-based authentication with role-based access control
- bcrypt password hashing (12 salt rounds)
- Anonymous complaint system — identity never exposed
- Anonymous tracking tokens for follow-up

### 🤖 Smart Features
- AI urgency detection: scans title + description for critical keywords (ragging, harassment, emergency, violence, etc.)
- Auto-priority suggestion based on detected urgency score
- Auto-escalation cron (runs every 30 minutes): escalates unresolved complaints past their SLA

### 📊 SLA Escalation Times
| Priority | Auto-escalate after |
|----------|---------------------|
| Low | 72 hours |
| Medium | 48 hours |
| High | 24 hours |
| Critical | 6 hours |

### 📁 File Uploads
- Multer-based upload handling
- Supports images, videos, PDFs, Word docs
- Max 50MB per file, 5 files per complaint
- Files served at `/uploads/:filename`

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose ODM |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File Upload | Multer |
| Validation | express-validator |
| Notifications | In-app (email scaffold with Nodemailer) |

---

## 🚀 Deployment

### Using MongoDB Atlas (Cloud)
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/campusbridge
```

### Deploying Frontend
- Upload `frontend/index.html` to any static host (Netlify, Vercel, GitHub Pages)
- Update `const API = 'https://your-backend-url.com/api'` in the HTML

### Deploying Backend (e.g., Railway, Render, EC2)
```bash
npm start
```
Set environment variables in your hosting platform.

---

## 🔮 Future Enhancements
- [ ] Real-time notifications with Socket.io
- [ ] Email notification system (Nodemailer)
- [ ] Mobile app (React Native)
- [ ] Blockchain audit trail
- [ ] Heatmap visualization of problem areas
- [ ] AI chatbot for complaint guidance
- [ ] ERP system integration
- [ ] Voice-based complaint submission
- [ ] Bulk complaint export (PDF/CSV)
- [ ] Two-factor authentication

---

## 📄 License
MIT — Free for educational and institutional use.
