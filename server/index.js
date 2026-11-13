import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Product from './models/Product.js';
import Combo from './models/Combo.js';
import Sale from './models/Sale.js';
import LabelConfig from './models/LabelConfig.js';
import InventoryMovement from './models/InventoryMovement.js';
import ProductValueHistory from './models/ProductValueHistory.js';
import { adminLogin, clearAdminCookie, createAdminSession as createSession, getSession, hashPassword, ROLE_PERMISSIONS, sessionCookie, verifyPassword } from './adminAuth.js';
import Customer from './models/Customer.js';
import DeliveryConfig from './models/DeliveryConfig.js';
import Order from './models/Order.js';
import { clearCustomerCookie, createCustomerSession, customerSessionCookie, getCustomerSession, isCustomerSessionConfigured } from './customerAuth.js';
import User from './models/User.js';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { demoProducts } from './data/demoProducts.js';
import { normalizeArgentinaMobile } from '../shared/phone.js';

const app = express();
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DELIVERY_CONFIG = { storeLatitude: -26.866183, storeLongitude: -65.210705, radiusMeters: 1000, minimumOrderAmount: 10000 };
const customerLoginFailures = new Map();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '100kb' }));
const getCloudinaryConfig = () => {
  try {
    const url = new URL(process.env.CLOUDINARY_URL || '');
    if (url.protocol !== 'cloudinary:' || !url.username || !url.password || !url.hostname) return null;
    return {
      apiKey: decodeURIComponent(url.username),
      apiSecret: decodeURIComponent(url.password),
      cloudName: url.hostname,
    };
  } catch {
    return null;
  }
};
const cloudinarySignature = (params, apiSecret) => {
  const serialized = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
};
const isValidUsername = (username) => /^[a-z0-9._-]{3,40}$/.test(username) || (
  username.length <= 254 && /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(username)
);
const distanceInMeters = (leftLatitude, leftLongitude, rightLatitude, rightLongitude) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(rightLatitude - leftLatitude);
  const longitudeDelta = radians(rightLongitude - leftLongitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(leftLatitude)) * Math.cos(radians(rightLatitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const isTurnstileRequired = () => process.env.NODE_ENV === 'production' ||
  String(process.env.TURNSTILE_REQUIRED || '').toLowerCase() === 'true' ||
  Boolean(process.env.TURNSTILE_SITE_KEY || process.env.TURNSTILE_SECRET_KEY);
const verifyTurnstile = async (req, token, action) => {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!isTurnstileRequired()) return { ok: true };
  if (!siteKey || !secretKey) return { ok: false, status: 503, message: 'La verificación de seguridad no está configurada en el servidor.' };
  if (!token) return { ok: false, status: 400, message: 'Completá la verificación anti-bots para continuar.' };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: String(token) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, status: 503, message: 'No se pudo verificar la protección anti-bots. Intentá nuevamente.' };
    const result = await response.json();
    const expectedHost = String(req.hostname || '').toLowerCase();
    const verifiedHost = String(result.hostname || '').toLowerCase();
    if (!result.success || result.action !== action || (verifiedHost && expectedHost && verifiedHost !== expectedHost)) {
      return { ok: false, status: 400, message: 'La verificación expiró o no es válida. Completala nuevamente.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, message: 'No se pudo verificar la protección anti-bots. Intentá nuevamente.' };
  }
};
const formatARS = (amount) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(amount);
const publicCustomer = (customer) => ({
  id: String(customer._id), fullName: customer.fullName, phone: normalizeArgentinaMobile(customer.phone),
  email: customer.email, address: customer.address || '',
  latitude: customer.latitude, longitude: customer.longitude,
  deliveryNote: customer.deliveryNote || '',
});

app.get('/api/delivery/config', async (_req, res) => {
  try {
    const config = await DeliveryConfig.findOne({ key: 'main' }).select('storeLatitude storeLongitude radiusMeters minimumOrderAmount').lean();
    return res.json({ ...DEFAULT_DELIVERY_CONFIG, ...(config || {}) });
  } catch {
    return res.status(500).json({ message: 'No se pudo cargar la zona de entrega.' });
  }
});

app.get('/api/security/config', (_req, res) => {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  const enabled = Boolean(siteKey && secretKey);
  return res.json({
    turnstileRequired: isTurnstileRequired(),
    turnstileEnabled: enabled,
    turnstileSiteKey: enabled ? siteKey : '',
  });
});

app.get('/api/customer/status', async (req, res) => {
  const session = getCustomerSession(req);
  if (!session) return res.json({ authenticated: false, accountEnabled: isCustomerSessionConfigured(), customer: null });
  try {
    const customer = await Customer.findOne({ _id: session.cid, active: true }).lean();
    if (!customer || Number(customer.sessionVersion || 0) !== Number(session.sv || 0)) {
      res.setHeader('Set-Cookie', clearCustomerCookie(req));
      return res.json({ authenticated: false, accountEnabled: isCustomerSessionConfigured(), customer: null });
    }
    return res.json({ authenticated: true, accountEnabled: isCustomerSessionConfigured(), customer: publicCustomer(customer) });
  } catch {
    return res.status(500).json({ message: 'No se pudo verificar la cuenta del cliente.' });
  }
});

app.post('/api/customer/register', async (req, res) => {
  if (!isCustomerSessionConfigured()) return res.status(503).json({ message: 'Configurá CUSTOMER_SESSION_SECRET con al menos 32 bytes para habilitar las cuentas de clientes.' });
  const captcha = await verifyTurnstile(req, req.body?.captchaToken, 'customer_register');
  if (!captcha.ok) return res.status(captcha.status).json({ message: captcha.message });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para crear una cuenta.' });
  const fullName = String(req.body?.fullName || '').trim();
  const phone = normalizeArgentinaMobile(req.body?.phone);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!fullName || fullName.length > 120 || phone.length !== 10 || !validEmail(email) || password.length < 12 || password.length > 200) {
    return res.status(400).json({ message: 'Revisá tu nombre, celular, correo y contraseña de 12 a 200 caracteres.' });
  }
  try {
    const customer = await Customer.create({
      fullName, phone, email, passwordHash: await hashPassword(password),
    });
    res.setHeader('Set-Cookie', customerSessionCookie(req, createCustomerSession(customer)));
    return res.status(201).json({ authenticated: true, customer: publicCustomer(customer) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe una cuenta con ese correo. Iniciá sesión.' });
    return res.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/customer/login', async (req, res) => {
  if (!isCustomerSessionConfigured()) return res.status(503).json({ message: 'Configurá CUSTOMER_SESSION_SECRET con al menos 32 bytes para habilitar las cuentas de clientes.' });
  const captcha = await verifyTurnstile(req, req.body?.captchaToken, 'customer_login');
  if (!captcha.ok) return res.status(captcha.status).json({ message: captcha.message });
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const attempts = customerLoginFailures.get(ip);
  if (attempts?.lockedUntil > Date.now()) return res.status(429).json({ message: 'Demasiados intentos. Esperá unos minutos y volvé a probar.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  try {
    const customer = await Customer.findOne({ email, active: true }).select('+passwordHash');
    const valid = customer && await verifyPassword(password, customer.passwordHash);
    if (!valid) {
      const count = attempts?.windowUntil > Date.now() ? attempts.count + 1 : 1;
      customerLoginFailures.set(ip, { count, windowUntil: Date.now() + 10 * 60 * 1000, lockedUntil: count >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
      return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
    }
    customerLoginFailures.delete(ip);
    res.setHeader('Set-Cookie', customerSessionCookie(req, createCustomerSession(customer)));
    return res.json({ authenticated: true, customer: publicCustomer(customer) });
  } catch {
    return res.status(500).json({ message: 'No se pudo iniciar sesión.' });
  }
});

app.post('/api/customer/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearCustomerCookie(req));
  return res.json({ authenticated: false });
});

app.get('/api/customer/orders', async (req, res) => {
  const session = getCustomerSession(req);
  if (!session) return res.status(401).json({ message: 'Iniciá sesión para ver tus pedidos.' });
  try {
    const customer = await Customer.findOne({ _id: session.cid, active: true }).select('sessionVersion').lean();
    if (!customer || Number(customer.sessionVersion || 0) !== Number(session.sv || 0)) {
      res.setHeader('Set-Cookie', clearCustomerCookie(req));
      return res.status(401).json({ message: 'Tu sesión ya no está activa. Volvé a iniciar sesión.' });
    }
    const orders = await Order.find({ customerId: session.cid }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json(orders);
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar tus pedidos.' });
  }
});

app.get('/api/auth/status', async (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ configured: Boolean(process.env.ADMIN_SESSION_SECRET), authenticated: false, user: null });
  try {
    const user = await User.findById(session.uid).select('username displayName role active').lean();
    if (!user?.active || user.role !== session.role) return res.json({ configured: true, authenticated: false, user: null });
    return res.json({ configured: true, authenticated: true, user: { id: String(user._id), username: user.username, displayName: user.displayName, role: user.role, permissions: ROLE_PERMISSIONS[user.role] || [] } });
  } catch { return res.json({ configured: Boolean(process.env.ADMIN_SESSION_SECRET), authenticated: false, user: null }); }
});

app.post('/api/auth/bootstrap', async (req, res) => {
  const supplied = Buffer.from(String(req.body?.bootstrapToken || ''));
  const expected = Buffer.from(String(process.env.ADMIN_BOOTSTRAP_TOKEN || ''));
  if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(403).json({ message: 'Token de alta inicial inválido.' });
  if (!process.env.ADMIN_SESSION_SECRET) return res.status(503).json({ message: 'Configurá ADMIN_SESSION_SECRET antes de crear usuarios.' });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para crear el usuario inicial.' });
  const username = String(req.body?.username || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || username).trim();
  const password = String(req.body?.password || '');
  if (!isValidUsername(username) || !displayName || displayName.length > 80 || password.length < 12 || password.length > 200) return res.status(400).json({ message: 'Ingresá un usuario válido o correo, y una contraseña de 12 a 200 caracteres.' });
  try {
    if (await User.exists({})) return res.status(409).json({ message: 'El alta inicial ya fue utilizada. Iniciá sesión y creá usuarios desde Administración.' });
    const user = await User.create({ username, displayName, passwordHash: await hashPassword(password), role: 'propietario', active: true });
    const token = createAdminSessionFor(user);
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    return res.status(201).json({ authenticated: true, user: { id: String(user._id), username, displayName, role: user.role, permissions: ROLE_PERMISSIONS[user.role] } });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ese usuario ya existe.' });
    return res.status(500).json({ message: 'No se pudo crear el usuario inicial.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await adminLogin(req, req.body?.username, req.body?.password, User);
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });
    res.setHeader('Set-Cookie', sessionCookie(req, result.token));
    return res.json({ authenticated: true, user: result.user });
  } catch { return res.status(500).json({ message: 'No se pudo iniciar sesión.' }); }
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearAdminCookie(req));
  return res.json({ authenticated: false });
});

const requirePermission = (permission) => async (req, res, next) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ message: 'Iniciá sesión para continuar.' });
  try {
    const user = await User.findById(session.uid).select('username displayName role active').lean();
    if (!user?.active || user.role !== session.role) return res.status(401).json({ message: 'La sesión ya no está activa. Volvé a ingresar.' });
    if (!ROLE_PERMISSIONS[user.role]?.includes(permission)) return res.status(403).json({ message: 'Tu rol no tiene permiso para realizar esta acción.' });
    req.user = user;
    return next();
  } catch { return res.status(503).json({ message: 'No se pudo verificar el usuario.' }); }
};

