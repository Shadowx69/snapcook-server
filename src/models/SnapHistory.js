import mongoose from 'mongoose';

const snapHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ingredients: { type: [String], default: [] },
  recipes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }],
}, { timestamps: true });

snapHistorySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('SnapHistory', snapHistorySchema);
