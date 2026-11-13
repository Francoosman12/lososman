import mongoose from 'mongoose';

const comboSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  components: [{
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  }],
  price: { type: Number, required: true, min: 0 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  published: { type: Boolean, default: false },
}, { timestamps: true });

comboSchema.index({ active: 1, published: 1, startsAt: 1, endsAt: 1 });

export default mongoose.model('Combo', comboSchema);