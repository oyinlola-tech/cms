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
- **RBAC**: Role-based access control (super_admin, admin, editor, viewer)
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
    members.js           # Members routes
    pages.js             # Page serving routes
    public.js            # Public API routes
  services/
    email-service.js     # Email service (nodemailer)
    upload-service.js    # File upload service (multer)
  utils/
    activity-log.js      # Activity logging
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
All API routes are under `/api/v1`. Backward compatibility: `/api/*` redirects to `/api/v1/*`.

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
- `PUT /api/v1/auth/profile`
- `GET /api/v1/dashboard/stats`
- `GET /api/v1/dashboard/recent-activity`
- `GET /api/v1/dashboard/upcoming-event`
- `GET /api/v1/members`
- `GET /api/v1/members/:id`
- `GET /api/v1/members/:id/profile`
- `POST /api/v1/members`
- `PUT /api/v1/members/:id`
- `DELETE /api/v1/members/:id`
- `GET /api/v1/finance/summary`
- `GET /api/v1/finance/transactions`
- `POST /api/v1/finance/transactions`
- `GET /api/v1/finance/export` (CSV)
- `POST /api/v1/admin/gallery` (multipart form: `image`)

## Role-Based Access Control (RBAC)
The system supports four roles with different permission levels:

| Role | Permissions |
|------|-------------|
| **super_admin** | Full access to all features |
| **admin** | Manage members, finance, content, settings |
| **editor** | Read members/finance, write programs/announcements/gallery |
| **viewer** | Read-only access to all features |

Default admin user is created with `super_admin` role.

## Production Checklist
- Set `NODE_ENV=production`
- Set a strong `JWT_SECRET` (32+ chars)
- Set `CORS_ORIGIN` to your real domain(s)
- Configure SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.) for OTP email delivery
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
