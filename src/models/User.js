import mongoose from 'mongoose';

const preferencesSchema = new mongoose.Schema({
  diet: { type: String, default: 'none' },
  allergies: { type: [String], default: [] },
  favCuisines: { type: [String], default: [] },
  servings: { type: Number, default: 2 },
  language: { type: String, default: 'English' },
  units: { type: String, default: 'Metric (g, ml, °C)' },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  displayName: { type: String, required: true, trim: true },
  username: { type: String, trim: true, lowercase: true },
  avatarColor: { type: String, default: '#C84B31' },
  avatarImg: { type: String },
  googleId: { type: String },
  googleLinked: { type: Boolean, default: false },
  onboarded: { type: Boolean, default: false },
  preferences: { type: preferencesSchema, default: () => ({}) },
}, { timestamps: true });

userSchema.index({ googleId: 1 }, { sparse: true });

export default mongoose.model('User', userSchema);
