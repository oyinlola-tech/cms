# Church Management System (CMS) – Sacred Hearth (Okitipupa) 

This project is a Church Management System (CMS) built to help a local church in **Okitipupa, Ondo State, Nigeria** manage records and operations digitally.

It contains:
- **Public Website**: announcements, programs, gallery, contact.
- **Admin Dashboard**: members management, finance tracking, reports/settings (foundation included).

## Tech Stack
- **Backend**: Node.js, Express, MySQL (`mysql2`)
- **Auth**: JWT (Bearer token) with RBAC (Role-Based Access Control)
- **File Uploads**: `multer` (images only)
- **Frontend**: Static HTML pages with Tailwind (CDN) + shared JS (`js/app.js`)
- **Database**: MySQL with connection pooling

## Security Features
- **SQL Injection Protection**: All queries use parameterized statements with column whitelist validation
- **RBAC**: Role-based access control (super_admin, admin, editor, viewer),
  enforced per-endpoint via `requirePermission(...)` in every router
- **Rate Limiting**: Comprehensive rate limiting on all endpoints
- **Request ID**: Unique request IDs for tracing and debugging
- **Activity Logging**: All CRUD operations are logged to the database
- **Input Sanitization**: HTML content fields are sanitized
- **Password Policy**: Strong password requirements (8+ chars, uppercase, lowercase, number, special char)

## Project Structure
- `server.js` – Express server + API + page routes
- `db-init.js` – Creates DB/tables and inserts defaults (first run)
- `public/` – Public website pages and assets
- `src/` – Admin dashboard pages (served as HTML)
- `js/app.js` – Shared frontend logic (public + admin)
- `uploads/` – Uploaded images (created automatically at runtime)
- `backend/` – Backend logic, routes, middleware, services

### Folder/Files Tree (key files)

```
.env
.env.example
.gitignore
db-init.js
js/app.js
lib/utils.js
package.json
package-lock.json
server.js
README.md
SECURITY.md

public/
  index.html
  favicon.svg
  images/
    default-avatar.svg
    placeholder.svg
  pages/
    announcements.html
    announcement-details.html
    programs.html
    gallery.html
    contact.html
    privacy.html
    terms.html
    give.html
    error/
      404.html
      403.html
      500.html
      empty.html
      offline.html

src/
  index.html
  auth/
    login.html
    forgot-password.html
    verify-otp.html
    reset-password.html
  pages/
    members.html
    finance.html
    programs.html
    announcements.html
    gallery.html
    reports.html
    settings.html
    details/
      members-details.html

backend/
  app.js                 # Express app configuration
  start.js               # Server startup with graceful shutdown
  config/
    env.js               # Environment configuration
  middleware/
    auth.js              # JWT authentication
    error-handler.js     # Error handling
    not-found.js         # 404 handler
    rate-limit.js        # Rate limiting
    request-id.js        # Request ID generation
    rbac.js              # Role-based access control
    security.js          # Security headers (CSP, CORS, etc.)
  routes/
    admin-content.js     # Admin content routes (programs, announcements, gallery)
    admin-core.js        # Admin core routes (dashboard, settings, contact)
    auth.js              # Authentication routes
    finance.js           # Finance routes
    members.js           # Members + attendance + household routes
    pages.js             # Page serving routes
    public.js            # Public API routes
    users.js             # User account management (admin)
  services/
    email-service.js     # Email service (nodemailer)
    scheduler.js         # Publishes scheduled announcements
    upload-service.js    # File upload service (multer)
  utils/
    activity-log.js      # Audit trail written for every successful write
    async-handler.js     # Async error handler
    db.js                # Database query helper with transactions
    format.js            # Formatting utilities
    sanitize.js          # Input sanitization
    validation.js        # Input validation

uploads/           # Created at runtime for uploaded images
```

## Features (Current)
### Public Website
- Announcements (list + details)
- Programs (upcoming, highlights, weekly schedule)
- Gallery (paginated)
- Contact form (stored in DB)

### Admin Dashboard
- Authentication (login, forgot password via OTP, reset password)
- Dashboard stats + recent activity + upcoming program
- Members: list, search, create, edit, delete, view details
- Finance: summary, paginated transactions, create transaction, export CSV
- Programs: full CRUD (create/edit/delete, search, pagination)
- Announcements: full CRUD (draft/publish/schedule/archive, search, pagination)
- Gallery: upload, edit metadata, delete, bulk delete, search, pagination
- Reports: member statistics, financial trends, engagement metrics
- Settings: profile management, password change, external links, contact inbox

## Requirements
- Node.js 18+ recommended
- MySQL 8+ (or compatible)

