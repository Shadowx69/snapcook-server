import express from 'express';
import MealPlan from '../models/MealPlan.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/meal-planner
router.get('/', requireAuth, async (req, res) => {
  try {
    let plan = await MealPlan.findOne({ userId: req.user.id })
      .populate('slots.recipeId', 'title image time calories cuisine')
      .lean();
    if (!plan) plan = { userId: req.user.id, slots: [] };
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meal-planner  — replace entire plan
router.post('/', requireAuth, async (req, res) => {
  try {
    const { slots } = req.body;
    const plan = await MealPlan.findOneAndUpdate(
      { userId: req.user.id },
      { slots: slots || [] },
      { upsert: true, new: true }
    ).populate('slots.recipeId', 'title image time calories cuisine');
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/meal-planner/:day/:slot
router.put('/:day/:slot', requireAuth, async (req, res) => {
  try {
    const { recipeId } = req.body;
    const { day, slot: mealType } = req.params;

    await MealPlan.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { slots: { day, mealType } } },
      { upsert: true }
    );
    await MealPlan.findOneAndUpdate(
      { userId: req.user.id },
      { $push: { slots: { day, mealType, recipeId } } }
    );

    const plan = await MealPlan.findOne({ userId: req.user.id })
      .populate('slots.recipeId', 'title image time calories cuisine');
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/meal-planner/:day/:slot
router.delete('/:day/:slot', requireAuth, async (req, res) => {
  try {
    const { day, slot: mealType } = req.params;
    await MealPlan.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { slots: { day, mealType } } }
    );
    res.json({ removed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
