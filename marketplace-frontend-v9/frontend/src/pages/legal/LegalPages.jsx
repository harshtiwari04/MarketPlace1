import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { APP_NAME } from '../../lib/config';
import { Alert } from '../../components/ui/Alert';

/*
 * DRAFT legal copy — reviewed by nobody with a law degree yet.
 * Everything in [BRACKETS] must be filled in, and the whole set should be reviewed by a lawyer
 * familiar with Indian e-commerce law (Consumer Protection (E-Commerce) Rules 2020, IT Act 2000,
 * DPDP Act 2023) before real customers transact. The Rules in particular require a named
 * Grievance Officer, seller identity disclosure, and a clear return/refund policy on the site.
 */

const COMPANY = '[COMPANY LEGAL NAME]';
const ADDRESS = '[REGISTERED ADDRESS]';
const SUPPORT_EMAIL = '[support@your-domain.example]';
const GRIEVANCE = { name: '[GRIEVANCE OFFICER NAME]', email: '[grievance@your-domain.example]', phone: '[+91 …]' };
const UPDATED = '[DATE]';

function LegalShell({ title, children }) {
  useDocumentTitle(title);
  return (
    <article className="legal">
      <div className="page-head"><div><h1 className="page-title">{title}</h1><p className="text-muted">Last updated: {UPDATED}</p></div></div>
      <Alert tone="warning" title="Draft">This page is a template awaiting legal review. Do not rely on it until the placeholders are filled in and it has been approved.</Alert>
      {children}
    </article>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <h2>1. Who we are</h2>
      <p>{APP_NAME} is an online marketplace operated by {COMPANY}, {ADDRESS} (“we”, “us”). We provide the platform on which independent sellers list products and buyers purchase them. Unless a listing says otherwise, the seller named on the listing — not {APP_NAME} — is the seller of record and is responsible for the product, its description, and its fulfilment.</p>

      <h2>2. Accounts and guest checkout</h2>
      <p>You may buy as a guest by verifying a WhatsApp number, or create an account. You are responsible for keeping your credentials confidential and for activity on your account. You must be at least 18 years old, or have a guardian’s consent, to place an order.</p>

      <h2>3. Sellers</h2>
      <p>Sellers must provide accurate product information, honour listed prices and stock, ship within the stated timeframe, and comply with applicable law, including labelling and country-of-origin disclosure requirements. We may suspend or remove listings or seller accounts that breach these Terms or receive repeated complaints.</p>

      <h2>4. Orders, pricing and payment</h2>
      <p>An order is placed when payment is captured. Prices are shown in Indian Rupees and are re-calculated on our servers at checkout from the current listing; the price you pay is the one shown on the final review step. Payments are processed by Razorpay; we do not store card details. If a product becomes unavailable after payment is captured, the order (or affected item) is cancelled and the payment is refunded automatically — see the <Link to="/refunds">Refund Policy</Link>.</p>

      <h2>5. Delivery</h2>
      <p>Items from different sellers in one order may ship separately and arrive at different times. Delivery estimates are indicative. Risk in the goods passes to you on delivery to the address you provided.</p>

      <h2>6. Cancellations, returns and refunds</h2>
      <p>Set out in our <Link to="/refunds">Refund Policy</Link>, which forms part of these Terms.</p>

      <h2>7. Acceptable use</h2>
      <p>You must not use the platform to break the law, infringe others’ rights, upload malicious code, attempt to access other users’ data or orders, or interfere with the service. We may investigate and take appropriate action, including reporting to authorities.</p>

      <h2>8. Intellectual property</h2>
      <p>The platform, its design, and its software are ours or our licensors’. Listing content (titles, descriptions, images) belongs to the seller who uploaded it; by uploading, sellers grant us a licence to display and promote it on the platform.</p>

      <h2>9. Liability</h2>
      <p>To the extent permitted by law, we are not liable for indirect or consequential loss, and our aggregate liability to you in connection with an order is limited to the amount you paid for that order. Nothing in these Terms limits rights you have as a consumer under Indian law.</p>

      <h2>10. Grievance Officer</h2>
      <p>In line with the Consumer Protection (E-Commerce) Rules 2020 and the Information Technology Act 2000, our Grievance Officer is {GRIEVANCE.name}, reachable at {GRIEVANCE.email} or {GRIEVANCE.phone}. Complaints are acknowledged within 48 hours and resolved within one month of receipt.</p>

      <h2>11. Governing law</h2>
      <p>These Terms are governed by the laws of India. Courts at [CITY] have exclusive jurisdiction, subject to any mandatory consumer-protection forum.</p>

      <h2>12. Changes</h2>
      <p>We may update these Terms. Material changes will be announced on the site; continued use after the effective date constitutes acceptance. Contact: {SUPPORT_EMAIL}.</p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong>: name, email, password (stored as a hash), and — if you sign in with Google — the profile information Google shares.</li>
        <li><strong>Checkout data</strong>: WhatsApp phone number (verified by one-time code), delivery address, and optional email for receipts.</li>
        <li><strong>Order data</strong>: items, amounts, order and payment references from Razorpay. We never receive or store full card numbers.</li>
        <li><strong>Seller data</strong>: store name and the product listings and images you upload (images are hosted on Cloudinary).</li>
        <li><strong>Technical data</strong>: IP address, browser type, and request logs used for security and rate limiting.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>To process and deliver orders, send order confirmations and status updates on WhatsApp and (if provided) email, prevent fraud and abuse, provide customer support, meet legal and tax obligations, and improve the service. We do not sell personal data or use it for third-party advertising.</p>

      <h2>3. Who sees it</h2>
      <p>The seller(s) fulfilling your order receive your name, delivery address and phone number for the items they are shipping — and only those items. Our service providers process data on our behalf under contract: Razorpay (payments), Meta / WhatsApp Cloud API (messages), Cloudinary (images), [EMAIL PROVIDER] (email), [HOSTING PROVIDER] and MongoDB Atlas (hosting and storage). We disclose data to authorities where required by law.</p>

      <h2>4. Retention</h2>
      <p>Order and payment records are retained for [7] years to satisfy tax and accounting law. One-time codes expire within 5 minutes and are deleted automatically. Session tokens expire and are revoked on logout. You can request deletion of your account data (other than records we must keep) at {SUPPORT_EMAIL}.</p>

      <h2>5. Your rights</h2>
      <p>Under the Digital Personal Data Protection Act 2023 you may access, correct, and request erasure of your personal data, and nominate a person to exercise these rights on your behalf. Contact {SUPPORT_EMAIL}; we respond within 30 days.</p>

      <h2>6. Security</h2>
      <p>Traffic is encrypted in transit (TLS). Sessions use signed, HTTP-only cookies with rotating refresh tokens. Access to production systems is restricted and logged. No system is perfectly secure; if we learn of a breach affecting you we will notify you and the relevant authority as the law requires.</p>

      <h2>7. Cookies</h2>
      <p>We use strictly necessary cookies for login sessions and checkout. We do not use advertising or cross-site tracking cookies.</p>

      <h2>8. Contact and Grievance Officer</h2>
      <p>{COMPANY}, {ADDRESS}. Data protection queries: {SUPPORT_EMAIL}. Grievance Officer: {GRIEVANCE.name}, {GRIEVANCE.email}.</p>
    </LegalShell>
  );
}

