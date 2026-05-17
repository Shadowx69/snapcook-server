import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  emoji: { type: String, default: '📚' },
  color: { type: String, default: '#C84B31' },
  description: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Collection', collectionSchema);
