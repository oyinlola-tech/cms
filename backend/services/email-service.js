const nodemailer = require('nodemailer');
const { escapeHtml } = require('../utils/format');

function renderBrandedEmail({ title, preheader, bodyHtml, footerNote }) {
  const brand = {
    primary: '#002d1c',
    secondary: '#735c00',
    surface: '#fbf9f5',
    text: '#1b1c1a'
  };

  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || '');
  const safeFooter = escapeHtml(footerNote || '');

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeTitle}</title>
    </head>
    <body style="margin:0;padding:0;background:${brand.surface};color:${brand.text};font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${brand.surface};padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);">
              <tr>
                <td style="padding:22px 24px;background:${brand.primary};color:#ffffff;">
                  <div style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.9;">Sacred Hearth</div>
                  <div style="font-size:22px;font-weight:800;margin-top:6px;line-height:1.2;">${safeTitle}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px;">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:18px 24px;background:#f5f3ef;color:#414844;font-size:12px;line-height:1.6;">
                  <div style="font-weight:700;color:${brand.secondary};margin-bottom:6px;">Need help?</div>
                  <div>${safeFooter}</div>
                </td>
              </tr>
            </table>
            <div style="font-size:11px;opacity:0.6;margin-top:14px;">&copy; ${new Date().getFullYear()} Sacred Hearth CMS</div>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function createEmailService(config) {
  const transporter = config.isProduction && config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user || config.smtp.pass
          ? {
              user: config.smtp.user,
              pass: config.smtp.pass
            }
          : undefined
      })
    : null;

  return {
    renderBrandedEmail,
    async sendOTP(email, otp) {
      if (config.isProduction && transporter) {
        await transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject: 'Your OTP for Password Reset',
          text: `Your one-time password is: ${otp}. It expires in 10 minutes.`,
          html: `<p>Your one-time password is: <strong>${escapeHtml(otp)}</strong></p><p>It expires in 10 minutes.</p>`
        });
        console.log(`[PROD] OTP email sent to ${email}`);
        return;
      }

      console.log(`\n[DEV] OTP for ${email}: ${otp}\n`);
    },
    async sendAppEmail({ to, subject, text, html }) {
      if (config.isProduction) {
        if (!transporter) {
          throw new Error('SMTP is not configured');
        }

        await transporter.sendMail({
          from: config.smtp.from,
          to,
          subject,
          text,
          html
        });
        return;
      }

      console.log('\n[DEV EMAIL]');
      console.log('To:', to);
      console.log('Subject:', subject);
      console.log(text || '(no text)');
      console.log('[/DEV EMAIL]\n');
    }
  };
}

module.exports = {
  createEmailService,
  renderBrandedEmail
};