export function RefundPage() {
  return (
    <LegalShell title="Cancellation & Refund Policy">
      <h2>1. Cancelling before dispatch</h2>
      <p>You can request cancellation of any item that has not yet been marked <em>Out for delivery</em> by contacting {SUPPORT_EMAIL} with your order number. Sellers may also cancel an item they cannot fulfil. Cancelled items are refunded in full.</p>

      <h2>2. Automatic refunds</h2>
      <p>If an item sells out between you paying and the payment being confirmed, that item is cancelled and refunded automatically. You will see the refund reference on your order page.</p>

      <h2>3. Returns</h2>
      <p>[DEFINE YOUR POLICY. Common structure: returns accepted within N days of delivery for items that are damaged, defective, or materially different from the listing; items must be unused and in original packaging; certain categories (perishables, personal care, made-to-order) are excluded.] The seller may ask for photos to assess the issue.</p>

      <h2>4. How refunds are paid</h2>
      <p>Refunds are issued through Razorpay to the original payment method. Once issued, banks and card networks typically take 5–7 working days to show the credit. We will send the refund reference on WhatsApp and, if provided, by email.</p>

      <h2>5. Non-delivery</h2>
      <p>If an item shows <em>Delivered</em> but you have not received it, contact us within [3] days so the seller can investigate with the courier.</p>

      <h2>6. Disputes</h2>
      <p>If you and the seller cannot agree, escalate to our Grievance Officer ({GRIEVANCE.email}). This policy does not limit your statutory rights under the Consumer Protection Act 2019.</p>
    </LegalShell>
  );
}
