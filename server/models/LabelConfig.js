import mongoose from 'mongoose';

const sectorSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: '', maxlength: 40 },
  productIds: { type: [String], default: [] },
}, { _id: false });

const labelConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main' },
  sectors: { type: [sectorSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('LabelConfig', labelConfigSchema);