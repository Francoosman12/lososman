import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  type: { type: String, enum: ['initial_balance', 'purchase', 'sale', 'adjustment', 'return', 'loss'], required: true },
  quantity: { type: Number, required: true },
  stockBefore: { type: Number, required: true },
  stockAfter: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 240 },
  channel: { type: String, enum: ['pos', 'online', 'admin'], default: 'admin' },
  referenceId: { type: String, default: '' },
}, { timestamps: true });

inventoryMovementSchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model('InventoryMovement', inventoryMovementSchema);
