import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
  day: { type: String, required: true },
  mealType: { type: String, required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
}, { _id: false });

const mealPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  slots: { type: [slotSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('MealPlan', mealPlanSchema);
