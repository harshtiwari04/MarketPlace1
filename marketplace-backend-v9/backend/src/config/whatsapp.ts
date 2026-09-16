import axios from 'axios';
import { env } from './env';

/** Pre-configured Graph API client scoped to our WhatsApp Business phone number. */
export const whatsappClient = axios.create({
  baseURL: `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
  // Meta returns 4xx with a JSON body for template/recipient problems — we want to read it, not throw blindly.
  validateStatus: (s) => s < 500,
});
