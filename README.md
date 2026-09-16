# PASCONX Video Portal

[![Tests](https://img.shields.io/badge/tests-15%2F15%20passing-emerald)](file:///C:/Users/sazid/.gemini/antigravity/scratch/pasconix-video-portal/server/src/tests/portal.test.js)
[![Stack](https://img.shields.io/badge/stack-React%20%7C%20Node.js%20%7C%20SQLite%20%7C%20Tailwind-blue)]()
[![Video Provider](https://img.shields.io/badge/provider-YouTube%20Unlisted%20(Modular)-red)]()

A private, secure educational video-sharing platform built exclusively for **PASCONX**. The platform enables registered students to access and stream only the specific courses and video sessions assigned to them by institute administrators.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Core Features](#core-features)
3. [Architecture & Workflow](#architecture--workflow)
4. [Technology Stack](#technology-stack)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
7. [Environment Configuration](#environment-configuration)
8. [Database Setup & Migration Readiness](#database-setup--migration-readiness)
9. [Running Locally](#running-locally)
10. [Demo Logins & Seed Data](#demo-logins--seed-data)
11. [Administrator Operations Guide](#administrator-operations-guide)
    - [Creating Students](#creating-students)
    - [Creating Courses](#creating-courses)
    - [Adding YouTube Videos](#adding-youtube-videos)
    - [Assigning Courses & Setting Access Dates](#assigning-courses--setting-access-dates)
    - [Extending Expiry Dates](#extending-expiry-dates)
12. [Student Experience & Core User Flow](#student-experience--core-user-flow)
13. [Video Watching & Progress Tracking](#video-watching--progress-tracking)
14. [YouTube Video Architecture (`VideoProvider`)](#youtube-video-architecture)
15. [YouTube Unlisted & Private Video Limitations](#youtube-unlisted-and-private-video-limitations)
16. [Future VdoCipher Multi-DRM Integration](#future-vdocipher-multi-drm-integration)
17. [Security Considerations & Anti-Download Reality](#security-considerations--anti-download-reality)
18. [Automated Test Suite (15 Test Cases)](#automated-test-suite)
19. [Production Deployment Instructions](#production-deployment-instructions)

---

## Project Overview

PASCONX requires a private student portal where course curriculum video lectures are protected behind strict backend authentication and authorization boundaries.

The MVP leverages **YouTube Unlisted** embedding with the official YouTube IFrame Player API for video delivery and progress tracking. The video layer is completely decoupled via a pluggable **`VideoProvider` abstraction**, ensuring a smooth migration to bank-grade DRM providers like **VdoCipher** in the future without rewriting core student, course, or enrollment business logic.

---

## Core Features

- **Strict Access Isolation**: A student cannot access another student's courses or video streams. All requests are authorized by the backend through authenticated session tokens; client-supplied IDs are never trusted.
- **Access Expiration Enforcement**: Course enrollments enforce start and expiry deadlines. Once a deadline passes, course access is denied (HTTP 403) with a renewal prompt.
- **URL Sharing Defense**: Direct URLs like `/student/watch/123` or direct playback APIs cannot be accessed by copying links between students.
- **YouTube IFrame API Progress Tracking**: Automatically captures playback time, updates completion percentages, and marks lessons complete upon reaching 90%+ progress.
- **Modular Video Provider Interface**: `VideoProvider` base class with `YouTubeProvider` (MVP) and `VdoCipherProvider` (enterprise DRM stub).
- **Comprehensive Admin Control Center**:
  - Live statistics dashboard (Students, Courses, Videos, Active Enrollments).
  - Student CRUD, enable/disable account toggling, password resets.
  - Course curriculum management with thumbnails and lecture ordering.
  - Video management with YouTube URL/ID auto-extraction and privacy advisories.
  - Enrollment assignment with start/expiry date pickers and 1-click extension shortcuts.
- **Modern Responsive UI**: Built with React, Vite, Tailwind CSS, Lucide icons, and the official PASCONX brand identity.

---

## Architecture & Workflow

```
Student Client (React + Vite)
       │
       ▼ [1] POST /api/auth/login (Rate-Limited, Bcrypt Verification)
HTTP-only Session Cookie Set
       │
       ▼ [2] GET /api/student/courses
Backend resolves student strictly from req.user.id
       │
       ▼ [3] GET /api/student/videos/:videoId
Middleware Pipeline:
  ├── authenticateUser (Validates JWT session & checks user.status = 'ACTIVE')
  ├── requireStudent (Guards role boundary)
  └── checkVideoAccess (Verifies course enrollment, status = 'ACTIVE', start_date <= now <= expiry_date)
       │
       ▼ [4] VideoProvider.getPlaybackConfig(video, user)
Returns official YouTube embed configuration without sensitive internals
       │
       ▼ [5] Official YouTube IFrame Player API
Captures playback progress & syncs via POST /api/student/videos/:videoId/progress
```

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS 3 | SPA, responsive layouts, Lucide icons, Inter font |
| **Backend** | Node.js 20, Express.js 4 | RESTful API, structured error handlers |
| **Database** | SQLite 3 via `better-sqlite3` | WAL mode, foreign keys, clean normalized schema |
| **Authentication** | JWT + HTTP-only cookies + bcryptjs | Secure password hashing, brute-force rate limiting |
| **Video Engine** | YouTube IFrame Player API | Official embedding, progress tracking, modular abstraction |
| **Testing** | Node native test runner (`node:test`) + Supertest | 15 automated integration tests |

---

## Prerequisites

- **Node.js**: Version 18.x or 20.x+ (tested on Node 20.17.0)
- **npm**: Version 9.x or 10.x+

---

## Installation

Clone or extract the repository, then install dependencies for both server and client:

```bash
# 1. Install Backend Dependencies
cd server
npm install

# 2. Install Frontend Dependencies
cd ../client
npm install
```

---

## Environment Configuration

Both `server/.env.example` and `server/.env` contain sensible defaults for local development:

```env
PORT=5000
DATABASE_URL=./data/pasconix.db
SESSION_SECRET=pasconix_super_secret_jwt_key_development_2026
CLIENT_URL=http://localhost:5173
VIDEO_PROVIDER=youtube
YOUTUBE_API_KEY=
VDOCIPHER_API_SECRET=
VDOCIPHER_API_KEY=
NODE_ENV=development
```

> **Security Rule**: Never commit `.env` or production API keys to git. The `.gitignore` file already excludes `.env`, `node_modules`, `*.db`, and `dist/`.

---

## Database Setup & Migration Readiness

The application uses an SQLite database located at `server/data/pasconix.db`.
The schema is designed using standard SQL types and foreign key relationships that directly translate to **PostgreSQL** or **MySQL** in production:

- `users` (`id`, `name`, `email`, `password_hash`, `role`, `status`, `created_at`, `updated_at`)
- `courses` (`id`, `title`, `description`, `thumbnail_url`, `status`, `created_at`, `updated_at`)
- `videos` (`id`, `course_id`, `title`, `description`, `provider`, `privacy_type`, `external_video_id`, `duration_seconds`, `order_index`, `status`, `created_at`)
- `enrollments` (`id`, `student_id`, `course_id`, `access_start`, `access_expiry`, `status`, `created_at`)
- `video_progress` (`id`, `student_id`, `video_id`, `progress_seconds`, `completed`, `last_watched_at`)

To initialize and seed the database with demo accounts and courses:

```bash
cd server
npm run seed
```

---

## Running Locally

### Option A: Run Backend & Frontend in Two Terminals

**Terminal 1 (Backend API):**
```bash
cd server
npm start
# Runs on http://localhost:5000
```

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
# Runs on http://localhost:5173
```

Open your browser and navigate to **`http://localhost:5173`**.

---

## Demo Logins & Seed Data

The database comes pre-seeded with accounts ready for instant testing:

| Role | Email | Password | Assigned Courses |
|---|---|---|---|
| **Administrator** | `admin@pasconx.com` | `Admin@12345` | Full administrative control |
| **Student** | `student@pasconx.com` | `Student@12345` | PASCONX Demo Course, Cybersecurity Fundamentals, Expired Legacy Course |
| **Student (Rahul)** | `rahul@example.com` | `Rahul@12345` | Cybersecurity Fundamentals, Python Full Stack |
| **Disabled Student** | `disabled@pasconx.com` | `Disabled@12345` | Inactive / Disabled account test |

> The login page includes **"Instant Demo Accounts"** one-click buttons that automatically fill credentials.

---

## Administrator Operations Guide

Log in as `admin@pasconx.com` to access `/admin/dashboard`.

### Creating Students
1. Go to **Students** (`/admin/students`).
2. Click **"+ Create Student"**.
3. Enter Name, Email, and Temporary Password. Click **Create Student**.
4. To disable/enable an account, click the toggle icon in the Actions column.
5. To reset a password, click the Key icon.

### Creating Courses
1. Go to **Courses** (`/admin/courses`).
2. Click **"+ Create Course"**.
3. Provide Course Title, Description, and Thumbnail URL (e.g. Unsplash URL). Click **Create Course**.

### Adding YouTube Videos
1. Go to **Videos** (`/admin/videos`).
2. Click **"+ Add Video"**.
3. Select the target Course.
4. Enter Video Title, Description, Duration, and Order Index.
5. Enter the **YouTube Video ID** (e.g., `dQw4w9WgXcQ` or full URL `https://youtu.be/...`; the system auto-extracts the valid 11-character ID).
6. Select Privacy Mode: **YouTube Unlisted (Recommended for MVP)** or **YouTube Private**.
   - *If Private is selected, a warning banner appears explaining viewer authorization requirements.*

### Assigning Courses & Setting Access Dates
1. Go to **Enrollments** (`/admin/enrollments`).
2. Click **"Assign Course Access"**.
3. Select the Student and Course.
4. Choose **Access Start Date** and **Access Expiry Date**. Click **Assign Access**.

### Extending Expiry Dates
1. In the **Enrollments** table, locate the student enrollment.
2. Click the **"Extend"** button.
3. Choose a custom date or click a shortcut (`+30 Days`, `+60 Days`, `+6 Months`). Click **Save Expiry Extension**.

---

## Student Experience & Core User Flow

1. Student logs in at `/login`.
2. Lands on the **Student Dashboard** (`/student/dashboard`):
   - Welcome banner with student name and completion statistics.
   - **My Active Courses**: Shows only courses assigned to that student with video count, expiration date, progress bar, and "Continue Learning" button.
   - **Expired Courses**: Shows expired courses with a renewal notice.
3. Clicks a course to view the **Course Syllabus** (`/student/courses/:courseId`):
   - Displays all lectures in sequence, duration, completion status, and "Watch" button.
4. Clicks **Watch** to open the **Video Watching Page** (`/student/watch/:videoId`):
   - Displays course title, lecture name, official YouTube player, live progress percentage, and "Next Video →" button.

---

## Video Watching & Progress Tracking

- The video is rendered using the official YouTube IFrame Player API.
- Playback time is sampled every 4 seconds while playing and upon pause/end.
- Sent to `POST /api/student/videos/:videoId/progress` with `{ progress_seconds, completed }`.
- When a student completes >= 90% or watches until the end, `completed` is marked `1`.
- Syllabus displays a green checkmark and "Completed" badge.

---

## YouTube Video Architecture

The platform uses an object-oriented provider abstraction pattern:

```
VideoProvider (Abstract Base Class)
│
├── YouTubeProvider (Active MVP)
│     └── Builds official embed URL with origin & JS API parameters
│
└── VdoCipherProvider (Future Integration)
      └── Generates server-side secure OTPs & playback tokens
```

The active provider is chosen dynamically by the environment variable:
```env
VIDEO_PROVIDER=youtube
```

Switching providers requires **zero code changes** to authentication, student dashboards, courses, or enrollments.

---

## YouTube Unlisted and Private Video Limitations

### YouTube Unlisted (MVP Mode)
- **Role**: Fast, zero-cost video hosting for testing and prototype deployment.
- **Limitation**: Unlisted videos are **not DRM protected**. Anyone who inspects network requests or browser source could extract the URL and share it outside PASCONX.

### YouTube Private
- **Limitation**: Private videos require individual Google Account permissions on YouTube's servers. They cannot be authorized solely via PASCONX credentials.
- **Admin Warning**: The admin panel displays an explicit advisory advising against YouTube Private for student course access.

---

## Future VdoCipher Multi-DRM Integration

To upgrade PASCONX to Hollywood-grade DRM:

1. Obtain VdoCipher credentials.
2. Update `server/.env`:
   ```env
   VIDEO_PROVIDER=vdocipher
   VDOCIPHER_API_SECRET=your_vdocipher_secret
   VDOCIPHER_API_KEY=your_vdocipher_key
   ```
3. The server-side `VdoCipherProvider` securely requests playback OTPs from `https://dev.vdocipher.com/api/videos/{id}/otp` and returns tokens along with student dynamic watermarking (`student@pasconx.com`).
4. **Zero secret credentials are ever sent to the browser.**

---

## Security Considerations & Anti-Leak Defenses

The platform maintains security through defense-in-depth:

1. **Custom Control Bar (`controls: 0`) & Zero YouTube Share/Logos**: Native YouTube controls, video title header, and "Watch on YouTube" logo links are completely removed by initializing the iframe with `controls: 0`, `fs: 0`, and `modestbranding: 1`. Playback is driven entirely by a custom PASCONX control bar.
2. **Transparent Top & Interactive Shields**: Prevents clicking on the video frame to open YouTube or trigger YouTube overlay drawers.
3. **No direct MP4 URLs**: The server never exposes raw media file links.
4. **No download buttons**: The interface includes no download mechanisms.
5. **Strict Authorization**: `checkVideoAccess` validates that `req.user.id` has an active enrollment for the video's course.
6. **URL Sharing Ineffectiveness**: If Student A shares `/student/watch/12` with Student B, Student B receives an HTTP 403 Forbidden error unless also enrolled in that course.
7. **Backend-Enforced Expiration**: Playback endpoints check `access_expiry >= datetime('now')`. Expired courses immediately return HTTP 403.
8. **Dynamic Forensic Student Watermarking (Anti-Screenshot/Recording)**: Floats the student's name, email (`student@pasconx.com`), and institute ID dynamically across the video frame every 8 seconds. Any screenshot or screen recording permanently captures the student's personal identity.
9. **Anti-Screenshot Keyboard Interception**: Catches `PrintScreen`, `Win+Shift+S`, `Ctrl+Shift+S`, and `Ctrl+P`, immediately triggering a blackout security shield and overwriting the OS clipboard.
10. **Window Focus Loss Shield (Snipping Tool Defeat)**: When the browser window loses focus (e.g. when launching the Windows Snipping Tool or third-party capture utilities), the video player immediately blacks out with a `"Playback Shielded"` message.
11. **Context Menu & Selection Disabled**: Right-clicking (`onContextMenu`), drag-and-drop, and text highlighting are blocked across the player.
12. **Print Stylesheet Stripping**: `@media print` rules set player visibility to `none !important`.
13. **Rate Limiting & HTTP-Only Cookies**: Auth endpoints limit brute-force attempts and session tokens are shielded against XSS attacks.

> **Transparent Anti-Download Reality**: While these client-side shields block YouTube share menus, "Watch on YouTube" navigation, and screen captures, complete DRM encryption requires VdoCipher. For commercial Widevine/FairPlay encryption, switch the provider configuration to VdoCipher.

---

## Automated Test Suite

The server includes 15 automated integration tests verifying all critical security and functional workflows:

```bash
cd server
npm test
```

### Verified Test Cases:
1. `Student login succeeds with valid credentials`
2. `Invalid login fails with 401 and user-friendly error`
3. `Disabled student login is rejected with 403`
4. `Student sees only assigned courses on dashboard`
5. `Student cannot access another student's course (403)`
6. `Student cannot access expired course (403 with expiry message)`
7. `Student cannot access course before start date (403)`
8. `Student cannot access admin API (403 Forbidden)`
9. `Admin can create new student`
10. `Admin can create course`
11. `Admin can add video with YouTube provider and unlisted privacy`
12. `Admin can enroll student into a course with access dates`
13. `Student can watch authorized YouTube video and receives safe playback payload`
14. `Student cannot watch unauthorized video (403 Forbidden)`
15. `Logout clears cookie and invalidates session`

---

## Production Deployment Instructions

### 1. Build Client
```bash
cd client
npm run build
```
Generates production-optimized bundle in `client/dist`.

### 2. Environment Configuration
Set `NODE_ENV=production`, configure a strong random `SESSION_SECRET`, and point `CLIENT_URL` to your production domain.

### 3. Database Migration (Optional)
To use PostgreSQL or MySQL instead of SQLite, replace `better-sqlite3` calls with Knex or Prisma using the matching schema outlined in [Database Setup](#database-setup--migration-readiness).

### 4. Process Manager
Run the server using PM2 or Docker:
```bash
pm2 start server/src/server.js --name "pasconix-api"
```

---

&copy; 2026 PASCONX. All rights reserved.
