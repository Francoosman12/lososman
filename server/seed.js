import 'dotenv/config';
import mongoose from 'mongoose';
import Product from './models/Product.js';
import { demoProducts } from './data/demoProducts.js';

if (!process.env.MONGODB_URI) {
  console.error('Configurá MONGODB_URI antes de cargar el catálogo de ejemplo.');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const product of demoProducts) {
    const { name, ...fields } = product;
    await Product.updateOne({ name }, { $set: { name, ...fields, active: true } }, { upsert: true });
  }
  console.log(`${demoProducts.length} productos de ejemplo cargados.`);
} catch (error) {
  console.error('No se pudo cargar el catálogo:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
