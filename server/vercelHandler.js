import 'dotenv/config';
import app, { connectDatabase } from './index.js';

export default async function handler(req, res) {
  try {
    await connectDatabase();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
  return app(req, res);
}
