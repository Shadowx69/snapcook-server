import express from 'express';
import User from '../models/User.js';
import SavedRecipe from '../models/SavedRecipe.js';
import Activity from '../models/Activity.js';
import MealPlan from '../models/MealPlan.js';
import SnapHistory from '../models/SnapHistory.js';
import Review from '../models/Review.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Consecutive-day cook streak. Days are bucketed in UTC. A streak is active
// when the user cooked today or yesterday; it then extends back as long as
// each prior UTC day also has a cook. No cook in the last 2 days → 0.
function computeStreak(timestamps) {
  if (!timestamps.length) return 0;
  const dayKey = (d) => {
    const x = new Date(d);
    return `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  };
  const days = new Set(timestamps.map(dayKey));
  const today = new Date();
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// GET /api/users/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [recipiesTried, savedRecipes, cookedActivity] = await Promise.all([
      Activity.countDocuments({ userId: req.user.id, type: 'cooked' }),
      SavedRecipe.countDocuments({ userId: req.user.id }),
      Activity.find({ userId: req.user.id, type: 'cooked' }).select('timestamp').sort({ timestamp: -1 }).lean(),
    ]);

    const streak = computeStreak(cookedActivity.map(a => a.timestamp));

    res.json({ ...user.toObject(), stats: { recipiesTried, savedRecipes, streak } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/me
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { displayName, username, avatarColor, avatarImg, onboarded } = req.body;
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (username !== undefined) update.username = username.toLowerCase();
    if (avatarColor !== undefined) update.avatarColor = avatarColor;
    if (avatarImg !== undefined) update.avatarImg = avatarImg;
    if (onboarded !== undefined) update.onboarded = onboarded;

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me/preferences
router.get('/me/preferences', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    res.json(user.preferences);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/me/preferences
router.put('/me/preferences', requireAuth, async (req, res) => {
  try {
    const allowed = ['diet', 'allergies', 'favCuisines', 'servings', 'language', 'units'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[`preferences.${key}`] = req.body[key];
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('preferences');
    res.json(user.preferences);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me/saved
router.get('/me/saved', requireAuth, async (req, res) => {
  try {
    const saved = await SavedRecipe.find({ userId: req.user.id })
      .populate('recipeId')
      .sort({ savedAt: -1 })
      .lean();
    res.json(saved.map(s => ({ ...s.recipeId, savedAt: s.savedAt })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/me/saved/:id
router.post('/me/saved/:id', requireAuth, async (req, res) => {
  try {
    await SavedRecipe.findOneAndUpdate(
      { userId: req.user.id, recipeId: req.params.id },
      { savedAt: new Date() },
      { upsert: true }
    );
    await Activity.create({ userId: req.user.id, type: 'saved', recipeId: req.params.id });
    res.status(201).json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/me/cooked/:id  — log a recipe as cooked (cooking mode completed)
router.post('/me/cooked/:id', requireAuth, async (req, res) => {
  try {
    await Activity.create({ userId: req.user.id, type: 'cooked', recipeId: req.params.id });
    res.status(201).json({ cooked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/me/opened/:id — log that the user opened a recipe from
// the AI Find-Recipes results. Goes into the History tab but does NOT count
// toward the "Tried" stat or the cooking streak (those only count 'cooked').
router.post('/me/opened/:id', requireAuth, async (req, res) => {
  try {
    await Activity.create({ userId: req.user.id, type: 'opened', recipeId: req.params.id });
    res.status(201).json({ opened: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/me/saved/:id
router.delete('/me/saved/:id', requireAuth, async (req, res) => {
  try {
    await SavedRecipe.deleteOne({ userId: req.user.id, recipeId: req.params.id });
    res.json({ saved: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me/activity
router.get('/me/activity', requireAuth, async (req, res) => {
  try {
    const activity = await Activity.find({ userId: req.user.id })
      .populate('recipeId', 'title image cuisine')
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/sync  — compatibility alias
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/me — permanently delete account and all associated data
router.delete('/me', requireAuth, async (req, res) => {
  try {
    const uid = req.user.id;
    await Promise.all([
      User.deleteOne({ _id: uid }),
      Activity.deleteMany({ userId: uid }),
      SavedRecipe.deleteMany({ userId: uid }),
      MealPlan.deleteOne({ userId: uid }),
      SnapHistory.deleteMany({ userId: uid }),
      Review.deleteMany({ userId: uid }),
    ]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