## Setup (Local Development)
1. Install dependencies:
   - `npm install`
2. Create your environment file:
   - Copy `.env.example` → `.env`
   - Update values (especially `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
3. Start MySQL and ensure credentials match your `.env`.
4. Run the server:
   - `npm run dev` (recommended)  
   - or `npm start`
5. Open:
   - Public site: `http://localhost:3000/`
   - Admin login: `http://localhost:3000/admin/login`
   - Health check: `http://localhost:3000/health`

On first run, the app will:
- Create the database (if missing)
- Create required tables
- Insert default church info + weekly schedule
- Create the default admin user (if it doesn't already exist)

## Environment Variables
See `.env.example` for all available variables.

Minimum required:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` (must be set; in production it must be 32+ chars)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (for first run admin creation)

## Security Notes (Important)
- Never commit `.env` to git (it is already ignored).
- Change the default/weak admin password before production.
- Use HTTPS in production (reverse proxy like Nginx/Caddy).
- Set a strong `JWT_SECRET` and rotate it if compromised.
- Consider hosting Tailwind assets locally for stronger supply-chain control.

## Common URLs
- `/` – Public homepage
- `/programs` – Public programs
- `/gallery` – Public gallery
- `/announcements` – Public announcements
- `/announcements/:id` – Announcement details
- `/contact` – Contact page
- `/privacy` – Privacy policy
- `/terms` – Terms of service
- `/give` – Give online
- `/admin/login` – Admin login
- `/admin/forgot-password` – Forgot password
- `/admin/verify-otp` – OTP verification
- `/admin/reset-password` – Reset password
- `/admin/dashboard` – Admin dashboard
- `/admin/members` – Members management
- `/admin/members/:id` – Member details
- `/admin/finance` – Finance management
- `/admin/programs` – Programs management
- `/admin/announcements` – Announcements management
- `/admin/gallery` – Gallery management
- `/admin/reports` – Reports
- `/admin/settings` – Settings
- `/health` – Health check endpoint

## API Quick Reference
### Security model

- **Sessions**: JWTs carry a `purpose` claim and a `tv` (token version). Changing
  or resetting a password, deactivating an account, or logging out increments
  `token_version`, which immediately invalidates every token issued before it.
  A password-reset token cannot be used as a session token, or vice versa.
- **Authorization**: `authenticate` resolves the user and caches their role on
  the request; `requirePermission('members:write')` and friends gate each route.
  Roles are never trusted from the client.
- **Input**: long-form fields are stored as plain text (`backend/utils/sanitize.js`).
  Announcement bodies render through text nodes, so stored markup can never
  execute. Enum columns are validated in the route before reaching MySQL.
- **Uploads**: accepted files are re-checked against their magic bytes after
  landing on disk, so a payload that merely claims to be a PNG is deleted.
- **CSP**: `script-src` does not allow `'unsafe-inline'`. Page behaviour is
  dispatched by `js/page-init.js` from a `data-page` attribute on `<body>`;
  do not add inline `<script>` blocks.

### Configuration that matters in production

| Variable | Why |
| --- | --- |
| `JWT_SECRET` | Must be 32+ chars. Startup fails otherwise. |
| `CORS_ORIGIN` | Must list at least one origin. An empty list reflects any origin, so startup fails in production. |
| `TRUST_PROXY_HOPS` | Number of proxies in front of the app. Leave at `0` when exposed directly, or clients can spoof their IP and evade rate limits. |
| `ADMIN_PASSWORD` | Bootstraps the first `super_admin`. Weak values fail startup in production. |

All API routes are under `/api/v1`, which is what the frontend calls. The same
router is also mounted at `/api/*` for backward compatibility - it is a second
mount of the identical handlers, not a redirect, so both prefixes behave the same.

Public:
- `GET /api/v1/announcements`
- `GET /api/v1/announcements/:id`
- `GET /api/v1/programs`
- `GET /api/v1/programs/weekly-schedule`
- `GET /api/v1/gallery`
- `GET /api/v1/church/info`
- `POST /api/v1/contact/send`

Admin (requires `Authorization: Bearer <token>`):
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/change-password`
- `POST /api/v1/auth/logout` (revokes every token for the user)
- `PUT /api/v1/auth/profile`
- `GET /api/v1/dashboard/stats`
- `GET /api/v1/dashboard/donation-trends`
- `GET /api/v1/dashboard/recent-activity`
- `GET /api/v1/dashboard/upcoming-event`

Members (`members:read` / `members:write` / `members:delete`):
- `GET /api/v1/members`
- `GET /api/v1/members/stats`
- `GET /api/v1/members/lookup`
- `GET /api/v1/members/:id`
- `GET /api/v1/members/:id/profile`
- `GET /api/v1/members/:id/transactions`
- `GET /api/v1/members/:id/attendance`
- `POST /api/v1/members/:id/attendance`
- `DELETE /api/v1/members/:id/attendance/:attendanceId`
- `GET /api/v1/members/:id/household`
- `POST /api/v1/members/:id/household`
- `DELETE /api/v1/members/:id/household/:relatedId`
- `POST /api/v1/members/:id/avatar` (multipart form: `avatar`)
- `POST /api/v1/members`
- `PUT /api/v1/members/:id`
- `DELETE /api/v1/members/:id`

Finance (`finance:read` / `finance:write` / `finance:export`):
- `GET /api/v1/finance/summary`
- `GET /api/v1/finance/transactions`
- `POST /api/v1/finance/transactions`
- `PUT /api/v1/finance/transactions/:id`
- `DELETE /api/v1/finance/transactions/:id`
- `GET /api/v1/finance/export` (CSV)

Content (`programs:*` / `announcements:*` / `gallery:*`):
- `GET|POST /api/v1/admin/programs`, `GET|PUT|DELETE /api/v1/admin/programs/:id`
- `GET /api/v1/admin/programs/stats`
- `GET|POST /api/v1/admin/announcements`, `GET|PUT|DELETE /api/v1/admin/announcements/:id`
- `GET /api/v1/admin/announcements/stats`
- `GET /api/v1/admin/gallery`, `GET|PUT|DELETE /api/v1/admin/gallery/:id`
- `GET /api/v1/admin/gallery/stats`
- `POST /api/v1/admin/gallery` (multipart form: `image`, one file per request)

Settings and inbox (`settings:*` / `contact:*`):
- `GET|PUT /api/v1/admin/settings/links`
- `GET /api/v1/admin/contact/messages`
- `PUT /api/v1/admin/contact/messages/:id/read`
- `POST /api/v1/admin/contact/messages/:id/reply`

User accounts (`users:read` / `users:write` / `users:delete`):
- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `PUT /api/v1/admin/users/:id`
- `DELETE /api/v1/admin/users/:id`

## Role-Based Access Control (RBAC)
The system supports four roles with different permission levels:

| Role | Permissions |
|------|-------------|
| **super_admin** | Full access to all features |
| **admin** | Manage members, finance, content, settings |
| **editor** | Read members/finance, write programs/announcements/gallery |
| **viewer** | Read-only access to all features |

The bootstrap account from `ADMIN_EMAIL` is created with the `super_admin` role.
Further accounts are managed from **Admin -> Users**.

A user can never create, promote, or delete an account at or above their own
role, and the last active administrator cannot be deleted.

## Background jobs

`backend/services/scheduler.js` runs on an interval and promotes announcements
whose `scheduled_for` time has passed to `published`. It starts with the server
and stops during graceful shutdown.

## Testing

```bash
npm test
```

`test/app.test.js` boots the real router stack against a database double and
covers auth, RBAC, and the public API. `test/frontend.test.js` loads each HTML
page with `linkedom`, runs its real scripts, and asserts that selectors resolve,
handlers bind, and form payloads match the API contract.

## Production Checklist
- Set `NODE_ENV=production`
- Set a strong `JWT_SECRET` (32+ chars) - startup fails otherwise
- Set `CORS_ORIGIN` to your real domain(s) - startup fails if empty
- Set `TRUST_PROXY_HOPS` to the number of proxies in front of the app
- Set a strong `ADMIN_PASSWORD` (10+ chars) before first run
- Configure SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.) for OTP email delivery
- Serve over HTTPS; HSTS is sent automatically in production
- Use HTTPS (reverse proxy)
- Back up MySQL regularly
- Restrict server/network access to MySQL
- Set appropriate user roles (don't give everyone super_admin)

## License
ISC (see `package.json`).

## Changelog

### v1.1.0 (Current)
- Security: Fixed SQL injection vulnerabilities in UPDATE queries
- Security: Added RBAC middleware for role-based access control
- Security: Improved password validation (uppercase, lowercase, number, special char)
- Security: Fixed JWT parsing vulnerability in rate limiter
- Security: Added input sanitization utilities
- Feature: Added API versioning (/api/v1/)
- Feature: Added health check endpoint (/health)
- Feature: Added request ID middleware for tracing
- Feature: Added activity logging for all CRUD operations
- Improvement: Database connection pooling for better performance
- Improvement: Graceful shutdown handling
- Improvement: Database transactions for multi-query operations
- Improvement: Removed unused crypto npm package
- Improvement: Added missing indexes for better query performance

### v1.0.0
- Initial release with full church management features
