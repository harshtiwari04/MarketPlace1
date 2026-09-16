/** WhatsApp Cloud API expects the number in international format without '+'. */
export const toWhatsAppId = (e164Phone: string): string => e164Phone.replace(/\D/g, '');

export const formatInr = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
