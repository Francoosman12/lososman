import mongoose from 'mongoose';

const deliveryConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main' },
  storeLatitude: { type: Number, required: true, min: -90, max: 90, default: -26.866183 },
  storeLongitude: { type: Number, required: true, min: -180, max: 180, default: -65.210705 },
  radiusMeters: { type: Number, required: true, min: 100, max: 50000, default: 1000 },
  minimumOrderAmount: { type: Number, required: true, min: 0, max: 100000000, default: 10000 },
}, { timestamps: true });

export default mongoose.model('DeliveryConfig', deliveryConfigSchema);
