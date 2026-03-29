# DailyEdge — Complete Architecture & Implementation Guide

## 1. Folder Structure

```
dailyedge/
├── apps/
│   ├── web/                          # Next.js Frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx              # Dashboard
│   │   │   │   ├── challenges/page.tsx
│   │   │   │   ├── leaderboard/page.tsx
│   │   │   │   └── profile/page.tsx
│   │   │   ├── api/                      # Next.js API routes (proxy)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui base components
│   │   │   ├── challenge/
│   │   │   │   ├── CodingEditor.tsx      # Monaco editor wrapper
│   │   │   │   ├── SQLPlayground.tsx
│   │   │   │   ├── LRQuestion.tsx
│   │   │   │   └── EnglishModule.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StreakWidget.tsx
│   │   │   │   ├── ProgressRing.tsx
│   │   │   │   └── StatsGrid.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       └── Topbar.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                    # Axios client
│   │   │   ├── auth.ts                   # Auth helpers
│   │   │   └── utils.ts
│   │   ├── store/
│   │   │   ├── useAuthStore.ts           # Zustand auth store
│   │   │   ├── useChallengeStore.ts
│   │   │   └── useStreakStore.ts
│   │   └── tailwind.config.ts
│   │
│   └── api/                          # Node.js + Express Backend
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.routes.ts
│       │   │   ├── challenges.routes.ts
│       │   │   ├── submissions.routes.ts
│       │   │   ├── leaderboard.routes.ts
│       │   │   ├── admin.routes.ts
│       │   │   └── users.routes.ts
│       │   ├── controllers/
│       │   │   ├── auth.controller.ts
│       │   │   ├── challenge.controller.ts
│       │   │   ├── submission.controller.ts
│       │   │   └── leaderboard.controller.ts
│       │   ├── middleware/
│       │   │   ├── auth.middleware.ts    # JWT verification
│       │   │   ├── admin.middleware.ts
│       │   │   └── rateLimit.middleware.ts
│       │   ├── services/
│       │   │   ├── DailyEngine.service.ts    # Question randomizer
│       │   │   ├── CodeExecution.service.ts  # Docker sandbox
│       │   │   ├── SQLValidator.service.ts
│       │   │   ├── Streak.service.ts
│       │   │   ├── Points.service.ts
│       │   │   ├── AI.service.ts             # Hints + eval
│       │   │   └── Email.service.ts
│       │   ├── models/
│       │   │   └── (Prisma-based, see schema)
│       │   ├── cache/
│       │   │   └── redis.ts
│       │   └── app.ts
│       ├── prisma/
│       │   └── schema.prisma
│       └── Dockerfile
│
├── packages/
│   ├── shared-types/                 # Shared TypeScript types
│   └── config/                       # Shared ESLint/TS config
│
├── docker/
│   ├── docker-compose.yml
│   ├── code-sandbox/
│   │   └── Dockerfile                # Isolated code execution
│   └── nginx/
│       └── nginx.conf
│
└── scripts/
    ├── seed.ts                       # DB seed with sample questions
    └── migrate.ts
```

---

## 2. Database Schema (PostgreSQL via Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?
  googleId      String?   @unique
  username      String    @unique
  displayName   String
  college       String?
  graduationYear Int?
  avatarUrl     String?
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Gamification
  totalPoints   Int       @default(0)
  currentStreak Int       @default(0)
  longestStreak Int       @default(0)
  lastActiveDate DateTime?
  level         Int       @default(1)
  xp            Int       @default(0)

  // Relations
  submissions   Submission[]
  progress      UserProgress[]
  leaderboard   LeaderboardEntry[]

  @@index([totalPoints])
  @@index([currentStreak])
}

enum Role {
  USER
  ADMIN
}

model Question {
  id          String        @id @default(cuid())
  type        QuestionType
  title       String
  slug        String        @unique
  difficulty  Difficulty
  topic       String
  tags        String[]
  points      Int

  // Coding-specific
  description String?
  examples    Json?         // [{input, output, explanation}]
  constraints String[]
  testCases   Json?         // [{input, expectedOutput, isHidden}]
  starterCode Json?         // {python: "...", java: "...", cpp: "..."}

  // SQL-specific
  sqlQuestion    String?
  sqlSchema      Json?      // table definitions
  sqlExpectedOut Json?
  sqlDataset     String?

  // LR-specific
  lrQuestion  String?
  lrOptions   Json?         // [{label, text, isCorrect}]
  lrExplanation String?

  // English-specific
  word        String?
  phonetic    String?
  partOfSpeech String?
  meaning     String?
  example     String?
  engOptions  Json?
  engExplanation String?

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  createdBy   String?

  dailyChallenges DailyChallengeQuestion[]
  submissions     Submission[]

  @@index([type, difficulty])
  @@index([topic])
}

