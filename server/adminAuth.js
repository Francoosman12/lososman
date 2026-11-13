import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'lososman_admin';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const failures = new Map();
const configured = () => Boolean(process.env.ADMIN_SESSION_SECRET);
const sign = (payload) => createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = Buffer.from(await scrypt(String(password), salt, 64));
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function sessionCookie(req, value, maxAge = SESSION_TTL_SECONDS) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function createAdminSession(user) {
  const payload = Buffer.from(JSON.stringify({
    uid: String(user._id), username: user.username, displayName: user.displayName,
    role: user.role, exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function getSession(req) {
  if (!configured()) return null;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([key]) => key));
  const [payload, signature, extra] = (cookies[COOKIE_NAME] || '').split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.exp > Date.now() && session.uid && session.role ? session : null;
  } catch { return null; }
}

export function isAdminRequest(req) { return Boolean(getSession(req)); }

export const ROLE_PERMISSIONS = {
  propietario: ['sales.create', 'users.manage', 'products.manage', 'products.costs', 'inventory.manage', 'inventory.view', 'labels.manage', 'combos.manage', 'reports.view', 'stock.override', 'orders.manage'],
  administracion: ['sales.create', 'users.manage', 'products.manage', 'products.costs', 'inventory.manage', 'inventory.view', 'labels.manage', 'combos.manage', 'reports.view', 'stock.override', 'orders.manage'],
  inventario: ['products.manage', 'inventory.manage', 'inventory.view'],
  etiquetas: ['labels.manage'],
};

export function hasPermission(req, permission) {
  const session = getSession(req);
  return Boolean(session && ROLE_PERMISSIONS[session.role]?.includes(permission));
}

export async function adminLogin(req, username, password, User) {
  if (!configured()) return { status: 503, message: 'Configurá ADMIN_SESSION_SECRET en el servidor.' };
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const record = failures.get(ip);
  if (record?.lockedUntil > Date.now()) return { status: 429, message: 'Demasiados intentos. Esperá unos minutos y volvé a probar.' };
  const user = await User.findOne({ username: String(username || '').trim().toLowerCase(), active: true }).select('+passwordHash');
  const valid = user && await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = record?.windowUntil > Date.now() ? record.attempts + 1 : 1;
    failures.set(ip, { attempts, windowUntil: Date.now() + 10 * 60 * 1000, lockedUntil: attempts >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
    return { status: 401, message: 'Usuario o contraseña incorrectos.' };
  }
  failures.delete(ip);
  user.lastLoginAt = new Date();
  await user.save();
  return { status: 200, token: createAdminSession(user), user: { id: String(user._id), username: user.username, displayName: user.displayName, role: user.role, permissions: ROLE_PERMISSIONS[user.role] || [] } };
}

export const clearAdminCookie = (req) => sessionCookie(req, '', 0);