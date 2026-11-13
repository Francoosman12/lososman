import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema({
  items: [{
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, default: null, min: 0 },
    comboId: { type: String, default: '' },
    components: [{ productId: String, name: String, quantity: Number, unitPrice: Number, unitCost: { type: Number, default: null } }],
    quantity: { type: Number, required: true, min: 1 },
  }],
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Efectivo', 'Mercado Pago / QR', 'Débito', 'Crédito'], required: true },
  paid: { type: Number, required: true, min: 0 },
  stockOverride: { type: Boolean, default: false },
  channel: { type: String, enum: ['pos', 'online'], default: 'pos' },
}, { timestamps: true });

export default mongoose.model('Sale', saleSchema);
