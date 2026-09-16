import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface IEmailVerificationToken {
  user: Types.ObjectId;
  hashedCode: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

export type EmailVerificationTokenDocument = HydratedDocument<IEmailVerificationToken>;

const schema = new Schema<IEmailVerificationToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hashedCode: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL index: MongoDB removes the document once `expiresAt` passes (background job, ~60s granularity).
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken = model<IEmailVerificationToken>(
  'EmailVerificationToken',
  schema,
);
