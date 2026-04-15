# Church Management System (CMS) – Sacred Hearth (Okitipupa)

This project is a Church Management System (CMS) built to help a local church in **Okitipupa, Ondo State, Nigeria** manage records and operations digitally.

It contains:
- **Public Website**: announcements, programs, gallery, contact.
- **Admin Dashboard**: members management, finance tracking, reports/settings (foundation included).

## Tech Stack
- **Backend**: Node.js, Express, MySQL (`mysql2`)
- **Auth**: JWT (Bearer token)
- **File Uploads**: `multer` (images only)
- **Frontend**: Static HTML pages with Tailwind (CDN) + shared JS (`js/app.js`)

## Project Structure
- `server.js` – Express server + API + page routes
- `db-init.js` – Creates DB/tables and inserts defaults (first run)
- `public/` – Public website pages and assets
- `src/` – Admin dashboard pages (served as HTML)
- `js/app.js` – Shared frontend logic (public + admin)
- `uploads/` – Uploaded images (created automatically at runtime)

### Folder/Files Tree (key files)

```
.env
.env.example
.gitignore
db-init.js
js/app.js
package.json
package-lock.json
server.js
README.md
SECURITY.md

public/
  index.html
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

On first run, the app will:
- Create the database (if missing)
- Create required tables
- Insert default church info + weekly schedule
- Create the default admin user (if it doesn’t already exist)

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
- `/admin/login` – Admin login
- `/admin/dashboard` – Admin dashboard
- `/admin/members` – Members management
- `/admin/members/:id` – Member details
- `/admin/finance` – Finance management

## API Quick Reference
All API routes are under `/api`.

Public:
- `GET /api/announcements`
- `GET /api/announcements/:id`
- `GET /api/programs`
- `GET /api/programs/weekly-schedule`
- `GET /api/gallery`
- `GET /api/church/info`
- `POST /api/contact/send`

Admin (requires `Authorization: Bearer <token>`):
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/verify-otp`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `PUT /api/auth/profile`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/recent-activity`
- `GET /api/dashboard/upcoming-event`
- `GET /api/members`
- `GET /api/members/:id`
- `GET /api/members/:id/profile`
- `POST /api/members`
- `PUT /api/members/:id`
- `DELETE /api/members/:id`
- `GET /api/finance/summary`
- `GET /api/finance/transactions`
- `POST /api/finance/transactions`
- `GET /api/finance/export` (CSV)
- `POST /api/admin/gallery` (multipart form: `image`)

## Production Checklist
- Set `NODE_ENV=production`
- Set a strong `JWT_SECRET` (32+ chars)
- Set `CORS_ORIGIN` to your real domain(s)
- Configure SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc.) for OTP email delivery
- Use HTTPS (reverse proxy)
- Back up MySQL regularly
- Restrict server/network access to MySQL

## License
ISC (see `package.json`).
