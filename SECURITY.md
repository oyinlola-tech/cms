# Security Policy

## Supported Versions
This project is currently maintained as a single active version. Security fixes are applied to the latest code in the repository.

## Reporting a Vulnerability
If you discover a security issue:
1. **Do not** open a public issue with exploit details.
2. Share the report privately with the project maintainer/church technical contact.
3. Include:
   - Steps to reproduce
   - Impact assessment (what can be accessed/changed)
   - Any logs/screenshots (remove secrets)

If you do not have a private contact, use the church support channel via the `/contact` page and clearly mark the subject as **SECURITY**.

## Responsible Disclosure
Please allow time to investigate and patch before public disclosure. We aim to:
- Acknowledge reports within **7 days**
- Provide a remediation plan within **30 days** (depending on severity)

## Security Best Practices (Deployment)
- Use **HTTPS** in production.
- Keep `.env` secret; never commit it.
- Use strong secrets:
  - `JWT_SECRET` should be **32+ characters** (random).
  - Change the default admin password immediately.
- Restrict access to the admin dashboard and database:
  - Firewall MySQL to trusted hosts only.
  - Use least-privilege database users.
- Back up data regularly.

