import { HTTP } from '../constants';

/**
 * Operational (expected) error. `code` is a stable machine-readable identifier the SPA can branch
 * on (e.g. EMAIL_NOT_VERIFIED → redirect to the verify page) without string-matching messages.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly code?: string;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown, code?: string) {
    return new ApiError(HTTP.BAD_REQUEST, message, details, code);
  }
  static unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(HTTP.UNAUTHORIZED, message, undefined, code);
  }
  static forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(HTTP.FORBIDDEN, message, undefined, code);
  }
  static notFound(message = 'Not found', code?: string) {
    return new ApiError(HTTP.NOT_FOUND, message, undefined, code);
  }
  static conflict(message: string, code?: string) {
    return new ApiError(HTTP.CONFLICT, message, undefined, code);
  }
  static tooMany(message: string, code?: string) {
    return new ApiError(HTTP.TOO_MANY_REQUESTS, message, undefined, code);
  }
  static badGateway(message: string, details?: unknown, code?: string) {
    return new ApiError(HTTP.BAD_GATEWAY, message, details, code);
  }
  static serviceUnavailable(message: string, code?: string) {
    return new ApiError(HTTP.SERVICE_UNAVAILABLE, message, undefined, code);
  }
}