const requireAnyPermission = (permissions) => async (req, res, next) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ message: 'Iniciá sesión para continuar.' });
  try {
    const user = await User.findById(session.uid).select('username displayName role active').lean();
    if (!user?.active || user.role !== session.role) return res.status(401).json({ message: 'La sesión ya no está activa. Volvé a ingresar.' });
    if (!permissions.some((permission) => ROLE_PERMISSIONS[user.role]?.includes(permission))) return res.status(403).json({ message: 'Tu rol no tiene permiso para realizar esta acción.' });
    req.user = user;
    return next();
  } catch { return res.status(503).json({ message: 'No se pudo verificar el usuario.' }); }
};

app.put('/api/delivery/config', requirePermission('orders.manage'), async (req, res) => {
  const storeLatitude = Number(req.body?.storeLatitude);
  const storeLongitude = Number(req.body?.storeLongitude);
  const radiusMeters = Number(req.body?.radiusMeters);
  if (!Number.isFinite(storeLatitude) || storeLatitude < -90 || storeLatitude > 90 ||
      !Number.isFinite(storeLongitude) || storeLongitude < -180 || storeLongitude > 180 ||
      !Number.isInteger(radiusMeters) || radiusMeters < 100 || radiusMeters > 50000) {
    return res.status(400).json({ message: 'Ingresá una ubicación válida y un radio entre 100 y 50.000 metros.' });
  }
  try {
    const existingConfig = await DeliveryConfig.findOne({ key: 'main' }).select('minimumOrderAmount').lean();
    const rawMinimum = req.body?.minimumOrderAmount;
    let minimumOrderAmount = rawMinimum === undefined
      ? Number(existingConfig?.minimumOrderAmount ?? DEFAULT_DELIVERY_CONFIG.minimumOrderAmount)
      : Number(rawMinimum);
    if ((rawMinimum !== undefined && (rawMinimum === null || rawMinimum === '')) || !Number.isFinite(minimumOrderAmount) ||
        minimumOrderAmount < 0 || minimumOrderAmount > 100000000) {
      return res.status(400).json({ message: 'El monto mínimo debe estar entre $0 y $100.000.000. Usá $0 para desactivarlo.' });
    }
    minimumOrderAmount = Math.round(minimumOrderAmount * 100) / 100;
    const config = await DeliveryConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: { storeLatitude, storeLongitude, radiusMeters, minimumOrderAmount } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.json(config);
  } catch {
    return res.status(500).json({ message: 'No se pudo guardar la zona de entrega.' });
  }
});

const createAdminSessionFor = (user) => {
  // Import is aliased below to keep the existing cookie helper API straightforward.
  return createSession(user);
};
const allowedManagedRoles = ['administracion', 'inventario', 'etiquetas'];
const normalizeManagedUser = (body = {}) => {
  const username = String(body.username || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim();
  const role = String(body.role || 'etiquetas');
  if (!isValidUsername(username) || !displayName || displayName.length > 80 || ![...allowedManagedRoles, 'propietario'].includes(role)) return { error: 'Ingresá un usuario válido o correo, un nombre visible y un rol permitido.' };
  return { value: { username, displayName, role } };
};

const normalizeManagedCustomer = (body = {}, requirePassword = false) => {
  const fullName = String(body.fullName || '').trim();
  const phone = normalizeArgentinaMobile(body.phone);
  const email = String(body.email || '').trim().toLowerCase();
  const address = String(body.address || '').trim();
  const deliveryNote = String(body.deliveryNote || '').trim();
  const password = String(body.password || '');
  if (!fullName || fullName.length > 120 || phone.length !== 10 || !validEmail(email) ||
      address.length > 240 || deliveryNote.length > 500) {
    return { error: 'Ingresá un nombre, celular de 10 dígitos, correo y dirección válidos.' };
  }
  if ((requirePassword && (password.length < 12 || password.length > 200)) ||
      (!requirePassword && password && (password.length < 12 || password.length > 200))) {
    return { error: 'La contraseña debe tener entre 12 y 200 caracteres.' };
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') return { error: 'El estado de la cuenta no es válido.' };
  return {
    value: { fullName, phone, email, address, deliveryNote, password, active: body.active },
  };
};

app.get('/api/customers', requirePermission('orders.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para administrar clientes.' });
  const status = String(req.query.status || 'active');
  if (!['active', 'inactive', 'all'].includes(status)) return res.status(400).json({ message: 'El filtro de estado no es válido.' });
  const filter = status === 'all' ? {} : { active: status === 'active' };
  try {
    const customers = await Customer.find(filter)
      .select('fullName phone email address deliveryNote active createdAt updatedAt')
      .sort({ createdAt: -1 }).limit(500).lean();
    const ids = customers.map((customer) => String(customer._id));
    const orderStats = ids.length ? await Order.aggregate([
      { $match: { customerId: { $in: ids } } },
      { $group: { _id: '$customerId', orderCount: { $sum: 1 }, lastOrderAt: { $max: '$createdAt' } } },
    ]) : [];
    const statsById = new Map(orderStats.map((stats) => [stats._id, stats]));
    return res.json(customers.map((customer) => ({
      ...customer,
      orderCount: statsById.get(String(customer._id))?.orderCount || 0,
      lastOrderAt: statsById.get(String(customer._id))?.lastOrderAt || null,
    })));
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar los clientes.' });
  }
});

