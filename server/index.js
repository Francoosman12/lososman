import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Product from './models/Product.js';
import Sale from './models/Sale.js';
import { demoProducts } from './data/demoProducts.js';

const app = express();
const thisDir = path.dirname(fileURLToPath(import.meta.url));
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  database: mongoose.connection.readyState === 1,
}));

app.get('/api/products', async (_req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const products = await Product.find({ active: true }).sort({ name: 1 }).lean();
      return res.json(products);
    }
    return res.json(demoProducts.map((product, index) => ({ ...product, _id: `p${index + 1}` })));
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo cargar el catálogo.' });
  }
});

const normalizeProduct = (body = {}) => {
  const name = String(body.name || '').trim();
  const barcode = String(body.barcode || '').trim();
  const detail = String(body.detail || '').trim();
  const category = String(body.category || 'Otros').trim() || 'Otros';
  const price = Number(body.price);
  if (!name || name.length > 120 || detail.length > 240 || barcode.length > 80 || category.length > 60 || body.price === '' || body.price === null || body.price === undefined || !Number.isFinite(price) || price < 0) {
    return { error: 'Completá un nombre y un precio válido. Revisá también el largo de los campos.' };
  }
  return { value: { name, barcode, detail, category, price, active: true } };
};

app.post('/api/products', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para guardar productos.' });
  const parsed = normalizeProduct(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const product = await Product.create(parsed.value);
    return res.status(201).json(product);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe un producto con ese código de barras.' });
    return res.status(500).json({ message: 'No se pudo guardar el producto.' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Conectá MongoDB para editar productos.' });
  const parsed = normalizeProduct(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const product = await Product.findOneAndUpdate({ _id: req.params.id, active: true }, { $set: parsed.value }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: 'No se encontró el producto.' });
    return res.json(product);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Ya existe un producto con ese código de barras.' });
    if (error?.name === 'CastError') return res.status(400).json({ message: 'Identificador de producto inválido.' });
    return res.status(500).json({ message: 'No se pudo actualizar el producto.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
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

app.post('/api/sales', async (req, res) => {
  const { items, total, paymentMethod, paid } = req.body || {};
  const allowedMethods = ['Efectivo', 'Mercado Pago / QR', 'Débito', 'Crédito'];
  if (!Array.isArray(items) || !items.length || !allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: 'La venta está incompleta.' });
  }
  try {
    const requestedItems = items.map((item) => ({ productId: String(item.productId || ''), quantity: Number(item.quantity) }));
    if (requestedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return res.status(400).json({ message: 'Revisá las cantidades de los productos.' });
    }
    let normalizedItems;
    if (mongoose.connection.readyState === 1) {
      const ids = requestedItems.map((item) => item.productId);
      const products = await Product.find({ _id: { $in: ids }, active: true }).lean();
      if (products.length !== new Set(ids).size) return res.status(400).json({ message: 'Hay productos que ya no están disponibles.' });
      const byId = new Map(products.map((product) => [String(product._id), product]));
      normalizedItems = requestedItems.map((item) => {
        const product = byId.get(item.productId);
        return { productId: item.productId, name: product.name, price: product.price, quantity: item.quantity };
      });
    } else {
      const byId = new Map(demoProducts.map((product, index) => [`p${index + 1}`, product]));
      normalizedItems = requestedItems.map((item) => {
        const product = byId.get(item.productId);
        return product ? { productId: item.productId, name: product.name, price: product.price, quantity: item.quantity } : null;
      });
      if (normalizedItems.some((item) => !item)) return res.status(400).json({ message: 'Hay productos que ya no están disponibles.' });
    }
    const computedTotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isFinite(Number(total)) || Math.abs(computedTotal - Number(total)) > 0.01 || !Number.isFinite(Number(paid)) || Number(paid) < computedTotal) {
      return res.status(400).json({ message: 'Revisá el total y el monto recibido.' });
    }
    const saleData = { items: normalizedItems, total: computedTotal, paymentMethod, paid: Number(paid) };
    if (mongoose.connection.readyState === 1) {
      const sale = await Sale.create(saleData);
      return res.status(201).json({ sale, persisted: true });
    }
    const sale = { ...saleData, _id: `demo-${Date.now()}`, createdAt: new Date().toISOString() };
    return res.status(201).json({ sale, persisted: false });
  } catch (error) {
    return res.status(500).json({ message: 'No se pudo guardar la venta.' });
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