enum QuestionType {
  CODING
  SQL
  LOGICAL_REASONING
  ENGLISH
}

enum Difficulty {
  EASY
  MEDIUM
  HARD
}

model DailyChallenge {
  id          String    @id @default(cuid())
  date        DateTime  @db.Date  // The calendar date
  isGlobal    Boolean   @default(true)

  questions   DailyChallengeQuestion[]
  progress    UserProgress[]

  @@unique([date])
  @@index([date])
}

model DailyChallengeQuestion {
  id               String         @id @default(cuid())
  dailyChallengeId String
  questionId       String
  order            Int

  dailyChallenge   DailyChallenge @relation(fields: [dailyChallengeId], references: [id])
  question         Question       @relation(fields: [questionId], references: [id])

  @@unique([dailyChallengeId, order])
  @@index([dailyChallengeId])
}

model UserProgress {
  id               String    @id @default(cuid())
  userId           String
  dailyChallengeId String
  questionId       String
  completed        Boolean   @default(false)
  completedAt      DateTime?
  pointsEarned     Int       @default(0)
  timeTaken        Int?      // seconds

  user             User           @relation(fields: [userId], references: [id])
  dailyChallenge   DailyChallenge @relation(fields: [dailyChallengeId], references: [id])

  @@unique([userId, dailyChallengeId, questionId])
  @@index([userId, dailyChallengeId])
}

model Submission {
  id         String           @id @default(cuid())
  userId     String
  questionId String
  type       QuestionType
  status     SubmissionStatus @default(PENDING)

  // Coding submission
  code       String?
  language   String?
  runtime    Int?             // ms
  memory     Int?             // KB
  testsPassed Int?
  testsTotal  Int?

  // MCQ submission (LR, English, SQL)
  selectedAnswer String?
  isCorrect      Boolean?

  pointsEarned Int     @default(0)
  createdAt    DateTime @default(now())

  user     User     @relation(fields: [userId], references: [id])
  question Question @relation(fields: [questionId], references: [id])

  @@index([userId, questionId])
  @@index([userId, createdAt])
}

enum SubmissionStatus {
  PENDING
  RUNNING
  ACCEPTED
  WRONG_ANSWER
  TIME_LIMIT_EXCEEDED
  RUNTIME_ERROR
  COMPILE_ERROR
}

model LeaderboardEntry {
  id      String   @id @default(cuid())
  userId  String
  period  String   // "global", "2025-W12", "2025-03"
  points  Int      @default(0)
  rank    Int?
  streak  Int      @default(0)

  user    User     @relation(fields: [userId], references: [id])

  @@unique([userId, period])
  @@index([period, points(sort: Desc)])
}

model StreakLog {
  id      String   @id @default(cuid())
  userId  String
  date    DateTime @db.Date
  completed Boolean @default(false)

  @@unique([userId, date])
  @@index([userId])
}
```

---

## 3. Backend API Reference

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Register with email+password | None |
| POST | `/login` | Login → JWT access + refresh token | None |
| POST | `/google` | Google OAuth token exchange | None |
| POST | `/refresh` | Refresh access token | Refresh token |
| POST | `/logout` | Invalidate refresh token | JWT |
| GET | `/me` | Get current user profile | JWT |

**Register Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "arjunkumar",
  "displayName": "Arjun Kumar",
  "college": "IIT Bombay",
  "graduationYear": 2025
}
```

**Login Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1...",
  "refreshToken": "eyJhbGciOiJIUzI1...",
  "user": { "id": "...", "username": "...", "totalPoints": 3340, "currentStreak": 23 }
}
```

---

### Daily Challenges (`/api/v1/challenges`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/today` | Get today's 6 challenges with user progress | JWT |
| GET | `/history?page=1` | Past challenges | JWT |
| GET | `/:date` | Challenges for specific date (YYYY-MM-DD) | JWT |

