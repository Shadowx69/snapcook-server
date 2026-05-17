import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs from 'fs';
import SnapHistory from '../models/SnapHistory.js';
import { matchRecipes } from '../utils/recipeEngine.js';
import { requireAuth, loadPreferences } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

async function detectIngredients(imagePath) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const imageBuffer = await sharp(imagePath)
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const result = await model.generateContent([
    'Analyze this image carefully and identify all the raw food ingredients present. Reply ONLY with a simple comma-separated list of ingredients. No introductory text, categories, or descriptions.',
    { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } },
  ]);

  return [...new Set(
    result.response.text()
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0 && !s.includes('\n'))
  )];
}

// POST /api/snap — image-based (Gemini) analysis
router.post('/', requireAuth, loadPreferences, upload.single('image'), async (req, res) => {
  let imagePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    imagePath = req.file.path;

    const { meal } = req.body;
    const prefs = req.user?.preferences || {};
    const ingredients = await detectIngredients(imagePath);
    const recipes = await matchRecipes(ingredients, { meal, diet: prefs.diet, allergies: prefs.allergies });

    try {
      await SnapHistory.create({
        userId: req.user.id,
        ingredients,
        recipes: recipes.map(r => r._id),
      });
    } catch { /* non-critical */ }

    res.json({ ingredients, recipes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to analyze image' });
  } finally {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
});

// POST /api/snap/manual — manual ingredient entry (no Gemini, direct DB search)
router.post('/manual', requireAuth, loadPreferences, async (req, res) => {
  try {
    const { ingredients, meal } = req.body;
    const prefs = req.user?.preferences || {};

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'ingredients array is required' });
    }

    const cleaned = ingredients.map(i => String(i).trim().toLowerCase()).filter(Boolean);
    const recipes = await matchRecipes(cleaned, { meal, diet: prefs.diet, allergies: prefs.allergies });

    try {
      await SnapHistory.create({
        userId: req.user.id,
        ingredients: cleaned,
        recipes: recipes.map(r => r._id),
      });
    } catch { /* non-critical */ }

    res.json({ ingredients: cleaned, recipes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to find recipes' });
  }
});

// GET /api/snap/history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const history = await SnapHistory.find({ userId: req.user.id })
      .populate('recipes', 'title image cuisine time')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
