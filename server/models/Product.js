import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  detail: { type: String, default: '', trim: true },
  barcode: { type: String, default: '', trim: true },
  price: { type: Number, required: true, min: 0 },
  // null keeps stock untracked for products created before inventory was enabled.
  stock: { type: Number, default: null },
  category: { type: String, default: 'Otros', trim: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } });

export default mongoose.model('Product', productSchema);
