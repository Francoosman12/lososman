import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'lososman_customer';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const getSecret = () => {
  const secret = process.env.CUSTOMER_SESSION_SECRET || '';
  return Buffer.byteLength(secret, 'utf8') >= 32 ? secret : '';
};
export const isCustomerSessionConfigured = () => Boolean(getSecret());
const sign = (payload) => createHmac('sha256', getSecret()).update(payload).digest('base64url');
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createCustomerSession(customer) {
  const payload = Buffer.from(JSON.stringify({
    cid: String(customer._id),
    sv: Number(customer.sessionVersion) || 0,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function getCustomerSession(req) {
  if (!getSecret()) return null;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([key]) => key));
  const [payload, signature, extra] = (cookies[COOKIE_NAME] || '').split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() && session.cid ? session : null;
  } catch {
    return null;
  }
}

export function customerSessionCookie(req, value, maxAge = SESSION_TTL_SECONDS) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export const clearCustomerCookie = (req) => customerSessionCookie(req, '', 0);
