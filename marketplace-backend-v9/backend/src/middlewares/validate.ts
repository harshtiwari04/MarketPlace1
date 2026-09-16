import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Validates and *replaces* req.body / req.params with the parsed (coerced, defaulted) values.
 * Query strings are parsed inside controllers with the same Zod schemas so the result is typed.
 */
export const validate =
  (schemas: { body?: ZodTypeAny; params?: ZodTypeAny }): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
