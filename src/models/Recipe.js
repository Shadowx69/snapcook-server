import mongoose from 'mongoose';

const nutritionSchema = new mongoose.Schema({
  kcal: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
}, { _id: false });

const ingredientSchema = new mongoose.Schema({
  name: String,
  amount: String,
}, { _id: false });

const recipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  cuisine: { type: String, required: true },
  category: { type: [String], default: [] },
  time: { type: Number, default: 30 },
  servings: { type: Number, default: 4 },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  calories: { type: Number, default: 0 },
  tags: { type: [String], default: [] },
  image: { type: String, default: '' },
  gradient: { type: String, default: 'linear-gradient(135deg, #f5f5f5, #e0e0e0)' },
  nutrition: { type: nutritionSchema, default: () => ({}) },
  ingredients: { type: [ingredientSchema], default: [] },
  steps: { type: [String], default: [] },
  isFeatured: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },
}, { timestamps: true });

recipeSchema.index({ cuisine: 1 });
recipeSchema.index({ tags: 1 });
recipeSchema.index({ time: 1 });
recipeSchema.index({ isFeatured: 1 });
recipeSchema.index({ isTrending: 1 });
recipeSchema.index({ title: 'text', 'ingredients.name': 'text' });

export default mongoose.model('Recipe', recipeSchema);
