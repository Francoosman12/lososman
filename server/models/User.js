import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 254 },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['propietario', 'administracion', 'inventario', 'etiquetas'], required: true, default: 'etiquetas' },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

userSchema.index({ username: 1 }, { unique: true });
export default mongoose.model('User', userSchema);