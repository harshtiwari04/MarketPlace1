import { isProd } from '../config/env';

/* Structured logger. JSON in production (for any log aggregator — CloudWatch, Datadog, etc.),
 * human-readable in development. Swap for pino/winston later without touching call sites. */
const ts = () => new Date().toISOString();

const serializeMeta = (meta: unknown): unknown => {
  if (meta instanceof Error) return { name: meta.name, message: meta.message, stack: meta.stack };
  if (meta && typeof meta === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
    }
    return out;
  }
  return meta;
};

const write = (level: 'info' | 'warn' | 'error', msg: string, meta?: unknown) => {
  const entry = { level, ts: ts(), msg, ...(meta !== undefined ? { meta: serializeMeta(meta) } : {}) };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (isProd) {
    out(JSON.stringify(entry));
    return;
  }
  // Dev: readable single-line-ish output instead of a raw JSON blob.
  const metaStr = meta !== undefined ? ` ${JSON.stringify(entry.meta)}` : '';
  out(`[${entry.ts}] ${level.toUpperCase().padEnd(5)} ${msg}${metaStr}`);
};

export const logger = {
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
};
