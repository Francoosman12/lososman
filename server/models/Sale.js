import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema({
  items: [{
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  }],
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Efectivo', 'Mercado Pago / QR', 'Débito', 'Crédito'], required: true },
  paid: { type: Number, required: true, min: 0 },
}, { timestamps: true });

export default mongoose.model('Sale', saleSchema);
