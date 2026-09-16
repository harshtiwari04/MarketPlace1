import { isAxiosError } from 'axios';
import { whatsappClient } from '../config/whatsapp';
import { env } from '../config/env';
import { ORDER_STATUS_LABELS } from '../constants';
import type { IOrder } from '../models/Order';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { formatInr, toWhatsAppId } from '../utils/phone';

type TextParam = { type: 'text'; text: string };

interface BodyComponent {
  type: 'body';
  parameters: TextParam[];
}
interface UrlButtonComponent {
  type: 'button';
  sub_type: 'url';
  index: string;
  parameters: TextParam[];
}
type TemplateComponent = BodyComponent | UrlButtonComponent;

interface SendResult {
  messageId?: string;
}

interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
  fbtrace_id?: string;
}

/**
 * Template parameters may not contain newlines, tabs or 4+ consecutive spaces, and each
 * should stay reasonably short — sanitize everything we interpolate.
 */
const cleanParam = (value: string, max = 200): string => value.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Meta error codes that operators can act on. Logged verbatim; the user only ever sees a generic
 * 502 so a misconfiguration never leaks tenancy details.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const OPERATOR_HINTS: Record<number, string> = {
  190: 'Access token invalid/expired — regenerate a permanent System User token and update WHATSAPP_TOKEN.',
  100: 'Bad request — usually a parameter count/format mismatch with the approved template.',
  131026: 'Recipient cannot receive messages (not on WhatsApp / opted out).',
  131030: 'Recipient not in the allowed list — the WhatsApp Business account is still in sandbox/unverified mode. Complete business verification or add the number under Test Numbers.',
  131047: 'Re-engagement window expired — only template messages allowed (we already use templates; check template category).',
  131051: 'Unsupported message type.',
  132000: 'Template parameter count mismatch — the number of {{n}} placeholders differs from what we send.',
  132001: `Template "${env.WHATSAPP_OTP_TEMPLATE}" not found or not approved for language "${env.WHATSAPP_TEMPLATE_LANG}".`,
  132005: 'Template text is too long or violates policy.',
  132007: 'Template format character policy violated (newlines/tabs/4+ spaces in a parameter).',
  132012: 'Template parameter format mismatch.',
  132015: 'Template is paused (quality rating). Fix in WhatsApp Manager.',
  132016: 'Template disabled for quality reasons.',
  133010: 'Phone number not registered with the Cloud API.',
  135000: 'Generic user error — check the payload.',
  80007: 'Rate limit hit on the WhatsApp Business account.',
  130429: 'Throughput limit hit — too many messages per second to this phone number ID.',
  131056: 'Pair rate limit — too many messages to the same recipient in a short window.',
};

const RETRYABLE_CODES = new Set([80007, 130429, 131056, 131000, 131016]);

const describeError = (err: unknown): { detail: unknown; graph?: GraphError } => {
  if (isAxiosError(err)) {
    const graph = (err.response?.data as { error?: GraphError } | undefined)?.error;
    return { detail: graph ?? err.response?.data ?? err.message, graph };
  }
  return { detail: String(err) };
};

const handleError = (context: string, err: unknown): never => {
  const { detail, graph } = describeError(err);
  const hint = graph?.code != null ? OPERATOR_HINTS[graph.code] : undefined;
  logger.error(`WhatsApp ${context} failed`, { detail, ...(hint ? { hint } : {}) });
  throw ApiError.badGateway(`Unable to send WhatsApp ${context}. Please try again shortly.`, undefined, 'WHATSAPP_DELIVERY_FAILED');
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Low-level Graph API call with one retry for transient failures (5xx, network, throughput limits).
 * Meta's own guidance is to retry with backoff on 130429/80007; anything else is terminal.
 */
const postMessage = async (payload: Record<string, unknown>, attempt = 1): Promise<SendResult> => {
  try {
    const res = await whatsappClient.post('/messages', payload);
    if (res.status >= 400) {
      const graph = (res.data as { error?: GraphError } | undefined)?.error;
      const error = Object.assign(new Error(graph?.message ?? `Graph API ${res.status}`), {
        isAxiosError: true,
        response: res,
        toJSON: () => ({}),
      });
      if (attempt === 1 && graph?.code != null && RETRYABLE_CODES.has(graph.code)) {
        await sleep(500);
        return postMessage(payload, 2);
      }
      throw error;
    }
    return { messageId: res.data?.messages?.[0]?.id };
  } catch (err) {
    // Network-level failures / 5xx (validateStatus lets 4xx through as responses)
    if (attempt === 1 && isAxiosError(err) && (!err.response || err.response.status >= 500)) {
      await sleep(500);
      return postMessage(payload, 2);
    }
    throw err;
  }
};

export const sendTemplate = async (
  toE164: string,
  templateName: string,
  components: TemplateComponent[] = [],
  languageCode: string = env.WHATSAPP_TEMPLATE_LANG,
): Promise<SendResult> => {
  const template: Record<string, unknown> = { name: templateName, language: { code: languageCode } };
  if (components.length > 0) template.components = components;

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsAppId(toE164),
    type: 'template',
    template,
  });
};

