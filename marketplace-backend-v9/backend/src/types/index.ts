import type { Role } from '../constants';

export interface AuthUser {
  id: string;
  role: Role;
  isGuest: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface PhoneVerificationPayload {
  phone: string;
  purpose: 'phone_verification';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
