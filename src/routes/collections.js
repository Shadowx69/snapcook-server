import express from 'express';
import Collection from '../models/Collection.js';
import Recipe from '../models/Recipe.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/collections
router.get('/', requireAuth, async (req, res) => {
  try {
    const collections = await Collection.find().lean();
    res.json(collections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/collections/:id/recipes
// Recipes are associated via their tags array — no stored IDs needed
router.get('/:id/recipes', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const slug = req.params.id.toLowerCase();
    const skip = (Number(page) - 1) * Number(limit);

    // Special case: 'under-30' matches time <= 30
    let filter;
    if (slug === 'under-30') {
      filter = { time: { $lte: 30 } };
    } else {
      filter = { tags: slug };
    }

    const [recipes, total] = await Promise.all([
      Recipe.find(filter).skip(skip).limit(Number(limit)).lean(),
      Recipe.countDocuments(filter),
    ]);

    res.json({ recipes, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