app.post('/api/customers', requirePermission('orders.manage'), async (req, res) => {
  if (!isCustomerSessionConfigured()) return res.status(503).json({ message: 'Configurá CUSTOMER_SESSION_SECRET con al menos 32 bytes para habilitar las cuentas de clientes.' });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para crear clientes.' });
  const parsed = normalizeManagedCustomer(req.body, true);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const { fullName, phone, email, address, deliveryNote, password } = parsed.value;
    const customer = await Customer.create({
      fullName, phone, email, address, deliveryNote,
      passwordHash: await hashPassword(password),
      active: true,
    });
    return res.status(201).json({
      _id: customer._id, fullName: customer.fullName, phone: customer.phone, email: customer.email,
      address: customer.address, deliveryNote: customer.deliveryNote, active: customer.active,
      createdAt: customer.createdAt, orderCount: 0, lastOrderAt: null,
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    return res.status(500).json({ message: 'No se pudo crear el cliente.' });
  }
});

app.put('/api/customers/:id', requirePermission('orders.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para editar clientes.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de cliente inválido.' });
  const parsed = normalizeManagedCustomer(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'No se encontró el cliente.' });
    const addressChanged = customer.address !== parsed.value.address;
    const active = parsed.value.active ?? customer.active;
    const statusChanged = customer.active !== active;
    customer.fullName = parsed.value.fullName;
    customer.phone = parsed.value.phone;
    customer.email = parsed.value.email;
    customer.address = parsed.value.address;
    customer.deliveryNote = parsed.value.deliveryNote;
    customer.active = active;
    if (addressChanged) {
      customer.latitude = null;
      customer.longitude = null;
    }
    if (parsed.value.password) customer.passwordHash = await hashPassword(parsed.value.password);
    if (statusChanged || parsed.value.password) customer.sessionVersion = Number(customer.sessionVersion || 0) + 1;
    await customer.save();
    return res.json({
      _id: customer._id, fullName: customer.fullName, phone: customer.phone, email: customer.email,
      address: customer.address, deliveryNote: customer.deliveryNote, active: customer.active,
      createdAt: customer.createdAt, updatedAt: customer.updatedAt,
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de cliente inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar el cliente.' });
  }
});

app.delete('/api/customers/:id', requirePermission('orders.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para desactivar clientes.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Identificador de cliente inválido.' });
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'No se encontró el cliente.' });
    if (customer.active) {
      customer.active = false;
      customer.sessionVersion = Number(customer.sessionVersion || 0) + 1;
      await customer.save();
    }
    return res.json({ ok: true, active: customer.active });
  } catch {
    return res.status(500).json({ message: 'No se pudo desactivar el cliente.' });
  }
});

app.get('/api/users', requirePermission('users.manage'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para administrar usuarios.' });
  try {
    const users = await User.find().select('username displayName role active lastLoginAt createdAt').sort({ displayName: 1 }).lean();
    return res.json(users);
  } catch { return res.status(500).json({ message: 'No se pudieron cargar los usuarios.' }); }
});

app.post('/api/users', requirePermission('users.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para crear usuarios.' });
  const parsed = normalizeManagedUser(req.body);
  const password = String(req.body?.password || '');
  if (parsed.error || password.length < 12 || password.length > 200) return res.status(400).json({ message: parsed.error || 'La contraseña debe tener entre 12 y 200 caracteres.' });
  if (parsed.value.role === 'propietario' && req.user.role !== 'propietario') return res.status(403).json({ message: 'Solo el propietario puede asignar ese rol.' });
  try {
    const user = await User.create({ ...parsed.value, passwordHash: await hashPassword(password), active: true });
    return res.status(201).json({ _id: user._id, username: user.username, displayName: user.displayName, role: user.role, active: user.active, lastLoginAt: user.lastLoginAt });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ese nombre de usuario ya está ocupado.' });
    return res.status(500).json({ message: 'No se pudo crear el usuario.' });
  }
});

app.put('/api/users/:id', requirePermission('users.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para editar usuarios.' });
  const parsed = normalizeManagedUser(req.body);
  const password = String(req.body?.password || '');
  if (parsed.error || (password && (password.length < 12 || password.length > 200))) return res.status(400).json({ message: parsed.error || 'La nueva contraseña debe tener entre 12 y 200 caracteres.' });
  if (parsed.value.role === 'propietario' && req.user.role !== 'propietario') return res.status(403).json({ message: 'Solo el propietario puede asignar ese rol.' });
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'No se encontró el usuario.' });
    if (target.role === 'propietario' && req.user.role !== 'propietario') return res.status(403).json({ message: 'Solo el propietario puede modificar esa cuenta.' });
    const active = req.body.active !== false;
    if (String(target._id) === String(req.user._id) && (!active || parsed.value.role !== target.role)) return res.status(400).json({ message: 'No podés desactivar o cambiar el rol de tu propia sesión.' });
    if (target.role === 'propietario' && (!active || parsed.value.role !== 'propietario')) {
      const remainingOwners = await User.countDocuments({ role: 'propietario', active: true });
      if (remainingOwners <= 1) return res.status(409).json({ message: 'Debe quedar al menos un propietario activo.' });
    }
    target.username = parsed.value.username;
    target.displayName = parsed.value.displayName;
    target.role = parsed.value.role;
    target.active = active;
    if (password) target.passwordHash = await hashPassword(password);
    await target.save();

    return res.json({ _id: target._id, username: target.username, displayName: target.displayName, role: target.role, active: target.active, lastLoginAt: target.lastLoginAt });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ese nombre de usuario ya está ocupado.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de usuario inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar el usuario.' });
  }
});
app.delete('/api/users/:id', requirePermission('users.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para eliminar usuarios.' });
  try {
    const target = await User.findById(req.params.id).select('role active');
    if (!target) return res.status(404).json({ message: 'No se encontró el usuario.' });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ message: 'No podés eliminar tu propia cuenta.' });
    if (target.role === 'propietario' && req.user.role !== 'propietario') return res.status(403).json({ message: 'Solo el propietario puede eliminar esa cuenta.' });
    if (target.role === 'propietario' && target.active && await User.countDocuments({ role: 'propietario', active: true }) <= 1) return res.status(409).json({ message: 'Debe quedar al menos un propietario activo.' });
    await target.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de usuario inválido.' });
    return res.status(500).json({ message: 'No se pudo eliminar el usuario.' });
  }
});
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  database: mongoose.connection.readyState === 1,
}));

app.get('/api/labels', requirePermission('labels.manage'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB no está conectado.' });
  try {
    const config = await LabelConfig.findOne({ key: 'main' }).lean();
    return res.json({ sectors: config?.sectors || [], persisted: Boolean(config) });
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar los sectores.' });
  }
});

app.put('/api/labels', requirePermission('labels.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para guardar los sectores.' });
  const source = req.body?.sectors;
  if (!Array.isArray(source) || source.length < 1 || source.length > 100) {
    return res.status(400).json({ message: 'La configuración debe tener entre 1 y 100 sectores.' });
  }
  const sectors = [];
  let productCount = 0;
  for (const sector of source) {
    const id = String(sector?.id || '').trim();
    const name = String(sector?.name || '').trim();
    const productIds = Array.isArray(sector?.productIds) ? [...new Set(sector.productIds.map((value) => String(value || '').trim()).filter(Boolean))] : null;
    if (!id || id.length > 120 || name.length > 40 || !productIds || productIds.some((value) => value.length > 120)) {
      return res.status(400).json({ message: 'Revisá los nombres y productos de los sectores.' });
    }
    productCount += productIds.length;
    sectors.push({ id, name, productIds });
  }
  if (productCount > 20000 || new Set(sectors.map((sector) => sector.id)).size !== sectors.length) {
    return res.status(400).json({ message: 'La configuración de sectores no es válida.' });
  }
  try {
    const config = await LabelConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: { sectors } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return res.json({ sectors: config.sectors, persisted: true });
  } catch {
    return res.status(500).json({ message: 'No se pudieron guardar los sectores en MongoDB.' });
  }
});
const comboAvailability = async (combos, includeCosts = false) => {
  const productIds = [...new Set(combos.flatMap((combo) => combo.components.map((component) => component.productId)))];
  const products = await Product.find({ _id: { $in: productIds }, active: true }).lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return combos.map((combo) => {
    const components = combo.components.map((component) => {
      const product = byId.get(String(component.productId));
      if (!product) return null;
      return {
        productId: String(product._id), name: product.name, barcode: product.barcode,
        quantity: component.quantity, price: product.price,
        ...(includeCosts ? { unitCost: Number.isFinite(product.cost) ? product.cost + (product.additionalCost || 0) : null } : {}),
        stock: Number.isInteger(product.stock) ? product.stock : null,
      };
    }).filter(Boolean);
    const valid = components.length === combo.components.length;
    const tracked = valid && components.every((component) => Number.isInteger(component.stock));
    const availableQuantity = tracked
      ? Math.min(...components.map((component) => Math.floor(component.stock / component.quantity)))
      : null;
    const totalCost = includeCosts && components.every((component) => Number.isFinite(component.unitCost))
      ? components.reduce((sum, component) => sum + component.unitCost * component.quantity, 0)
      : null;
    const result = { ...combo, components, availableQuantity, valid };
    if (includeCosts) result.totalCost = totalCost;
    else {
      delete result.totalCost;
      result.components = components.map(({ unitCost, ...component }) => component);
    }
    return result;
  });
};

