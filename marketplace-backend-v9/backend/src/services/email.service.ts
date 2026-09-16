// import { env } from '../config/env';
// import { mailer } from '../config/mailer';
// import { logger } from '../utils/logger';

// interface SendEmailInput {
//   to: string;
//   subject: string;
//   html: string;
//   /** Plain-text alternative. Improves deliverability and is what screen readers / text clients show. */
//   text: string;
// }

// /** SMTP failures worth one retry: connection drops, timeouts, 4xx "try again later" greylisting. */
// const isTransient = (err: unknown): boolean => {
//   const e = err as { code?: string; responseCode?: number };
//   if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500) return true; // 421/450/451/452
//   return ['ETIMEDOUT', 'ECONNRESET', 'ECONNECTION', 'ESOCKET', 'EPIPE', 'EAI_AGAIN'].includes(e.code ?? '');
// };

// const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// /**
//  * Sends transactional email via Nodemailer/SMTP. Returns true if the relay accepted the message.
//  *
//  * Delivery is best-effort from the caller's point of view: auth flows must never leak whether an
//  * address exists (forgot-password returns the same response either way), so callers log/flag a
//  * failure but don't turn it into a 500. Failures are visible in logs and the user always has a
//  * "resend code" path.
//  */
// export const sendEmail = async ({ to, subject, html, text }: SendEmailInput): Promise<boolean> => {
//   if (!mailer) {
//     // Dev/test: env.ts guarantees SMTP is configured in production, so this branch never runs there.
//     logger.warn('SMTP not configured — email logged instead of sent', { to, subject });
//     return false;
//   }

//   const message = {
//     from: env.EMAIL_FROM,
//     to,
//     subject,
//     html,
//     text,
//     headers: { 'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }, // stops Gmail threading codes together
//   };

//   for (let attempt = 1; attempt <= 2; attempt++) {
//     try {
//       const info = await mailer.sendMail(message);
//       logger.info('Email sent', { to, subject, messageId: info.messageId, accepted: info.accepted?.length ?? 0 });
//       return true;
//     } catch (err) {
//       const detail = err instanceof Error ? err.message : String(err);
//       if (attempt === 1 && isTransient(err)) {
//         logger.warn('Email send failed — retrying once', { to, subject, err: detail });
//         await sleep(750);
//         continue;
//       }
//       logger.error('Email send failed', { to, subject, err: detail });
//       return false;
//     }
//   }
//   return false;
// };

// const wrapper = (title: string, bodyHtml: string) => `
// <!doctype html>
// <html>
//   <body style="margin:0;padding:0;background:#f4f6f5;font-family:Manrope,Arial,sans-serif;">
//     <table role="presentation" width="100%" style="padding:32px 0;">
//       <tr><td align="center">
//         <table role="presentation" width="480" style="background:#ffffff;border-radius:12px;padding:32px;">
//           <tr><td>
//             <h1 style="margin:0 0 16px;font-size:20px;color:#14251c;">${title}</h1>
//             ${bodyHtml}
//             <p style="margin-top:32px;font-size:12px;color:#8a938d;">Marketplace · This is an automated message, please don't reply directly to this email.</p>
//           </td></tr>
//         </table>
//       </td></tr>
//     </table>
//   </body>
// </html>`;

// export const sendVerificationCodeEmail = (to: string, name: string, code: string): Promise<boolean> =>
//   sendEmail({
//     to,
//     subject: `${code} is your verification code`,
//     text: `Hi ${name},\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't create an account, you can ignore this email.`,
//     html: wrapper(
//       'Verify your email',
//       `<p style="color:#4a534e;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, use this code to confirm your email address:</p>
//        <p style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#f4f6f5;border-radius:8px;padding:16px 28px;font-size:32px;font-weight:700;letter-spacing:8px;color:#14251c;">${escapeHtml(code)}</span></p>
//        <p style="color:#8a938d;font-size:12px;">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>`,
//     ),
//   });

