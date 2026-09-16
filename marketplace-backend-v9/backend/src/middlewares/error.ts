import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import jwt from 'jsonwebtoken';
import { ERROR_CODES, HTTP, MESSAGES } from '../constants';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`${MESSAGES.NOT_FOUND}: ${req.method} ${req.originalUrl}`));
};

interface NormalizedError {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
  /** Seconds — emitted as a Retry-After header for 429/503. */
  retryAfterSec?: number;
}

/** Duplicate-key errors on user-facing unique fields get a friendly message instead of "Duplicate value for: email". */
const DUPLICATE_KEY_MESSAGES: Record<string, { message: string; code: string }> = {
  email: { message: MESSAGES.EMAIL_IN_USE, code: ERROR_CODES.EMAIL_IN_USE },
  slug: { message: 'A product with a very similar title already exists — please retry', code: 'DUPLICATE_SLUG' },
};

const isMongoNetworkError = (err: unknown): boolean => {
  const name = (err as { name?: string })?.name ?? '';
  return (
    name === 'MongoNetworkError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoNetworkTimeoutError' ||
    name === 'MongooseServerSelectionError' ||
    // bufferCommands=false while disconnected
    /buffering timed out|Client must be connected before running operations|connection .* closed/i.test(
      (err as { message?: string })?.message ?? '',
    )
  );
};

const normalize = (err: unknown): NormalizedError => {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, message: err.message, details: err.details, code: err.code };
  }
  if (err instanceof ZodError) {
    return {
      statusCode: HTTP.BAD_REQUEST,
      message: 'Validation failed',
      code: ERROR_CODES.VALIDATION_FAILED,
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: HTTP.BAD_REQUEST,
      message: 'Validation failed',
      code: ERROR_CODES.VALIDATION_FAILED,
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { statusCode: HTTP.BAD_REQUEST, message: `Invalid value for ${err.path}`, code: ERROR_CODES.VALIDATION_FAILED };
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    const keys = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue ?? {});
    const friendly = keys.map((k) => DUPLICATE_KEY_MESSAGES[k]).find(Boolean);
    if (friendly) return { statusCode: HTTP.CONFLICT, ...friendly };
    return { statusCode: HTTP.CONFLICT, message: `Duplicate value for: ${keys.join(', ') || 'field'}`, code: 'DUPLICATE' };
  }
  if (err instanceof MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT';
    return {
      statusCode: tooBig ? HTTP.PAYLOAD_TOO_LARGE : HTTP.BAD_REQUEST,
      message: `Upload error: ${err.message}`,
      code: `UPLOAD_${err.code}`,
    };
  }
  if (err instanceof jwt.TokenExpiredError || err instanceof jwt.JsonWebTokenError) {
    return { statusCode: HTTP.UNAUTHORIZED, message: MESSAGES.INVALID_TOKEN, code: ERROR_CODES.INVALID_TOKEN };
  }
  // body-parser errors carry `type`
  const bp = err as { type?: string; status?: number };
  if (bp?.type === 'entity.too.large') {
    return { statusCode: HTTP.PAYLOAD_TOO_LARGE, message: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' };
  }
  if (bp?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return { statusCode: HTTP.BAD_REQUEST, message: 'Malformed JSON body', code: 'MALFORMED_JSON' };
  }
  if (bp?.type === 'request.aborted') {
    return { statusCode: HTTP.BAD_REQUEST, message: 'Request aborted by client', code: 'REQUEST_ABORTED' };
  }
  if (isMongoNetworkError(err)) {
    return {
      statusCode: HTTP.SERVICE_UNAVAILABLE,
      message: 'The service is temporarily unavailable. Please retry in a moment.',
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      retryAfterSec: 5,
    };
  }
  return { statusCode: HTTP.INTERNAL, message: MESSAGES.INTERNAL };
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { statusCode, message, details, code, retryAfterSec } = normalize(err);

  if (statusCode >= 500) {
    logger.error('Request failed', {
      method: req.method,
      url: req.originalUrl,
      status: statusCode,
      ip: req.ip,
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    });
  }

  if (res.headersSent) return; // e.g. stream already started — nothing sensible to do
  const detailRetryMs = (details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
  const retryAfter = retryAfterSec ?? (statusCode === HTTP.TOO_MANY_REQUESTS && detailRetryMs ? Math.ceil(detailRetryMs / 1000) : undefined);
  if (retryAfter) res.set('Retry-After', String(retryAfter));

  res.status(statusCode).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(!isProd && err instanceof Error && statusCode >= 500 ? { debug: err.message } : {}),
  });
};