const normalizeCombo = (body = {}) => {
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const price = Number(body.price);
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  const components = Array.isArray(body.components) ? body.components.map((component) => ({
    productId: String(component?.productId || '').trim(),
    quantity: Number(component?.quantity),
  })) : [];
  const merged = new Map();
  for (const component of components) merged.set(component.productId, (merged.get(component.productId) || 0) + component.quantity);
  const normalizedComponents = [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  if (!name || name.length > 120 || description.length > 500 || !Number.isFinite(price) || price < 0 ||
      !normalizedComponents.length || normalizedComponents.length > 100 ||
      normalizedComponents.some((component) => !component.productId || !Number.isInteger(component.quantity) || component.quantity < 1 || component.quantity > 10000) ||
      (startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) ||
      (startsAt && endsAt && startsAt > endsAt)) {
    return { error: 'Revisá nombre, precio, vigencia y productos del combo.' };
  }
  return { value: { name, description, price, startsAt, endsAt, components: normalizedComponents, active: body.active !== false, published: body.published === true } };
};

app.get('/api/combos/public', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.json([]);
  try {
    const now = new Date();
    const combos = await Combo.find({
      active: true, published: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    }).sort({ name: 1 }).lean();
    return res.json(await comboAvailability(combos));
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar las promociones.' });
  }
});

app.get('/api/combos', requirePermission('combos.manage'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para administrar combos.' });
  try {
    const combos = await Combo.find().sort({ name: 1 }).lean();
    return res.json(await comboAvailability(combos, true));
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar los combos.' });
  }
});

app.post('/api/combos', requirePermission('combos.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para guardar combos.' });
  const parsed = normalizeCombo(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const productIds = parsed.value.components.map((component) => component.productId);
    const count = await Product.countDocuments({ _id: { $in: productIds }, active: true });
    if (count !== productIds.length) return res.status(400).json({ message: 'Uno o más componentes ya no están disponibles.' });
    const combo = await Combo.create(parsed.value);
    return res.status(201).json((await comboAvailability([combo.toObject()], true))[0]);
  } catch {
    return res.status(500).json({ message: 'No se pudo guardar el combo.' });
  }
});

app.put('/api/combos/:id', requirePermission('combos.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para editar combos.' });
  const parsed = normalizeCombo(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const productIds = parsed.value.components.map((component) => component.productId);
    const count = await Product.countDocuments({ _id: { $in: productIds }, active: true });
    if (count !== productIds.length) return res.status(400).json({ message: 'Uno o más componentes ya no están disponibles.' });
    const combo = await Combo.findByIdAndUpdate(req.params.id, { $set: parsed.value }, { new: true, runValidators: true });
    if (!combo) return res.status(404).json({ message: 'No se encontró el combo.' });
    return res.json((await comboAvailability([combo.toObject()], true))[0]);
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de combo inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar el combo.' });
  }
});