// export const sendPasswordResetEmail = (to: string, name: string, resetUrl: string): Promise<boolean> =>
//   sendEmail({
//     to,
//     subject: 'Reset your password',
//     text: `Hi ${name},\n\nWe received a request to reset your password. Open this link to choose a new one (valid for 30 minutes):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
//     html: wrapper(
//       'Reset your password',
//       `<p style="color:#4a534e;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, we received a request to reset your password.</p>
//        <p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(resetUrl)}" style="background:#1F6F4F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset password</a></p>
//        <p style="color:#8a938d;font-size:12px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
//     ),
//   });

// function escapeHtml(s: string): string {
//   return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// }
import { env } from '../config/env';
import { mailer } from '../config/mailer';
import { logger } from '../utils/logger';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Improves deliverability and is what screen readers / text clients show. */
  text: string;
}

/** SendGrid failures worth one retry: rate limiting and transient 5xx — not 4xx auth/payload errors. */
const isTransient = (err: unknown): boolean => {
  const e = err as { code?: number };
  return e.code === 429 || (typeof e.code === 'number' && e.code >= 500 && e.code < 600);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends transactional email via the SendGrid Web API. Returns true if SendGrid accepted the message.
 *
 * Delivery is best-effort from the caller's point of view: auth flows must never leak whether an
 * address exists (forgot-password returns the same response either way), so callers log/flag a
 * failure but don't turn it into a 500. Failures are visible in logs and the user always has a
 * "resend code" path.
 */
export const sendEmail = async ({ to, subject, html, text }: SendEmailInput): Promise<boolean> => {
  if (!mailer) {
    // Dev/test: env.ts guarantees SendGrid is configured in production, so this branch never runs there.
    logger.warn('SendGrid not configured — email logged instead of sent', { to, subject });
    return false;
  }

  const message = {
    to,
    from: env.EMAIL_FROM,
    subject,
    html,
    text,
    headers: { 'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }, // stops Gmail threading codes together
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const [response] = await mailer.send(message);
      logger.info('Email sent', { to, subject, statusCode: response.statusCode, messageId: response.headers['x-message-id'] });
      return true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (attempt === 1 && isTransient(err)) {
        logger.warn('Email send failed — retrying once', { to, subject, err: detail });
        await sleep(750);
        continue;
      }
      logger.error('Email send failed', { to, subject, err: detail });
      return false;
    }
  }
  return false;
};

const wrapper = (title: string, bodyHtml: string) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f5;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" style="background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td>
            <h1 style="margin:0 0 16px;font-size:20px;color:#14251c;">${title}</h1>
            ${bodyHtml}
            <p style="margin-top:32px;font-size:12px;color:#8a938d;">Marketplace · This is an automated message, please don't reply directly to this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

export const sendVerificationCodeEmail = (to: string, name: string, code: string): Promise<boolean> =>
  sendEmail({
    to,
    subject: `${code} is your verification code`,
    text: `Hi ${name},\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't create an account, you can ignore this email.`,
    html: wrapper(
      'Verify your email',
      `<p style="color:#4a534e;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, use this code to confirm your email address:</p>
       <p style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#f4f6f5;border-radius:8px;padding:16px 28px;font-size:32px;font-weight:700;letter-spacing:8px;color:#14251c;">${escapeHtml(code)}</span></p>
       <p style="color:#8a938d;font-size:12px;">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>`,
    ),
  });

export const sendPasswordResetEmail = (to: string, name: string, resetUrl: string): Promise<boolean> =>
  sendEmail({
    to,
    subject: 'Reset your password',
    text: `Hi ${name},\n\nWe received a request to reset your password. Open this link to choose a new one (valid for 30 minutes):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: wrapper(
      'Reset your password',
      `<p style="color:#4a534e;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, we received a request to reset your password.</p>
       <p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(resetUrl)}" style="background:#1F6F4F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset password</a></p>
       <p style="color:#8a938d;font-size:12px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    ),
  });

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}