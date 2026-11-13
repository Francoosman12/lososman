import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 24 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  address: { type: String, default: '', trim: true, maxlength: 240 },
  latitude: { type: Number, default: null, min: -90, max: 90 },
  longitude: { type: Number, default: null, min: -180, max: 180 },
  deliveryNote: { type: String, default: '', trim: true, maxlength: 500 },
  active: { type: Boolean, default: true },
  sessionVersion: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

customerSchema.index({ email: 1 }, { unique: true });

export default mongoose.model('Customer', customerSchema);