**GET /today Response:**
```json
{
  "date": "2025-03-24",
  "challenges": [
    {
      "id": "dcq_abc123",
      "order": 1,
      "type": "CODING",
      "difficulty": "EASY",
      "title": "Two Sum",
      "topic": "Arrays",
      "points": 50,
      "completed": false,
      "question": { "id": "...", "description": "...", "examples": [...] }
    }
  ],
  "completedCount": 3,
  "totalPoints": 160,
  "bonusAvailable": 50,
  "streakStatus": "active"
}
```

---

### Submissions (`/api/v1/submissions`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/code/run` | Run code (test only, no save) | JWT |
| POST | `/code/submit` | Submit final solution | JWT |
| POST | `/sql` | Submit SQL query | JWT |
| POST | `/mcq` | Submit LR or English answer | JWT |
| GET | `/history` | User's submission history | JWT |

**POST /code/submit Request:**
```json
{
  "questionId": "q_abc123",
  "code": "class Solution:\n    def twoSum...",
  "language": "python"
}
```

**POST /code/submit Response:**
```json
{
  "status": "ACCEPTED",
  "runtime": 52,
  "memory": 14800,
  "testsPassed": 58,
  "testsTotal": 58,
  "pointsEarned": 50,
  "newTotal": 3390,
  "streakUpdated": false
}
```

---

### Leaderboard (`/api/v1/leaderboard`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/global?page=1&limit=50` | Global all-time leaderboard | JWT |
| GET | `/weekly` | This week's leaderboard | JWT |
| GET | `/monthly` | This month's leaderboard | JWT |
| GET | `/friends` | Friends leaderboard | JWT |
| GET | `/me/rank` | Current user's rank across boards | JWT |

---

### Users (`/api/v1/users`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:username` | Public user profile | None |
| PUT | `/me` | Update profile | JWT |
| GET | `/me/stats` | Detailed stats + weak areas | JWT |
| GET | `/me/streak` | Streak calendar (90 days) | JWT |
| GET | `/me/achievements` | Earned badges | JWT |

---

### Admin (`/api/v1/admin`) — Role: ADMIN

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/questions` | Add new question |
| PUT | `/questions/:id` | Edit question |
| DELETE | `/questions/:id` | Delete question |
| POST | `/questions/bulk` | Bulk import via JSON |
| GET | `/questions?type=CODING&topic=arrays` | List/filter questions |
| POST | `/daily/generate` | Manually trigger daily set generation |
| GET | `/analytics` | Platform-wide analytics |

---

## 4. Key Service Implementations

### DailyEngine Service
```typescript
// services/DailyEngine.service.ts
export class DailyEngineService {
  async generateDailySet(date: Date): Promise<DailyChallenge> {
    // 1. Check cache (Redis key: `daily:${dateStr}`)
    const cached = await redis.get(`daily:${formatDate(date)}`);
    if (cached) return JSON.parse(cached);

    // 2. Get recently used questions (last 30 days) to avoid repeats
    const recentQIds = await this.getRecentlyUsedIds(30);

    // 3. Pick 2 CODING: 1 Easy + 1 Medium, balanced topics
    const codingQ = await this.selectQuestions({
      type: 'CODING',
      exclude: recentQIds,
      distribution: [
        { difficulty: 'EASY', count: 1 },
        { difficulty: 'MEDIUM', count: 1 }
      ],
      topicBalance: true
    });

    // 4. Pick 1 SQL: alternating easy/medium
    const sqlQ = await this.selectQuestions({ type: 'SQL', count: 1, exclude: recentQIds });

    // 5. Pick 1 LR: medium
    const lrQ = await this.selectQuestions({ type: 'LOGICAL_REASONING', count: 1 });

    // 6. Pick 2 English words
    const engQ = await this.selectQuestions({ type: 'ENGLISH', count: 2, exclude: recentQIds });

    const all = [...codingQ, ...sqlQ, ...lrQ, ...engQ];

    // 7. Store in DB + cache for 25h
    const daily = await prisma.dailyChallenge.create({ ... });
    await redis.setEx(`daily:${formatDate(date)}`, 90000, JSON.stringify(daily));

    return daily;
  }
}
```

### Code Execution Service (Docker Sandbox)
```typescript
// services/CodeExecution.service.ts
export class CodeExecutionService {
  async execute(code: string, language: string, testCases: TestCase[]): Promise<ExecutionResult> {
    const container = await docker.createContainer({
      Image: `dailyedge-sandbox-${language}`,
      Cmd: ['run', '/code/solution'],
      HostConfig: {
        Memory: 256 * 1024 * 1024,  // 256MB limit
        NanoCpus: 500000000,          // 0.5 CPU
        NetworkMode: 'none',          // No network access
        ReadonlyRootfs: true,
        PidsLimit: 50,
        AutoRemove: true,
      },
      StopTimeout: 5,               // 5s time limit
    });

    // Write code + test runner to temp volume
    await this.writeToVolume(container.id, code, testCases);

    const result = await container.start();
    const output = await this.collectOutput(container);
    return this.parseResults(output, testCases);
  }
}
```

### Streak Service
```typescript
// services/Streak.service.ts
export class StreakService {
  async updateStreak(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);

