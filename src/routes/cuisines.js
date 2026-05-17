import express from 'express';
import Cuisine from '../models/Cuisine.js';
import Recipe from '../models/Recipe.js';
import { requireAuth, loadPreferences } from '../middleware/auth.js';
import { filterByAllergies } from '../utils/recipeEngine.js';

const router = express.Router();

// GET /api/cuisines
router.get('/', requireAuth, async (req, res) => {
  try {
    const cuisines = await Cuisine.find().sort({ name: 1 }).lean();
    res.json(cuisines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cuisines/:id  (id = slug, e.g. 'pakistani')
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const cuisine = await Cuisine.findOne({ slug: req.params.id.toLowerCase() }).lean();
    if (!cuisine) return res.status(404).json({ error: 'Cuisine not found' });
    res.json(cuisine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cuisines/:id/recipes
router.get('/:id/recipes', requireAuth, loadPreferences, async (req, res) => {
  try {
    const { page = 1, limit = 20, sort, category, search } = req.query;
    const slug = req.params.id.toLowerCase();
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { cuisine: slug };
    if (category) filter.category = { $in: [category.toLowerCase()] };
    if (search)   filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { 'ingredients.name': { $regex: search, $options: 'i' } },
    ];

    let sortObj = { createdAt: -1 };
    if (sort === 'rating')      sortObj = { rating: -1 };
    if (sort === 'time')        sortObj = { time: 1 };
    if (sort === 'calories')    sortObj = { calories: 1 };
    if (sort === 'reviewCount') sortObj = { reviewCount: -1 };

    // Over-fetch so allergy filtering doesn't starve the page below `limit`.
    const fetchLimit = Number(limit) * 3;
    const [rawRecipes, total] = await Promise.all([
      Recipe.find(filter).sort(sortObj).skip(skip).limit(fetchLimit).lean(),
      Recipe.countDocuments(filter),
    ]);

    const recipes = filterByAllergies(rawRecipes, req.user?.preferences?.allergies).slice(0, Number(limit));
    res.json({ recipes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
