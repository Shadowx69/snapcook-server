import mongoose from 'mongoose';

const cuisineSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  emoji: { type: String, default: '🍽️' },
  color: { type: String, default: '#C84B31' },
  gradient: { type: String, default: 'linear-gradient(135deg, #C84B31, #E87040)' },
  imageUrl: { type: String, default: '' },
  recipeCount: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Cuisine', cuisineSchema);