app.delete('/api/combos/:id', requirePermission('combos.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para quitar combos.' });
  try {
    const combo = await Combo.findByIdAndUpdate(req.params.id, { $set: { active: false, published: false } }, { new: true });
    if (!combo) return res.status(404).json({ message: 'No se encontró el combo.' });
    return res.json({ ok: true });
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de combo inválido.' });
    return res.status(500).json({ message: 'No se pudo quitar el combo.' });
  }
});
app.post('/api/uploads/product-image/signature', requirePermission('products.manage'), async (_req, res) => {
  const cloudinary = getCloudinaryConfig();
  if (!cloudinary) return res.status(503).json({ message: 'Configurá CLOUDINARY_URL con la URL de conexión de tu cuenta Cloudinary.' });
  const params = {
    overwrite: 'true',
    public_id: `los-osman/products/${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  return res.json({
    cloudName: cloudinary.cloudName,
    apiKey: cloudinary.apiKey,
    ...params,
    signature: cloudinarySignature(params, cloudinary.apiSecret),
  });
});
app.get('/api/storefront/products', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'El catálogo online no está disponible.' });
  try {
    const products = await Product.find({ active: true, publishedOnline: true, $or: [{ stock: { $gt: 0 } }, { stock: null }] }).sort({ name: 1 }).select('name detail barcode sku price category stock imageUrl imageSource imageSourceUrl').lean();
    return res.json(products.map((product) => ({ ...product, stock: Number.isInteger(product.stock) ? Math.max(0, product.stock) : null, available: !Number.isInteger(product.stock) || product.stock > 0 })));
  } catch {
    return res.status(500).json({ message: 'No se pudo cargar el catálogo online.' });
  }
});

app.post('/api/orders', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Los pedidos online requieren conexión con MongoDB.' });
  const fulfillment = String(req.body?.fulfillment || '');
  const paymentType = String(req.body?.paymentType || '');
  const cashAmountTendered = req.body?.cashAmountTendered === undefined || req.body?.cashAmountTendered === null || req.body?.cashAmountTendered === ''
    ? null
    : Number(req.body.cashAmountTendered);
  const customerName = String(req.body?.customer?.fullName || '').trim();
  const phone = normalizeArgentinaMobile(req.body?.customer?.phone);
  const email = String(req.body?.customer?.email || '').trim().toLowerCase();
  const address = String(req.body?.address || '').trim();
  const deliveryNote = String(req.body?.deliveryNote || '').trim();
  const latitude = req.body?.latitude === undefined || req.body?.latitude === null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude === undefined || req.body?.longitude === null ? null : Number(req.body.longitude);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const createAccount = req.body?.createAccount === true;
  const password = String(req.body?.password || '');
  if (phone.length !== 10) return res.status(400).json({ message: 'Ingresá el celular como 3816436214, sin 0 ni 15.' });
  if (!['cash', 'transfer'].includes(paymentType)) return res.status(400).json({ message: 'Elegí efectivo o transferencia como medio de pago.' });
  if (paymentType === 'cash' && (!Number.isFinite(cashAmountTendered) || cashAmountTendered < 0 || cashAmountTendered > 100000000)) {
    return res.status(400).json({ message: 'Ingresá un importe válido para el pago en efectivo.' });
  }
  if (paymentType === 'transfer' && cashAmountTendered !== null) {
    return res.status(400).json({ message: 'El importe en efectivo solo corresponde al medio de pago en efectivo.' });
  }
  if (!['delivery', 'pickup'].includes(fulfillment) || !customerName || customerName.length > 120 ||
      !validEmail(email) ||
      address.length > 240 || deliveryNote.length > 500 ||
      !items.length || items.length > 50 ||
      items.some((item) => !mongoose.isValidObjectId(String(item?.productId || '')) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 100)) {
    return res.status(400).json({ message: 'Revisá tus datos de contacto y los productos del pedido.' });
  }
  if (fulfillment === 'delivery' && (!address || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ message: 'Para el envío ingresá la dirección y marcá tu ubicación en el mapa.' });
  }
  const captcha = await verifyTurnstile(req, req.body?.captchaToken, 'online_order');
  if (!captcha.ok) return res.status(captcha.status).json({ message: captcha.message });

  const customerSession = getCustomerSession(req);
  let hasCustomerSession = false;
  if (customerSession) {
    const customer = await Customer.findOne({ _id: customerSession.cid, active: true }).select('sessionVersion').lean();
    const customerExists = customer && Number(customer.sessionVersion || 0) === Number(customerSession.sv || 0);
    if (!customerExists) {
      res.setHeader('Set-Cookie', clearCustomerCookie(req));
      return res.status(401).json({ message: 'Tu sesión de cliente venció. Volvé a iniciar sesión.' });
    }
    hasCustomerSession = true;
  }
  if (createAccount && !hasCustomerSession) {
    if (!isCustomerSessionConfigured()) return res.status(503).json({ message: 'Configurá CUSTOMER_SESSION_SECRET con al menos 32 bytes para habilitar las cuentas de clientes.' });
    if (password.length < 12 || password.length > 200) return res.status(400).json({ message: 'La contraseña para crear una cuenta debe tener entre 12 y 200 caracteres.' });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = String(item.productId).trim();
    quantities.set(productId, (quantities.get(productId) || 0) + Number(item.quantity));
  }
  if ([...quantities.values()].some((quantity) => quantity > 100)) return res.status(400).json({ message: 'La cantidad total de un producto no puede superar 100 unidades.' });

  let deliveryConfig;
  try {
    deliveryConfig = { ...DEFAULT_DELIVERY_CONFIG, ...(await DeliveryConfig.findOne({ key: 'main' }).lean() || {}) };
  } catch {
    return res.status(503).json({ message: 'No se pudo verificar la zona de entrega.' });
  }
  if (fulfillment === 'delivery') {
    const distance = distanceInMeters(deliveryConfig.storeLatitude, deliveryConfig.storeLongitude, latitude, longitude);
    if (distance > deliveryConfig.radiusMeters) return res.status(400).json({ message: `La dirección está fuera de la zona de entrega (radio máximo ${deliveryConfig.radiusMeters} m).` });
  }

  const session = await mongoose.startSession();
  let order;
  let createdCustomer = null;
  try {
    await session.withTransaction(async () => {
      createdCustomer = null;
      const productIds = [...quantities.keys()];
      const products = await Product.find({
        _id: { $in: productIds }, active: true, publishedOnline: true,
        $or: [{ stock: { $gt: 0 } }, { stock: null }],
      }).session(session).lean();
      if (products.length !== productIds.length) throw Object.assign(new Error('PRODUCT_UNAVAILABLE'), { code: 'PRODUCT_UNAVAILABLE' });
      const productsById = new Map(products.map((product) => [String(product._id), product]));
      const orderItems = productIds.map((productId) => {
        const product = productsById.get(productId);
        return { productId, name: product.name, imageUrl: product.imageUrl || '', price: product.price, quantity: quantities.get(productId), stockTracked: Number.isInteger(product.stock) };
      });
      const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      if (Math.round(total * 100) < Math.round(deliveryConfig.minimumOrderAmount * 100)) {
        throw Object.assign(new Error('MINIMUM_ORDER_NOT_MET'), { code: 'MINIMUM_ORDER_NOT_MET' });
      }
      if (paymentType === 'cash' && Math.round(cashAmountTendered * 100) < Math.round(total * 100)) {
        throw Object.assign(new Error('CASH_AMOUNT_TOO_LOW'), { code: 'CASH_AMOUNT_TOO_LOW' });
      }

      const sessionVersion = Number(customerSession?.sv || 0);
      const customerFilter = {
        _id: customerSession?.cid,
        active: true,
        ...(sessionVersion === 0
          ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
          : { sessionVersion }),
      };
      let accountCustomer = hasCustomerSession
        ? await Customer.findOne(customerFilter).session(session)
        : null;
      if (hasCustomerSession && !accountCustomer) throw Object.assign(new Error('CUSTOMER_UNAVAILABLE'), { code: 'CUSTOMER_UNAVAILABLE' });
      if (!accountCustomer && createAccount) {
        [createdCustomer] = await Customer.create([{
          fullName: customerName, phone, email, passwordHash: await hashPassword(password),
          address: fulfillment === 'delivery' ? address : '', latitude, longitude, deliveryNote,
        }], { session });
        accountCustomer = createdCustomer;
      } else if (accountCustomer) {
        accountCustomer.fullName = customerName;
        accountCustomer.phone = phone;
        accountCustomer.email = email;
        if (fulfillment === 'delivery') {
          accountCustomer.address = address;
          accountCustomer.latitude = latitude;
          accountCustomer.longitude = longitude;
          accountCustomer.deliveryNote = deliveryNote;
        }
        await accountCustomer.save({ session });
      }

      const stockMovements = [];
      for (const productId of productIds) {
        const product = productsById.get(productId);
        const quantity = quantities.get(productId);
        if (!Number.isInteger(product.stock)) continue;
        const updated = await Product.updateOne(
          { _id: product._id, active: true, publishedOnline: true, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { session },
        );
        if (updated.modifiedCount !== 1) throw Object.assign(new Error('INSUFFICIENT_STOCK'), { code: 'INSUFFICIENT_STOCK' });
        stockMovements.push({
          productId, productName: product.name, type: 'sale', quantity: -quantity,
          stockBefore: product.stock, stockAfter: product.stock - quantity,
          reason: 'Reserva por pedido online', channel: 'online',
        });
      }
      const orderNumber = `LO-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
      [order] = await Order.create([{
        orderNumber, customerId: accountCustomer ? String(accountCustomer._id) : '',
        customerName, phone, email, fulfillment,
        paymentMethod: fulfillment === 'delivery' ? 'pay_on_delivery' : 'pay_at_pickup',
        paymentType, cashAmountTendered,
        address: fulfillment === 'delivery' ? address : '',
        latitude: fulfillment === 'delivery' ? latitude : null,
        longitude: fulfillment === 'delivery' ? longitude : null,
        deliveryNote, items: orderItems, total,
      }], { session });
      if (stockMovements.length) {
        for (const movement of stockMovements) movement.referenceId = String(order._id);
        await InventoryMovement.create(stockMovements, { session });
      }
    });
    if (createdCustomer) res.setHeader('Set-Cookie', customerSessionCookie(req, createCustomerSession(createdCustomer)));
    return res.status(201).json({ order: order.toObject(), accountCreated: Boolean(createdCustomer) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe una cuenta con ese correo. Iniciá sesión o quitá la opción de crear cuenta.' });
    if (error?.code === 'PRODUCT_UNAVAILABLE') return res.status(409).json({ message: 'Uno de los productos ya no está disponible en el catálogo online.' });
    if (error?.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: 'El stock cambió mientras enviabas el pedido. Actualizá el catálogo e intentá nuevamente.' });
    if (error?.code === 'CUSTOMER_UNAVAILABLE') {
      res.setHeader('Set-Cookie', clearCustomerCookie(req));
      return res.status(401).json({ message: 'Tu sesión de cliente venció. Volvé a iniciar sesión.' });
    }
    if (error?.code === 'MINIMUM_ORDER_NOT_MET') return res.status(400).json({ message: `El monto mínimo de compra es $${formatARS(deliveryConfig.minimumOrderAmount)} en productos.` });
    if (error?.code === 'CASH_AMOUNT_TOO_LOW') return res.status(400).json({ message: 'El importe en efectivo debe cubrir al menos el subtotal actualizado del pedido.' });
    return res.status(500).json({ message: 'No se pudo registrar el pedido.' });
  } finally {
    await session.endSession();
  }
});

app.get('/api/orders', requirePermission('orders.manage'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para consultar pedidos.' });
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(300).lean();
    return res.json(orders);
  } catch {
    return res.status(500).json({ message: 'No se pudieron cargar los pedidos.' });
  }
});

app.patch('/api/orders/:id/status', requirePermission('orders.manage'), async (req, res) => {
  const nextStatus = String(req.body?.status || '');
  const allowedStatuses = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'cancelled'];
  if (!allowedStatuses.includes(nextStatus)) return res.status(400).json({ message: 'Estado de pedido inválido.' });
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(req.params.id).session(session);
      if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { code: 'ORDER_NOT_FOUND' });
      const transitions = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['ready', 'cancelled'],
        ready: [order.fulfillment === 'delivery' ? 'out_for_delivery' : 'picked_up', 'cancelled'],
        out_for_delivery: ['delivered'],
        delivered: [],
        picked_up: [],
        cancelled: [],
      };
      if (!transitions[order.status]?.includes(nextStatus)) throw Object.assign(new Error('INVALID_TRANSITION'), { code: 'INVALID_TRANSITION' });
      if (nextStatus === 'cancelled') {
        const movements = [];
        for (const item of order.items) {
          if (!item.stockTracked) continue;
          const product = await Product.findById(item.productId).session(session);
          if (!product || !Number.isInteger(product.stock)) continue;
          const stockBefore = product.stock;
          product.stock += item.quantity;
          await product.save({ session });
          movements.push({
            productId: String(product._id), productName: product.name, type: 'return',
            quantity: item.quantity, stockBefore, stockAfter: product.stock,
            reason: `Cancelación del pedido ${order.orderNumber}`, channel: 'online',
            referenceId: String(order._id),
          });
        }
        if (movements.length) await InventoryMovement.create(movements, { session });
      }
      order.status = nextStatus;
      order.statusUpdatedAt = new Date();
      order.statusUpdatedBy = req.user.displayName || req.user.username;
      await order.save({ session });
    });
    return res.json(order.toObject());
  } catch (error) {
    if (error?.code === 'ORDER_NOT_FOUND') return res.status(404).json({ message: 'No se encontró el pedido.' });
    if (error?.code === 'INVALID_TRANSITION') return res.status(409).json({ message: 'Ese cambio de estado no está permitido.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de pedido inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar el estado del pedido.' });
  } finally {
    await session.endSession();
  }
});

