import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  detail: { type: String, default: '', trim: true },
  barcode: { type: String, default: '', trim: true },
  sku: { type: String, default: '', trim: true, uppercase: true },
  supplier: { type: String, default: '', trim: true, maxlength: 120 },
  cost: { type: Number, default: null, min: 0 },
  additionalCost: { type: Number, default: 0, min: 0 },
  price: { type: Number, required: true, min: 0 },
  priceRoundTo: { type: Number, default: 1, min: 1, max: 100000 },
  targetMargin: { type: Number, default: null, min: 0, max: 0.95 },
  minStock: { type: Number, default: 5, min: 0 },
  // null keeps stock untracked for products created before inventory was enabled.
  stock: { type: Number, default: null },
  category: { type: String, default: 'Otros', trim: true },
  active: { type: Boolean, default: true },
  publishedOnline: { type: Boolean, default: false },
  imageUrl: { type: String, default: '', maxlength: 500 },
  imagePublicId: { type: String, default: '', maxlength: 200 },
  imageSource: { type: String, default: '', maxlength: 80 },
  imageSourceUrl: { type: String, default: '', maxlength: 500 },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

productSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } });
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string', $gt: '' } } });

export default mongoose.model('Product', productSchema);
