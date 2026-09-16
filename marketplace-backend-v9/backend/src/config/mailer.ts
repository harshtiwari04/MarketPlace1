import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Pooled SMTP transport. A pool keeps a few authenticated connections open so a burst of
 * registrations doesn't pay the TLS + AUTH handshake per message (and so Gmail/Zoho don't see
 * hundreds of short-lived logins, which is what trips their abuse heuristics).
 *
 * `null` when SMTP isn't configured (dev/test) — email.service logs instead of sending.
 */
export const mailer: Transporter | null = env.EMAIL_ENABLED
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // 465 → TLS from the first byte; 587 → STARTTLS (requireTLS below)
      requireTLS: !env.SMTP_SECURE, // never fall back to plaintext on 587
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    })
  : null;

/**
 * Best-effort startup probe — logs loudly if credentials are wrong so you find out at deploy
 * time, not when the first customer never receives their code. Never throws: an SMTP hiccup at
 * boot must not take the whole API down.
 */
export const verifyMailer = async (): Promise<void> => {
  if (!mailer) {
    logger.warn('SMTP not configured — emails will be logged, not sent (fine for dev/test only)');
    return;
  }
  try {
    await mailer.verify();
    logger.info('SMTP transport verified', { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER });
  } catch (err) {
    logger.error('SMTP verification failed — verification/reset emails will NOT be delivered until fixed', {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      err: err instanceof Error ? err.message : String(err),
    });
  }
};

export const closeMailer = (): void => {
  mailer?.close();
};
