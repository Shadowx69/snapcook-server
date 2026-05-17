import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['cooked', 'saved', 'rated', 'opened'], required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  timestamp: { type: Date, default: Date.now },
});

activitySchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model('Activity', activitySchema);