    // Check if all today's challenges are complete
    const todayProgress = await this.getTodayProgress(userId);
    const allComplete = todayProgress.every(p => p.completed);

    if (!allComplete) return;

    const lastActive = user.lastActiveDate ? startOfDay(user.lastActiveDate) : null;
    const isConsecutive = lastActive && isSameDay(lastActive, yesterday);

    await prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: isConsecutive ? user.currentStreak + 1 : 1,
        longestStreak: Math.max(user.longestStreak, isConsecutive ? user.currentStreak + 1 : 1),
        lastActiveDate: today,
      }
    });

    // Log to streak calendar
    await prisma.streakLog.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, completed: true },
      update: { completed: true }
    });
  }
}
```

---

## 5. Frontend Key Components

### Monaco Code Editor Component
```tsx
// components/challenge/CodingEditor.tsx
import Editor from '@monaco-editor/react';
import { useEffect, useState } from 'react';

const LANG_MAP = { python: 'python', java: 'java', cpp: 'cpp' };
const STARTER_THEMES = { dark: 'vs-dark' };

export function CodingEditor({ question, onSubmit }) {
  const [lang, setLang] = useState('python');
  const [code, setCode] = useState(question.starterCode?.python || '');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  const handleRun = async () => {
    setIsRunning(true);
    const res = await api.post('/submissions/code/run', { questionId: question.id, code, language: lang });
    setResults(res.data);
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-white/10">
        <select value={lang} onChange={e => { setLang(e.target.value); setCode(question.starterCode?.[e.target.value] || ''); }}>
          {Object.keys(LANG_MAP).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={handleRun} disabled={isRunning}>
          {isRunning ? '⏳ Running...' : '▶ Run'}
        </button>
        <button onClick={() => onSubmit(code, lang)} className="btn-primary">Submit</button>
      </div>
      <Editor
        height="300px"
        language={LANG_MAP[lang]}
        value={code}
        onChange={setCode}
        theme="vs-dark"
        options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false }}
      />
      {results && <TestResults results={results} />}
    </div>
  );
}
```

### Zustand Auth Store
```typescript
// store/useAuthStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      logout: () => set({ user: null, accessToken: null }),
      updateUser: (updates) => set(state => ({
        user: state.user ? { ...state.user, ...updates } : null
      })),
    }),
    { name: 'dailyedge-auth', partialize: (s) => ({ accessToken: s.accessToken }) }
  )
);
```

---

## 6. Sample Question Data (Seed)

### 10 Coding Questions
```json
[
  {
    "type": "CODING", "difficulty": "EASY", "topic": "Arrays",
    "title": "Two Sum", "points": 50,
    "tags": ["hash-map", "array"],
    "description": "Given array nums and target, return indices of two numbers that add up to target.",
    "testCases": [
      {"input": "[2,7,11,15]\n9", "expectedOutput": "[0,1]"},
      {"input": "[3,2,4]\n6", "expectedOutput": "[1,2]"}
    ]
  },
  {
    "type": "CODING", "difficulty": "MEDIUM", "topic": "Arrays",
    "title": "Merge Intervals", "points": 50,
    "tags": ["sorting", "array"],
    "description": "Merge all overlapping intervals and return non-overlapping intervals."
  },
  {
    "type": "CODING", "difficulty": "EASY", "topic": "Strings",
    "title": "Valid Palindrome", "points": 50, "tags": ["string", "two-pointer"]
  },
  {
    "type": "CODING", "difficulty": "MEDIUM", "topic": "Binary Search",
    "title": "Search in Rotated Array", "points": 50
  },
  {
    "type": "CODING", "difficulty": "MEDIUM", "topic": "Trees",
    "title": "Level Order Traversal", "points": 50, "tags": ["tree", "BFS"]
  }
]
```

### 10 SQL Questions
```json
[
  {
    "type": "SQL", "difficulty": "MEDIUM", "topic": "Joins",
    "title": "Top Earning Employees", "points": 40,
    "sqlQuestion": "Find employees earning above their dept average. Return name, dept, salary ORDER BY salary DESC.",
    "sqlSchema": {
      "employees": [{"col": "id", "type": "INT"}, {"col": "name", "type": "VARCHAR"}, {"col": "dept_id", "type": "INT"}, {"col": "salary", "type": "DECIMAL"}],
      "departments": [{"col": "id", "type": "INT"}, {"col": "name", "type": "VARCHAR"}]
    }
  },
  {
    "type": "SQL", "difficulty": "EASY", "topic": "Aggregation",
    "title": "Orders Per Customer", "points": 40,
    "sqlQuestion": "Count total orders per customer. Only include customers with 3+ orders."
  },
  {
    "type": "SQL", "difficulty": "MEDIUM", "topic": "Window Functions",
    "title": "Running Total Sales", "points": 40,
    "sqlQuestion": "Calculate the running total of daily sales using window functions."
  }
]
```

### 10 English Words
```json
[
  {
    "type": "ENGLISH", "difficulty": "MEDIUM", "topic": "Vocabulary",
    "word": "Perspicacious", "phonetic": "/ˌpɜːr.spɪˈkeɪ.ʃəs/",
    "partOfSpeech": "adjective", "points": 20,
    "meaning": "Having a ready insight into things; shrewd.",
    "example": "The perspicacious investor spotted the market trend early.",
    "engOptions": [
      {"label": "A", "text": "He perspicaciously ate his lunch.", "isCorrect": false},
      {"label": "B", "text": "Her perspicacious analysis helped the team succeed.", "isCorrect": true},
      {"label": "C", "text": "The perspicacious weather was pleasant.", "isCorrect": false}
    ]
  },
  {
    "type": "ENGLISH", "word": "Ephemeral", "phonetic": "/ɪˈfem.ər.əl/",
    "partOfSpeech": "adjective", "points": 20,
    "meaning": "Lasting for a very short time; transitory.",
    "example": "The startup's ephemeral success faded within months of launch."
  },
  {
    "type": "ENGLISH", "word": "Pragmatic", "phonetic": "/præɡˈmæt.ɪk/",
    "partOfSpeech": "adjective", "points": 20,
    "meaning": "Dealing with things sensibly based on practical considerations.",
    "example": "A pragmatic engineer chooses the right tool for the job, not the trendiest."
  }
]
```

### 5 LR Questions
```json
[
  {
    "type": "LOGICAL_REASONING", "difficulty": "MEDIUM", "topic": "Number Series",
    "lrQuestion": "Find next: 2, 6, 12, 20, 30, ?",
    "lrOptions": [
      {"label": "A", "text": "38", "isCorrect": false},
      {"label": "B", "text": "40", "isCorrect": false},
      {"label": "C", "text": "42", "isCorrect": true},
      {"label": "D", "text": "44", "isCorrect": false}
    ],
    "lrExplanation": "Pattern: n(n+1). Differences: 4,6,8,10,12. Next: 30+12=42"
  },
  {
    "type": "LOGICAL_REASONING", "difficulty": "EASY", "topic": "Syllogism",
    "lrQuestion": "All cats are animals. Some animals are black. Conclusion: Some cats are black?",
    "lrOptions": [
      {"label": "A", "text": "True", "isCorrect": false},
      {"label": "B", "text": "False", "isCorrect": false},
      {"label": "C", "text": "Cannot be determined", "isCorrect": true},
      {"label": "D", "text": "Ambiguous", "isCorrect": false}
    ]
  }
]
```

---

## 7. Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.9'

services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://api:4000
    depends_on: [api]

  api:
    build: ./apps/api
    ports: ["4000:4000"]
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/dailyedge
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on: [db, redis]

  db:
    image: postgres:16-alpine
    volumes: [postgres_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: dailyedge
      POSTGRES_PASSWORD: password

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

  code-sandbox:
    build: ./docker/code-sandbox
    privileged: true          # Required for Docker-in-Docker
    volumes: [/var/run/docker.sock:/var/run/docker.sock]

volumes:
  postgres_data:
  redis_data:
```

