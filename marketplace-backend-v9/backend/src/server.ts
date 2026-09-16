import http from 'node:http';
import app from './app';
import { connectDB, disconnectDB } from './config/db';
import { env } from './config/env';
import { closeMailer, verifyMailer } from './config/mailer';
import { logger } from './utils/logger';

const bootstrap = async (): Promise<void> => {
  await connectDB();
  await verifyMailer(); // non-fatal: logs loudly on bad SMTP credentials

  const server = http.createServer(app);
  // Render's proxy keeps upstream connections alive for 60s; ours must be longer to avoid 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  // Cap slowloris-style clients. Multipart uploads to Cloudinary stream through in well under this.
  server.requestTimeout = 120_000;

  server.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`, {
      trustProxy: env.TRUST_PROXY,
      cookieSameSite: env.COOKIE_SAME_SITE,
      origins: env.CLIENT_URL,
      email: env.EMAIL_ENABLED ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : 'disabled',
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      closeMailer();
      await disconnectDB();
      process.exit(0);
    });
    // Stop accepting keep-alive reuse so in-flight connections drain.
    server.closeIdleConnections?.();
    // Force exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { err: err.stack ?? err.message });
  process.exit(1);
});

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