app.get('/api/products', requireAnyPermission(['sales.create', 'products.manage', 'labels.manage']), async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const products = await Product.find({ active: true }).sort({ name: 1 }).lean();
      const admin = ROLE_PERMISSIONS[req.user.role]?.includes('products.costs') === true;
      return res.json(products.map((product) => {
        const result = { ...product, stock: Number.isInteger(product.stock) ? product.stock : null };
        if (!admin) {
          delete result.cost;
          delete result.additionalCost;
          delete result.supplier;
          delete result.targetMargin;
          delete result.priceRoundTo;
        }
        return result;
      }));
    }
    return res.json(demoProducts.map((product, index) => ({ ...product, stock: null, _id: `p${index + 1}` })));
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo cargar el catálogo.' });
  }
});

app.get('/api/products/value-history', requirePermission('products.costs'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para consultar los cambios.' });
  try {
    const history = await ProductValueHistory.find().sort({ createdAt: -1 }).limit(500).lean();
    return res.json(history);
  } catch {
    return res.status(500).json({ message: 'No se pudo cargar el historial de costos y precios.' });
  }
});
app.get('/api/inventory/movements', requirePermission('inventory.view'), async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para consultar el historial.' });
  try {
    const movements = await InventoryMovement.find().sort({ createdAt: -1 }).limit(500).lean();
    return res.json(movements);
  } catch {
    return res.status(500).json({ message: 'No se pudo cargar el historial de inventario.' });
  }
});
const normalizeProduct = (body = {}) => {
  const name = String(body.name || '').trim();
  const barcode = String(body.barcode || '').trim();
  const detail = String(body.detail || '').trim();
  const category = String(body.category || 'Otros').trim() || 'Otros';
  const sku = String(body.sku || '').trim().toUpperCase();
  const supplier = String(body.supplier || '').trim();
  const price = Number(body.price);
  const cost = body.cost === undefined || body.cost === null || body.cost === '' ? null : Number(body.cost);
  const additionalCost = body.additionalCost === undefined || body.additionalCost === '' ? 0 : Number(body.additionalCost);
  const minStock = body.minStock === undefined || body.minStock === '' ? 5 : Number(body.minStock);
  const priceRoundTo = body.priceRoundTo === undefined || body.priceRoundTo === '' ? 1 : Number(body.priceRoundTo);
  const targetMargin = body.targetMargin === undefined || body.targetMargin === null || body.targetMargin === '' ? null : Number(body.targetMargin) / 100;
  const stock = body.stock === undefined || body.stock === null || body.stock === '' ? 0 : Number(body.stock);
  const imageUrl = String(body.imageUrl || '').trim();
  const imagePublicId = String(body.imagePublicId || '').trim();
  const publishedOnline = stock > 0 && body.publishedOnline !== false;
  let validCloudinaryImage = !imageUrl && !imagePublicId;
  if (imageUrl && !imagePublicId) {
    try {
      const url = new URL(imageUrl);
      validCloudinaryImage = url.protocol === 'https:' && /^(images|static)\.(openfoodfacts|openbeautyfacts|openpetfoodfacts|openproductsfacts)\.org$/.test(url.hostname);
    } catch {
      validCloudinaryImage = false;
    }
  }
  if (imageUrl && imagePublicId) {
    try {
      const url = new URL(imageUrl);
      const cloudinary = getCloudinaryConfig();
      const prefix = cloudinary ? `/${cloudinary.cloudName}/image/upload/` : '';
      const uploadedPath = prefix && url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
      const publicIdFromUrl = uploadedPath.replace(/^v\d+\//, '').replace(/\.[a-zA-Z0-9]+$/, '');
      validCloudinaryImage = Boolean(cloudinary) && url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
        publicIdFromUrl === imagePublicId && /^los-osman\/products\/[0-9a-f-]{36}$/i.test(imagePublicId);
    } catch {
      validCloudinaryImage = false;
    }
  }
  if (!name || name.length > 120 || detail.length > 240 || barcode.length > 80 || sku.length > 60 || supplier.length > 120 || category.length > 60 ||
      imageUrl.length > 500 || imagePublicId.length > 200 || !validCloudinaryImage ||
      body.price === '' || body.price === null || body.price === undefined || !Number.isFinite(price) || price < 0 ||
      (cost !== null && (!Number.isFinite(cost) || cost < 0)) || !Number.isFinite(additionalCost) || additionalCost < 0 || !Number.isInteger(minStock) || minStock < 0 ||
      !Number.isFinite(priceRoundTo) || priceRoundTo < 1 || priceRoundTo > 100000 || !Number.isInteger(stock) || stock < -10000000 || stock > 10000000 ||
      (targetMargin !== null && (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin > 0.95))) {
    return { error: 'Revisá nombre, precio, costo, margen, stock mínimo y los largos de los campos.' };
  }
  return { value: { name, barcode, detail, category, sku, supplier, cost, additionalCost, price, priceRoundTo, targetMargin, minStock, stock, publishedOnline, imageUrl, imagePublicId, imageSource: imagePublicId ? 'Cloudinary' : String(body.imageSource || ''), imageSourceUrl: imagePublicId ? '' : String(body.imageSourceUrl || ''), active: true } };
};
app.post('/api/products', requirePermission('products.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para guardar productos.' });
  const parsed = normalizeProduct(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const session = await mongoose.startSession();
    let product;
    try {
      await session.withTransaction(async () => {
        [product] = await Product.create([parsed.value], { session });
        const valueHistory = [{ productId: String(product._id), productName: product.name, field: 'price', previousValue: null, nextValue: product.price, reason: 'Precio inicial' }];
        if (product.cost !== null && product.cost !== undefined) valueHistory.push({ productId: String(product._id), productName: product.name, field: 'cost', previousValue: null, nextValue: product.cost, reason: 'Costo inicial' });
        if (product.additionalCost > 0) valueHistory.push({ productId: String(product._id), productName: product.name, field: 'additionalCost', previousValue: 0, nextValue: product.additionalCost, reason: 'Gastos iniciales de adquisición' });
        await ProductValueHistory.create(valueHistory, { session });
        if (parsed.value.stock > 0) {
          await InventoryMovement.create([{
            productId: String(product._id), productName: product.name, type: 'initial_balance',
            quantity: parsed.value.stock, stockBefore: 0, stockAfter: parsed.value.stock,
            reason: 'Stock inicial al crear el producto', channel: 'admin',
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
    return res.status(201).json(product);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe un producto con ese código de barras.' });
    return res.status(500).json({ message: 'No se pudo guardar el producto.' });
  }
});

app.put('/api/products/:id', requirePermission('products.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para editar productos.' });
  const parsed = normalizeProduct(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const reason = String(req.body?.stockReason || '').trim();
  try {
    const session = await mongoose.startSession();
    let product;
    try {
      await session.withTransaction(async () => {
        const current = await Product.findOne({ _id: req.params.id, active: true }).session(session);
        if (!current) throw new Error('PRODUCT_UNAVAILABLE');
        const stockBefore = Number.isInteger(current.stock) ? current.stock : 0;
        const stockChanged = current.stock !== parsed.value.stock;
        if (stockChanged && (!reason || reason.length > 240)) {
          const error = new Error('Indicá el motivo del ajuste de stock (máximo 240 caracteres).');
          error.code = 'STOCK_REASON_REQUIRED';
          throw error;
        }
        const updateValues = { ...parsed.value };
        if (current.barcode !== parsed.value.barcode && !parsed.value.imagePublicId) Object.assign(updateValues, { imageUrl: '', imagePublicId: '', imageSource: '', imageSourceUrl: '' });
        product = await Product.findOneAndUpdate(
          { _id: req.params.id, active: true },
          { ['$set']: updateValues },
          { new: true, runValidators: true, session },
        );
        const valueHistory = [];
        if (current.price !== product.price) valueHistory.push({ productId: String(product._id), productName: product.name, field: 'price', previousValue: current.price, nextValue: product.price, reason: String(req.body?.valueChangeReason || '').trim() });
        if ((current.cost ?? null) !== (product.cost ?? null)) valueHistory.push({ productId: String(product._id), productName: product.name, field: 'cost', previousValue: current.cost ?? null, nextValue: product.cost ?? null, reason: String(req.body?.valueChangeReason || '').trim() });
        if ((current.additionalCost ?? 0) !== (product.additionalCost ?? 0)) valueHistory.push({ productId: String(product._id), productName: product.name, field: 'additionalCost', previousValue: current.additionalCost ?? 0, nextValue: product.additionalCost ?? 0, reason: String(req.body?.valueChangeReason || '').trim() });
        if (valueHistory.length) await ProductValueHistory.create(valueHistory, { session });
        if (stockChanged) {
          await InventoryMovement.create([{
            productId: String(product._id), productName: product.name, type: 'adjustment',
            quantity: parsed.value.stock - stockBefore, stockBefore, stockAfter: parsed.value.stock,
            reason, channel: 'admin',
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
    return res.json(product);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe un producto con ese código de barras.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto inválido.' });
    if (error?.code === 'STOCK_REASON_REQUIRED') return res.status(400).json({ message: error.message });
    if (error?.message === 'PRODUCT_UNAVAILABLE') return res.status(404).json({ message: 'No se encontró el producto.' });
    return res.status(500).json({ message: 'No se pudo actualizar el producto.' });
  }
});
app.patch('/api/products/:id/publication', requirePermission('products.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para cambiar la publicación.' });
  try {
    const product = await Product.findOne({ _id: req.params.id, active: true });
    if (!product) return res.status(404).json({ message: 'No se encontró el producto.' });
    const requested = req.body?.publishedOnline === true;
    if (requested && Number.isInteger(product.stock) && product.stock <= 0) return res.status(409).json({ message: 'No se puede publicar un producto sin stock.' });
    product.publishedOnline = requested;
    await product.save();
    return res.json(product);
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar la publicación.' });
  }
});
app.delete('/api/products/:id', requirePermission('products.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para quitar productos.' });
  try {
    const product = await Product.findOneAndUpdate({ _id: req.params.id, active: true }, { $set: { active: false, barcode: '' } }, { new: true });
    if (!product) return res.status(404).json({ message: 'No se encontró el producto.' });
    return res.json({ ok: true });
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto inválido.' });
    return res.status(500).json({ message: 'No se pudo quitar el producto.' });
  }
});

app.post('/api/products/:id/stock', requirePermission('inventory.manage'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para registrar el movimiento.' });
  const quantity = Number(req.body?.quantity);
  const movementType = String(req.body?.type || 'purchase');
  const delta = movementType === 'loss' ? -quantity : quantity;
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000000 || !['purchase', 'return', 'loss'].includes(movementType) || !reason || reason.length > 240) {
    return res.status(400).json({ message: 'Ingresá una cantidad válida, un tipo de movimiento y su motivo.' });
  }
  try {
    const session = await mongoose.startSession();
    let product;
    try {
      await session.withTransaction(async () => {
        const before = await Product.findOne({ _id: req.params.id, active: true }).session(session);
        if (!before) throw new Error('PRODUCT_UNAVAILABLE');
        const stockBefore = Number.isInteger(before.stock) ? before.stock : 0;
        if (movementType === 'loss' && (!Number.isInteger(before.stock) || stockBefore < quantity)) throw new Error('INSUFFICIENT_STOCK');
        product = await Product.findOneAndUpdate(
          { _id: req.params.id, active: true },
          [{ $set: { stock: { $add: [{ $ifNull: ['$stock', 0] }, delta] } } }],
          { new: true, session },
        );
        await InventoryMovement.create([{
          productId: String(product._id), productName: product.name, type: movementType,
          quantity: delta, stockBefore, stockAfter: product.stock, reason, channel: 'admin',
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    return res.json(product);
  } catch (error) {
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto inválido.' });
    if (error?.message === 'PRODUCT_UNAVAILABLE') return res.status(404).json({ message: 'No se encontró el producto.' });
    if (error?.message === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: 'La pérdida supera el stock disponible. Usá el ajuste manual si el conteo físico es distinto.' });
    return res.status(500).json({ message: 'No se pudo registrar el movimiento de stock.' });
  }
});
app.post('/api/sales', requirePermission('sales.create'), async (req, res) => {
  if (req.body?.allowNegativeStock === true) {
    if (!ROLE_PERMISSIONS[req.user.role]?.includes('stock.override')) return res.status(403).json({ message: 'Tu rol no puede autorizar ventas sin stock.' });
  }
  const { items, total, paymentMethod, paid } = req.body || {};
  const allowNegativeStock = req.body?.allowNegativeStock === true;
  const allowedMethods = ['Efectivo', 'Mercado Pago / QR', 'Débito', 'Crédito'];
  if (!Array.isArray(items) || !items.length || !allowedMethods.includes(paymentMethod)) return res.status(400).json({ message: 'La venta está incompleta.' });
  if (items.some((item) => (!item?.productId && !item?.comboId) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
    return res.status(400).json({ message: 'Revisá las cantidades de los productos.' });
  }
  if (mongoose.connection.readyState !== 1) {
    if (items.some((item) => item.comboId)) return res.status(503).json({ message: 'Los combos requieren conexión con MongoDB.' });
    const byId = new Map(demoProducts.map((product, index) => ['p' + (index + 1), product]));
    const demoItems = items.map((item) => {
      const product = byId.get(String(item.productId));
      return product ? { productId: String(item.productId), name: product.name, price: product.price, quantity: Number(item.quantity) } : null;
    });
    if (demoItems.some((item) => !item)) return res.status(400).json({ message: 'Hay productos que ya no están disponibles.' });
    const demoTotal = demoItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isFinite(Number(total)) || Math.abs(demoTotal - Number(total)) > 0.01 || !Number.isFinite(Number(paid)) || Number(paid) < demoTotal) return res.status(400).json({ message: 'Revisá el total y el monto recibido.' });
    return res.status(201).json({ sale: { items: demoItems, total: demoTotal, paymentMethod, paid: Number(paid), _id: 'demo-' + Date.now() }, persisted: false });
  }

  try {
    const directQuantities = new Map();
    const comboQuantities = new Map();
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (item.comboId) comboQuantities.set(String(item.comboId), (comboQuantities.get(String(item.comboId)) || 0) + quantity);
      else directQuantities.set(String(item.productId), (directQuantities.get(String(item.productId)) || 0) + quantity);
    }

    const session = await mongoose.startSession();
    let sale;
    const stockUpdates = [];
    try {
      await session.withTransaction(async () => {
        stockUpdates.length = 0;
        const comboIds = [...comboQuantities.keys()];
        const now = new Date();
        const combos = comboIds.length ? await Combo.find({
          _id: { $in: comboIds }, active: true,
          $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
            { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
          ],
        }).session(session).lean() : [];
        if (combos.length !== comboIds.length) throw new Error('COMBO_UNAVAILABLE');
        const comboById = new Map(combos.map((combo) => [String(combo._id), combo]));
        const requiredByProduct = new Map(directQuantities);
        for (const [comboId, comboQuantity] of comboQuantities) {
          const combo = comboById.get(comboId);
          if (!combo) throw new Error('COMBO_UNAVAILABLE');
          for (const component of combo.components) {
            const productId = String(component.productId);
            requiredByProduct.set(productId, (requiredByProduct.get(productId) || 0) + component.quantity * comboQuantity);
          }
        }
        const productIds = [...requiredByProduct.keys()];
        const currentProducts = await Product.find({ _id: { $in: productIds }, active: true }).session(session).lean();
        if (currentProducts.length !== productIds.length) throw new Error('PRODUCT_UNAVAILABLE');
        const productById = new Map(currentProducts.map((product) => [String(product._id), product]));
        const normalizedItems = [];
        for (const item of items) {
          const quantity = Number(item.quantity);
          if (item.comboId) {
            const combo = comboById.get(String(item.comboId));
            const components = combo.components.map((component) => {
              const product = productById.get(String(component.productId));
              return { productId: String(product._id), name: product.name, quantity: component.quantity, unitPrice: product.price, unitCost: Number.isFinite(product.cost) ? product.cost + (product.additionalCost || 0) : null };
            });
            const totalCost = components.every((component) => Number.isFinite(component.unitCost)) ? components.reduce((sum, component) => sum + component.unitCost * component.quantity, 0) : null;
            normalizedItems.push({ productId: 'combo:' + combo._id, comboId: String(combo._id), name: combo.name, price: combo.price, cost: totalCost, quantity, components });
          } else {
            const product = productById.get(String(item.productId));
            normalizedItems.push({ productId: String(product._id), name: product.name, price: product.price, cost: Number.isFinite(product.cost) ? product.cost + (product.additionalCost || 0) : null, quantity, components: [] });
          }
        }
        const computedTotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        if (!Number.isFinite(Number(total)) || Math.abs(computedTotal - Number(total)) > 0.01 || !Number.isFinite(Number(paid)) || Number(paid) < computedTotal) throw new Error('INVALID_PAYMENT');

        for (const [productId, quantity] of requiredByProduct) {
          const product = productById.get(productId);
          if (!Number.isInteger(product.stock)) continue;
          if (product.stock < quantity && !allowNegativeStock) throw Object.assign(new Error('Stock insuficiente para ' + product.name + '. Disponible: ' + product.stock + '.'), { code: 'INSUFFICIENT_STOCK' });
          const update = await Product.updateOne(
            { _id: product._id, active: true, ...(allowNegativeStock ? {} : { stock: { $gte: quantity } }) },
            [{ $set: { stock: { $subtract: ['$stock', quantity] } } }], { session },
          );
          if (update.modifiedCount !== 1) throw Object.assign(new Error('El stock de ' + product.name + ' cambió. Actualizá la cuenta e intentá otra vez.'), { code: 'INSUFFICIENT_STOCK' });
          stockUpdates.push({ productId, productName: product.name, stockBefore: product.stock, quantity, stock: product.stock - quantity });
        }
        [sale] = await Sale.create([{
          items: normalizedItems, total: computedTotal, paymentMethod, paid: Number(paid),
          stockOverride: allowNegativeStock, channel: 'pos',
        }], { session });
        const movements = stockUpdates.map((update) => ({
          productId: update.productId, productName: update.productName, type: 'sale',
          quantity: -update.quantity, stockBefore: update.stockBefore, stockAfter: update.stock,
          reason: 'Venta registrada en el punto de venta', channel: 'pos', referenceId: String(sale._id),
        }));
        if (movements.length) await InventoryMovement.create(movements, { session });
      });
    } finally { await session.endSession(); }
    const publicSale = sale.toObject();
    publicSale.items = publicSale.items.map(({ cost: _cost, components, ...item }) => ({
      ...item, components: (components || []).map(({ unitCost: _unitCost, ...component }) => component),
    }));
    return res.status(201).json({ sale: publicSale, persisted: true, stockUpdates });
  } catch (error) {
    if (error?.code === 'INSUFFICIENT_STOCK') return res.status(409).json({ message: error.message });
    if (error?.message === 'PRODUCT_UNAVAILABLE') return res.status(409).json({ message: 'Hay productos que ya no están disponibles.' });
    if (error?.message === 'COMBO_UNAVAILABLE') return res.status(409).json({ message: 'El combo dejó de estar activo o cambió su vigencia.' });
    if (error?.message === 'INVALID_PAYMENT') return res.status(400).json({ message: 'Revisá el total y el monto recibido.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto o combo inválido.' });
    return res.status(500).json({ message: 'No se pudo guardar la venta.' });
  }
});
app.get('/api/reports/summary', requirePermission('reports.view'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para consultar reportes.' });
  try {
    const from = req.query.from ? new Date(String(req.query.from) + 'T00:00:00.000Z') : null;
    const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59.999Z') : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return res.status(400).json({ message: 'Revisá el período seleccionado.' });
    const products = await Product.find({ active: true }).lean();
    const productById = new Map(products.map((product) => [String(product._id), product]));
    const category = String(req.query.category || '');
    const productId = String(req.query.productId || '');
    const categoryProductIds = category ? new Set(products.filter((product) => product.category === category).map((product) => String(product._id))) : null;
    const query = {};
    if (from || to) query.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const sales = await Sale.find(query).sort({ createdAt: -1 }).limit(20000).lean();
    const matchesProduct = (id) => (!productId || String(id) === productId) && (!categoryProductIds || categoryProductIds.has(String(id)));
    const saleLines = new Map();
    for (const sale of sales) {
      const matchedLines = [];
      for (const item of sale.items) {
        if (item.comboId && Array.isArray(item.components) && item.components.length) {
          const allComponents = item.components;
          const components = allComponents.filter((component) => matchesProduct(component.productId));
          if (!components.length) continue;
          const fullRetailValue = allComponents.reduce((sum, component) => sum + (component.unitPrice || 0) * component.quantity, 0);
          const matchedRetailValue = components.reduce((sum, component) => sum + (component.unitPrice || 0) * component.quantity, 0);
          const costsKnown = components.every((component) => component.unitCost != null);
          const matchedCost = costsKnown ? components.reduce((sum, component) => sum + component.unitCost * component.quantity, 0) : null;
          matchedLines.push({ ...item, price: fullRetailValue > 0 ? item.price * matchedRetailValue / fullRetailValue : item.price, cost: matchedCost, components });
        } else if (matchesProduct(item.productId)) matchedLines.push(item);
      }
      if (matchedLines.length) saleLines.set(String(sale._id), matchedLines);
    }
    const filteredSales = sales.filter((sale) => saleLines.has(String(sale._id)));
    const unitsByProduct = new Map();
    const comboStats = new Map();
    let grossProfit = 0;
    let costMissingLines = 0;
    let soldUnits = 0;
    for (const sale of filteredSales) {
      for (const item of saleLines.get(String(sale._id))) {
        if (item.cost == null) costMissingLines += 1;
        else grossProfit += (item.price - item.cost) * item.quantity;
        if (item.comboId) {
          const stat = comboStats.get(item.comboId) || { name: item.name, units: 0, revenue: 0, grossProfit: 0 };
          stat.units += item.quantity;
          stat.revenue += item.price * item.quantity;
          if (item.cost != null) stat.grossProfit += (item.price - item.cost) * item.quantity;
          comboStats.set(item.comboId, stat);
          for (const component of item.components || []) {
            const product = productById.get(String(component.productId));
            if (!product) continue;
            const id = String(component.productId);
            const row = unitsByProduct.get(id) || { productId: id, name: component.name, units: 0, revenue: 0 };
            row.units += component.quantity * item.quantity;
            row.revenue += component.unitPrice * component.quantity * item.quantity;
            unitsByProduct.set(id, row);
            soldUnits += component.quantity * item.quantity;
          }
        } else {
          const id = String(item.productId);
          const row = unitsByProduct.get(id) || { productId: id, name: item.name, units: 0, revenue: 0 };
          row.units += item.quantity;
          row.revenue += item.price * item.quantity;
          unitsByProduct.set(id, row);
          soldUnits += item.quantity;
        }
      }
    }
    const tracked = products.filter((product) => Number.isInteger(product.stock));
    const costValue = tracked.reduce((sum, product) => sum + Math.max(0, product.stock) * (product.cost == null ? 0 : product.cost + (product.additionalCost || 0)), 0);
    const salesValue = tracked.reduce((sum, product) => sum + Math.max(0, product.stock) * product.price, 0);
    const margins = products.filter((product) => Number.isFinite(product.cost) && product.price > 0).map((product) => ({
      productId: String(product._id), name: product.name, category: product.category,
      cost: product.cost + (product.additionalCost || 0), price: product.price,
      grossProfit: product.price - (product.cost + (product.additionalCost || 0)),
      margin: ((product.price - product.cost - (product.additionalCost || 0)) / product.price) * 100,
      targetMargin: product.targetMargin == null ? null : product.targetMargin * 100,
    }));
    return res.json({
      inventory: {
        inventoryCostValue: costValue, inventorySalesValue: salesValue,
        activeProducts: products.length,
        lowStock: tracked.filter((product) => product.stock > 0 && product.stock <= (product.minStock ?? 5)).length,
        outOfStock: tracked.filter((product) => product.stock <= 0).length,
        untracked: products.length - tracked.length,
        productsWithoutCost: products.filter((product) => Number.isInteger(product.stock) && product.stock > 0 && product.cost == null).length,
      },
      period: {
        salesCount: filteredSales.length,
        unitsSold: soldUnits,
        revenue: filteredSales.reduce((sum, sale) => sum + saleLines.get(String(sale._id)).reduce((lineSum, item) => lineSum + item.price * item.quantity, 0), 0),
        grossProfit, costMissingLines,
        channels: {
          pos: filteredSales.filter((sale) => (sale.channel || 'pos') === 'pos').length,
          online: filteredSales.filter((sale) => sale.channel === 'online').length,
        },
      },
      topProducts: [...unitsByProduct.values()].sort((a, b) => b.units - a.units).slice(0, 10),
      topMargins: [...margins].sort((a, b) => b.margin - a.margin).slice(0, 10),
      lowMargins: [...margins].sort((a, b) => a.margin - b.margin).slice(0, 10),
      belowTarget: margins.filter((product) => product.targetMargin !== null && product.margin < product.targetMargin),
      comboPerformance: [...comboStats.values()].sort((a, b) => b.units - a.units),
    });
  } catch {
    return res.status(500).json({ message: 'No se pudieron calcular los reportes.' });
  }
});
const distPath = path.resolve(thisDir, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html'), (error) => {
  if (error) res.status(404).send('Aplicación no compilada. Ejecutá npm run build.');
}));

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return true;
  if (!process.env.MONGODB_URI) return false;
  await mongoose.connect(process.env.MONGODB_URI);
  return true;
}

export default app;