---

## 8. Environment Variables

```env
# apps/api/.env

# Database
DATABASE_URL="postgresql://user:password@host:5432/dailyedge"

# Auth
JWT_SECRET="your-256-bit-secret"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_SECRET="another-256-bit-secret"
REFRESH_EXPIRES_IN="7d"

# OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Redis
REDIS_URL="redis://localhost:6379"

# AI (Anthropic for hints)
ANTHROPIC_API_KEY="sk-ant-..."

# Email
RESEND_API_KEY="re_..."
FROM_EMAIL="noreply@dailyedge.app"

# Code Execution
SANDBOX_TIMEOUT_MS=5000
SANDBOX_MEMORY_MB=256
```

```env
# apps/web/.env.local

NEXT_PUBLIC_API_URL="https://api.dailyedge.app"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-client-id"
```

---

## 9. Deployment Steps

### Frontend → Vercel
```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. From apps/web directory
vercel

# 3. Set environment variables in Vercel dashboard:
#    NEXT_PUBLIC_API_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID

# 4. Deploy to production
vercel --prod
```

### Backend → Railway
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and init
railway login
railway init

# 3. Provision PostgreSQL
railway add --plugin postgresql

# 4. Provision Redis
railway add --plugin redis

# 5. Deploy
railway up

# 6. Run migrations
railway run npx prisma migrate deploy
railway run npx ts-node scripts/seed.ts
```

### Database → Neon (Serverless Postgres)
```bash
# 1. Create project at neon.tech
# 2. Copy connection string
# 3. Set DATABASE_URL in Railway environment
# 4. Neon provides connection pooling via PgBouncer automatically
```

### Cron Jobs (Daily Question Generation)
```typescript
// Use Railway's cron feature or a separate service
// Trigger: 0 0 * * * (midnight UTC)
// Endpoint: POST /api/v1/admin/daily/generate
// This generates tomorrow's question set and caches in Redis
```

---

## 10. Points & XP System

| Action | Points | Notes |
|--------|--------|-------|
| Solve Coding (Easy) | 50 | First solve only |
| Solve Coding (Medium) | 50 | First solve only |
| Solve SQL | 40 | First solve only |
| Solve LR (Correct) | 30 | First solve only |
| Learn English Word | 20 | Per word |
| Complete All 6 Daily | +50 bonus | Only if all done same day |
| 7-day streak | +100 bonus | Weekly bonus |
| 30-day streak | +500 bonus | Monthly milestone |
| First submission | +5 | One-time |
| Help (AI hint used) | -5 | Penalty |

**Level Thresholds:** 0→1k→3k→6k→10k→15k→21k→28k... (increasing 1k increments)

---

## 11. AI Integration (Anthropic Claude)

```typescript
// services/AI.service.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function getHint(question: Question, userCode?: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 200,
    system: 'You are a coding mentor. Give a HINT only — not the solution. 2-3 sentences max. Focus on the approach/pattern.',
    messages: [{
      role: 'user',
      content: `Problem: ${question.title}\n${question.description}\n${userCode ? `Their code so far:\n${userCode}` : ''}\n\nGive a helpful hint.`
    }]
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

export async function evaluateEnglishSentence(word: string, userSentence: string): Promise<{score: number, feedback: string}> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 150,
    system: 'Evaluate if the word is used correctly in context. Return JSON: {"score": 0-100, "feedback": "..."}',
    messages: [{ role: 'user', content: `Word: "${word}"\nSentence: "${userSentence}"` }]
  });
  return JSON.parse(msg.content[0].type === 'text' ? msg.content[0].text : '{"score":0,"feedback":"Error"}');
}
```

---

## 12. Redis Caching Strategy

```
Key: daily:2025-03-24        → Today's question set (TTL: 25h)
Key: lb:global:page:1        → Global leaderboard page (TTL: 5min)
Key: lb:weekly:2025-W12      → Weekly leaderboard (TTL: 15min)
Key: user:streak:{userId}    → Streak data (TTL: 2h)
Key: ratelimit:{userId}:run  → Code run rate limiter (TTL: 60s, max: 10)
Key: session:{refreshToken}  → Refresh token blacklist on logout
```
