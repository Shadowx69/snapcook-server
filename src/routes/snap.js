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
    `Identify every visible food ingredient in this image.
Return ONLY a valid JSON array of lowercase English ingredient names, exactly like this:
["tomato", "garlic", "chicken", "olive oil"]
Rules:
- Use common English names (e.g. "potato" not "aloo", "eggplant" not "brinjal")
- No quantities, units, or descriptions — names only
- If no food ingredients are visible return: []
Return ONLY the JSON array. No explanation, no markdown, no extra text.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } },
  ]);

  const raw = result.response.text().trim();

  // Stage 1 — ideal path: Gemini returned a clean JSON array
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [...new Set(
        parsed.map(s => String(s).trim().toLowerCase()).filter(s => s.length > 1 && s.length < 60)
      )];
    }
  } catch { /* fall through */ }

  // Stage 2 — Gemini wrapped the array in prose; extract the first [...] block
  const arrayMatch = raw.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return [...new Set(
          parsed.map(s => String(s).trim().toLowerCase()).filter(s => s.length > 1 && s.length < 60)
        )];
      }
    } catch { /* fall through */ }
  }

  // Stage 3 — plain-text fallback: split on commas OR newlines, strip list markers
  const tokens = raw
    .replace(/```[\s\S]*?```/g, '')          // strip any markdown code fences
    .split(/[\n,]+/)                          // split on newline or comma
    .map(s =>
      s
        .replace(/^\s*[\d]+[.)]\s*/, '')      // strip leading "1." / "1)"
        .replace(/^\s*[-*•]\s*/, '')          // strip leading bullet
        .trim()
        .toLowerCase()
    )
    .filter(s => s.length > 1 && s.length < 60 && /[a-z]/.test(s));

  return [...new Set(tokens)];
}

// POST /api/snap/detect — Gemini ingredient detection only, no recipe matching
router.post('/detect', requireAuth, upload.single('image'), async (req, res) => {
  let imagePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    imagePath = req.file.path;
    const ingredients = await detectIngredients(imagePath);
    console.log(`[snap/detect] Gemini detected ${ingredients.length} ingredients:`, ingredients);
    res.json({ ingredients });
  } catch (err) {
    console.error('[snap/detect] Error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to analyze image' });
  } finally {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
});

// POST /api/snap — image-based (Gemini) analysis
router.post('/', requireAuth, loadPreferences, upload.single('image'), async (req, res) => {
  let imagePath = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    imagePath = req.file.path;

    const { meal } = req.body;
    const prefs = req.user?.preferences || {};

    const ingredients = await detectIngredients(imagePath);
    console.log(`[snap] Gemini detected ${ingredients.length} ingredients:`, ingredients);

    if (ingredients.length === 0) {
      return res.status(422).json({
        error: 'No ingredients detected. Try a clearer photo with items spread on a light surface.',
      });
    }

    const recipes = await matchRecipes(ingredients, {
      meal,
      diet: prefs.diet,
      allergies: prefs.allergies,
      limit: 30,
    });
    console.log(`[snap] Matched ${recipes.length} recipes for ingredients: [${ingredients.join(', ')}]`);

    try {
      await SnapHistory.create({
        userId: req.user.id,
        ingredients,
        recipes: recipes.map(r => r._id),
      });
    } catch { /* non-critical */ }

    res.json({ ingredients, recipes });
  } catch (err) {
    console.error('[snap] Error:', err.message);
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
    const recipes = await matchRecipes(cleaned, {
      meal,
      diet: prefs.diet,
      allergies: prefs.allergies,
      limit: 30,
    });
    console.log(`[snap/manual] ingredients=[${cleaned.join(', ')}], matched=${recipes.length}`);

    try {
      await SnapHistory.create({
        userId: req.user.id,
        ingredients: cleaned,
        recipes: recipes.map(r => r._id),
      });
    } catch { /* non-critical */ }

    res.json({ ingredients: cleaned, recipes });
  } catch (err) {
    console.error('[snap/manual] Error:', err.message);
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
