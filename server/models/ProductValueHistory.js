import mongoose from 'mongoose';

const productValueHistorySchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  field: { type: String, enum: ['price', 'cost', 'additionalCost'], required: true },
  previousValue: { type: Number, default: null },
  nextValue: { type: Number, default: null },
  reason: { type: String, default: '', maxlength: 240 },
}, { timestamps: true });

productValueHistorySchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model('ProductValueHistory', productValueHistorySchema);
