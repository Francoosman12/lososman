import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  stockTracked: { type: Boolean, default: false },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customerId: { type: String, default: '', index: true },
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 24 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  fulfillment: { type: String, enum: ['delivery', 'pickup'], required: true },
  paymentMethod: { type: String, enum: ['pay_on_delivery', 'pay_at_pickup'], required: true },
  paymentType: { type: String, enum: ['cash', 'transfer'], default: null },
  cashAmountTendered: { type: Number, min: 0, default: null },
  address: { type: String, default: '', trim: true, maxlength: 240 },
  latitude: { type: Number, default: null, min: -90, max: 90 },
  longitude: { type: Number, default: null, min: -180, max: 180 },
  deliveryNote: { type: String, default: '', trim: true, maxlength: 500 },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'cancelled'], default: 'pending', index: true },
  statusUpdatedAt: { type: Date, default: Date.now },
  statusUpdatedBy: { type: String, default: '' },
}, { timestamps: true });

orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);