/** Free-form text — only deliverable inside the 24h customer-service window. */
export const sendText = async (toE164: string, body: string): Promise<SendResult> =>
  postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsAppId(toE164),
    type: 'text',
    text: { preview_url: false, body },
  });

/**
 * OTP delivery — always a real WhatsApp message via the approved *Authentication*-category
 * template WHATSAPP_OTP_TEMPLATE (body {{1}} = code, COPY_CODE button index 0 = code).
 * There is deliberately no logging/dev fallback: a code that only exists in a server log is a
 * code a customer never received. Tests mock this module.
 */
// export const sendOtp = async (phoneE164: string, code: string): Promise<SendResult> => {
//   try {
//     const result = await sendTemplate(phoneE164, env.WHATSAPP_OTP_TEMPLATE, [
//       { type: 'body', parameters: [{ type: 'text', text: cleanParam(code, 10) }] },
//       { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: cleanParam(code, 10) }] },
//     ]);
//     logger.info('WhatsApp OTP dispatched', { to: maskPhone(phoneE164), messageId: result.messageId });
//     return result;
//   } catch (err) {
//     return handleError('OTP', err);
//   }
// };
export const sendOtp = async (phoneE164: string, code: string): Promise<SendResult> => {
  try {
    // Adapted temporarily to match the 3 parameters required by jaspers_market_order_confirmation_v1
    const result = await sendTemplate(phoneE164, env.WHATSAPP_OTP_TEMPLATE, [
      { 
        type: 'body', 
        parameters: [
          { type: 'text', text: cleanParam(code, 10) }, // Maps to {{1}}
          { type: 'text', text: cleanParam('Verification Code', 40) }, // Maps to {{2}}
          { type: 'text', text: cleanParam('Valid for 15 minutes', 40) } // Maps to {{3}}
        ] 
      },
    ]);
    logger.info('WhatsApp OTP dispatched', { to: maskPhone(phoneE164), messageId: result.messageId });
    return result;
  } catch (err) {
    return handleError('OTP', err);
  }
};

const summarizeItems = (order: IOrder): string => order.items.map((i) => `${i.title} x${i.quantity} ${i.unit}`).join(', ');

/**
 * Utility-category template `order_confirmation`:
 *   {{1}} order id · {{2}} item summary · {{3}} total amount
 */
export const sendOrderConfirmation = async (order: IOrder): Promise<SendResult> => {
  try {
    return await sendTemplate(order.buyer.phone, env.WHATSAPP_ORDER_TEMPLATE, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cleanParam(order.orderId, 40) },
          { type: 'text', text: cleanParam(summarizeItems(order), 300) },
          { type: 'text', text: cleanParam(formatInr(order.totalAmount), 30) },
        ],
      },
    ]);
  } catch (err) {
    return handleError('order confirmation', err);
  }
};

/**
 * Utility-category template `order_status_update`:
 *   {{1}} order id · {{2}} status label
 */
export const sendOrderStatusUpdate = async (order: IOrder): Promise<SendResult> => {
  try {
    return await sendTemplate(order.buyer.phone, env.WHATSAPP_STATUS_TEMPLATE, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: cleanParam(order.orderId, 40) },
          { type: 'text', text: cleanParam(ORDER_STATUS_LABELS[order.status], 40) },
        ],
      },
    ]);
  } catch (err) {
    return handleError('status update', err);
  }
};

/** +919876543210 → +91******3210 — enough to correlate a support ticket, not enough to leak a number in logs. */
const maskPhone = (e164: string): string => e164.replace(/^(\+\d{2})\d+(\d{4})$/, (_m, a, b) => `${a}******${b}`);
