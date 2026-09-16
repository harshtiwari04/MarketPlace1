import type { Response } from 'express';
import { HTTP } from '../constants';

export const sendResponse = <T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode: number = HTTP.OK,
) => res.status(statusCode).json({ success: true, message, data });
