import { Schema, model, type HydratedDocument } from 'mongoose';

export interface IOtpSession {
  phone: string;
  hashedOtp: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpSessionDocument = HydratedDocument<IOtpSession>;

const otpSessionSchema = new Schema<IOtpSession>(
  {
    phone: { type: String, required: true, index: true, trim: true },
    hashedOtp: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index: MongoDB removes the document once `expiresAt` passes (background job, ~60s granularity).
otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpSession = model<IOtpSession>('OtpSession', otpSessionSchema);
