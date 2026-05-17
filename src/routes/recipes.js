import express from 'express';
import mongoose from 'mongoose';
import Recipe from '../models/Recipe.js';
import Review from '../models/Review.js';
import { requireAuth, loadPreferences } from '../middleware/auth.js';
import { filterByAllergies } from '../utils/recipeEngine.js';

const router = express.Router();

// GET /api/recipes
router.get('/', requireAuth, loadPreferences, async (req, res) => {
  try {
    const {
      sort, diet, cuisine, search,
      category, collection, tag,
      maxTime, maxCal, minProtein,
      maxCarb, maxFat, maxIngredients,
      page = 1, limit = 20,
    } = req.query;

    const filter = {};
    // Each entry is a { $or: [...] } block; combined at the end via $and so
    // multiple "any-of" groups don't overwrite each other.
    const andConditions = [];

    if (cuisine)    filter.cuisine = cuisine.toLowerCase();
    if (category)   filter.category = { $in: [category.toLowerCase()] };

    if (tag) {
      const t = tag.toLowerCase();
      if (t === 'one-pot') {
        // Recipes explicitly tagged OR whose title suggests a one-pot dish
        andConditions.push({ $or: [
          { tags: { $in: ['one-pot'] } },
          { title: { $regex: 'soup|stew|curry|biryani|dal|daal|risotto|chowder|casserole|broth|porridge|congee|shakshuka|nihari|haleem|karahi|shorba|pho|ramen|tagine|pilaf|pulao|paella', $options: 'i' } },
        ]});
      } else {
        filter.tags = { $in: [t] };
      }
    }

    if (collection) {
      const c = collection.toLowerCase();
      if (c === 'under-30') {
        filter.time = { $lte: 30 };
      } else {
        // All named collections (date-night, kid-friendly, meal-prep, comfort, budget, …)
        // are matched purely by their tag — no extra calorie/difficulty/servings gates.
        filter.tags = { $in: [c] };
      }
    }

    if (maxTime)        filter.time     = { $lte: Number(maxTime) };
    if (maxCal)         filter.calories = { $lte: Number(maxCal) };
    if (maxIngredients) filter.$expr    = { $lte: [{ $size: '$ingredients' }, Number(maxIngredients)] };
    if (minProtein) filter['nutrition.protein'] = { $gte: Number(minProtein) };
    if (maxCarb)    filter['nutrition.carbs']   = { $lte: Number(maxCarb) };
    if (maxFat)     filter['nutrition.fat']     = { $lte: Number(maxFat) };

    if (diet && diet !== 'none') {
      andConditions.push({ $or: [
        { tags: { $regex: diet, $options: 'i' } },
        { category: { $regex: diet, $options: 'i' } },
      ]});
    }

    if (search) {
      andConditions.push({ $or: [
        { title: { $regex: search, $options: 'i' } },
        { 'ingredients.name': { $regex: search, $options: 'i' } },
        { cuisine: { $regex: search, $options: 'i' } },
      ]});
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    // 'relevant' and the default both rank by rating so the top-rated recipes
    // float up when no explicit sort is chosen.
    let sortObj = { rating: -1 };
    if (sort === 'rating')      sortObj = { rating: -1 };
    if (sort === 'relevant')    sortObj = { rating: -1 };
    if (sort === 'trending')    sortObj = { isTrending: -1, rating: -1 };
    if (sort === 'reviewCount') sortObj = { reviewCount: -1 };
    if (sort === 'newest')      sortObj = { createdAt: -1 };
    if (sort === 'time')        sortObj = { time: 1 };
    if (sort === 'calories')    sortObj = { calories: 1 };

    // Over-fetch a bit so allergy filtering doesn't starve the page below `limit`.
    const skip = (Number(page) - 1) * Number(limit);
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

// GET /api/recipes/featured
router.get('/featured', requireAuth, loadPreferences, async (req, res) => {
  try {
    const recipes = await Recipe.find({ isFeatured: true }).limit(50).lean();
    res.json(filterByAllergies(recipes, req.user?.preferences?.allergies));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/trending
router.get('/trending', requireAuth, loadPreferences, async (req, res) => {
  try {
    const recipes = await Recipe.find({ isTrending: true }).limit(30).lean();
    res.json(filterByAllergies(recipes, req.user?.preferences?.allergies).slice(0, 10));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/quick
router.get('/quick', requireAuth, loadPreferences, async (req, res) => {
  try {
    const recipes = await Recipe.find({ time: { $lte: 30 } }).sort({ time: 1 }).limit(30).lean();
    res.json(filterByAllergies(recipes, req.user?.preferences?.allergies).slice(0, 10));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/:id  — single-recipe lookups bypass the allergy filter on purpose.
// If the user clicks through a direct link / saved card they should still see the page.
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid recipe id' });
    }
    const recipe = await Recipe.findById(req.params.id).lean();
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/:id/reviews
router.get('/:id/reviews', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const reviews = await Review.find({ recipeId: req.params.id })
      .populate('userId', 'displayName avatarColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recipes/:id/reviews
router.post('/:id/reviews', requireAuth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating) return res.status(400).json({ error: 'rating is required' });

    const review = await Review.create({
      recipeId: req.params.id,
      userId: req.user.id,
      rating: Number(rating),
      comment: comment || '',
    });

    const all = await Review.find({ recipeId: req.params.id });
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    await Recipe.findByIdAndUpdate(req.params.id, {
      rating: Math.round(avg * 10) / 10,
      reviewCount: all.length,
    });

    const populated = await review.populate('userId', 'displayName avatarColor');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
