import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, type Role } from '../constants';

export interface IAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface IUser {
  name: string;
  email?: string;
  password?: string;
  googleId?: string;
  phone?: string;
  role: Role;
  storeName?: string;
  storeDescription?: string;
  addresses: IAddress[];
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  emailVerifiedAt?: Date;
  /** Admin-controlled kill switch: suspended users can't sign in and existing sessions stop resolving. */
  isSuspended: boolean;
  lastLoginAt?: Date;
  loginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const addressSchema = new Schema<IAddress>(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'IN' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // unique + sparse → index is created by `unique`; sparse allows Google-only users without email.
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    phone: { type: String, sparse: true, index: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.BUYER },
    storeName: { type: String, trim: true, maxlength: 100 },
    storeDescription: { type: String, trim: true, maxlength: 300 },
    addresses: { type: [addressSchema], default: [] },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    isSuspended: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ lastLoginAt: -1 });
userSchema.index({ name: 'text', email: 'text', storeName: 'text' }, { weights: { email: 5, name: 3, storeName: 1 } });

export const User = model<IUser, UserModel>('User', userSchema);
