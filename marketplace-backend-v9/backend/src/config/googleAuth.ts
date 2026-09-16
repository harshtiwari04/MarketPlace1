import { OAuth2Client } from 'google-auth-library';
import { env } from './env';

/**
 * The SPA obtains a Google ID token via Google Identity Services and POSTs it here.
 * Server-side verification of the token signature/audience replaces a Passport redirect flow.
 */
export const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
