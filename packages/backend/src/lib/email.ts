import nodemailer from 'nodemailer';

interface SmtpCreds { host: string; port: number; user: string; pass: string }

// Per-user SMTP (connected via Settings > Email, see routes/emailSettings.ts) always
// wins when present — that's the whole point of that feature, invites should come from
// the inviter's own address. Otherwise fall back, in order, to a local msmtp relay
// (MSMTP_PATH — reuses the server's ~/.msmtprc for host/auth/TLS) or a system-wide
// SMTP_* env var. If none exists, sending is skipped (logged, not a crash).
function resolveTransporter(userSmtp?: SmtpCreds | null) {
  if (userSmtp?.user && userSmtp?.pass) {
    return nodemailer.createTransport({
      host: userSmtp.host || 'smtp.gmail.com',
      port: userSmtp.port || 587,
      secure: false,
      auth: { user: userSmtp.user, pass: userSmtp.pass },
    });
  }
  // msmtp is sendmail-compatible: nodemailer pipes the full message to it and `-t`
  // makes msmtp read recipients from the To/Cc/Bcc headers. Auth, host and TLS all
  // come from the server's msmtprc, so no credentials live in the app or its env.
  if (process.env.MSMTP_PATH) {
    return nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: process.env.MSMTP_PATH,
      args: ['-t', ...(process.env.MSMTP_ACCOUNT ? ['-a', process.env.MSMTP_ACCOUNT] : [])],
    });
  }
  if (process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
    });
  }
  return null;
}

// The address outgoing mail is sent From when it isn't the inviter's own connected
// account. With msmtp this must match an identity its msmtprc is allowed to send as.
const SYSTEM_FROM = process.env.MSMTP_FROM || process.env.SMTP_USER || '';

export async function sendInviteEmail({
  to,
  inviterName,
  inviterEmail,
  teamName,
  inviteLink,
  role,
  userSmtp,
}: {
  to: string;
  inviterName: string;
  inviterEmail: string;
  teamName: string;
  inviteLink: string;
  role: string;
  userSmtp?: SmtpCreds | null;
}) {
  const transporter = resolveTransporter(userSmtp);
  const fromAddress = userSmtp?.user || SYSTEM_FROM;

  if (!transporter) {
    console.log(`[Email skipped] No mail transport configured (no inviter SMTP, no MSMTP_PATH, no SMTP_USER). Invite link for ${to}: ${inviteLink}`);
    return false;
  }

  const mailOptions = {
    from: `"${inviterName} via DesignHub" <${fromAddress}>`,
    replyTo: inviterEmail,
    to,
    subject: `${inviterName} invited you to join "${teamName}" on DesignHub`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #7B2FBE, #4A0E8F); padding: 32px; text-align: center; }
          .header h1 { color: white; font-size: 24px; margin: 0; }
          .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 8px; }
          .body { padding: 32px; }
          .body h2 { font-size: 18px; color: #1a1a2e; margin: 0 0 12px; }
          .body p { font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 24px; }
          .badge { display: inline-block; background: #7B2FBE; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
          .btn { display: block; width: 100%; padding: 14px; background: #7B2FBE; color: white; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 600; text-align: center; margin: 24px 0; }
          .btn:hover { background: #6A25A8; }
          .footer { padding: 24px 32px; background: #f9f9f9; border-top: 1px solid #eee; text-align: center; }
          .footer p { font-size: 12px; color: #999; margin: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>DesignHub</h1>
            <p>Collaborative Design Platform</p>
          </div>
          <div class="body">
            <h2>You've been invited!</h2>
            <p><strong>${inviterName}</strong> has invited you to join the team <strong>"${teamName}"</strong> on DesignHub as a <span class="badge">${role}</span>.</p>
            <p>Click the button below to accept the invitation and start collaborating on designs together.</p>
            <a href="${inviteLink}" class="btn">Accept Invitation</a>
            <p style="font-size: 12px; color: #999;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${inviteLink}" style="color: #7B2FBE;">${inviteLink}</a></p>
            <p style="font-size: 12px; color: #999;">This invitation expires in 7 days.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} DesignHub. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email sent] To: ${to}, From: ${inviterName} <${inviterEmail}>, Team: ${teamName}`);
    return true;
  } catch (error: any) {
    console.error('Failed to send invite email:', error.message);
    return false;
  }
}

export async function sendNotificationEmail({
  to,
  subject,
  message,
}: {
  to: string;
  subject: string;
  message: string;
}) {
  const transporter = resolveTransporter(null);
  if (!transporter) {
    console.log(`[Email skipped] No mail transport configured. Subject: ${subject}`);
    return false;
  }

  const mailOptions = {
    from: `"DesignHub" <${SYSTEM_FROM}>`,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; }
          .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 32px; }
          .header { text-align: center; margin-bottom: 24px; }
          .header h1 { font-size: 20px; color: #1a1a2e; margin: 0; }
          .body { font-size: 14px; color: #555; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>DesignHub</h1>
          </div>
          <div class="body">
            <p>${message}</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error: any) {
    console.error('Failed to send notification email:', error.message);
    return false;
  }
}
