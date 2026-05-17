import Recipe from '../models/Recipe.js';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getAllRecipes() {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;
  cache = await Recipe.find(
    {},
    'title cuisine category time difficulty rating reviewCount tags ingredients nutrition calories image gradient servings'
  ).lean();
  cacheTime = Date.now();
  return cache;
}

export function invalidateCache() {
  cache = null;
}

// Drops recipes whose ingredients list mentions any of the user's allergens.
// Matches via case-insensitive substring both ways (so "almond" allergy hits
// "almond milk", and "milk" allergy hits "coconut milk"). Returns the list
// unchanged when allergies is empty / null / undefined.
export function filterByAllergies(recipes, allergies) {
  if (!Array.isArray(allergies) || allergies.length === 0) return recipes;
  const allergens = allergies.map(a => String(a).toLowerCase().trim()).filter(Boolean);
  if (allergens.length === 0) return recipes;
  return recipes.filter(r => {
    const ings = Array.isArray(r?.ingredients) ? r.ingredients : [];
    return !ings.some(ing => {
      const name = String(ing?.name || '').toLowerCase();
      if (!name) return false;
      return allergens.some(alg => name.includes(alg) || alg.includes(name));
    });
  });
}

export async function matchRecipes(userIngredients, { diet, allergies, meal, limit } = {}) {
  const recipes = await getAllRecipes();
  const userSet = new Set(userIngredients.map(i => i.toLowerCase()));

  let pool = recipes;

  // Diet filter — try to honour the preference, but fall back to the full pool
  // if fewer than 3 recipes match (e.g. the DB wasn't seeded with keto/gluten-free
  // tags yet).  This mirrors the soft-fallback pattern used for the meal filter.
  if (diet && diet !== 'none') {
    const dietTag = diet.toLowerCase().replace(/[^a-z]/g, '');
    const dietPool = pool.filter(r =>
      r.tags.some(t => t.toLowerCase().includes(dietTag)) ||
      r.category.some(c => c.toLowerCase().includes(dietTag))
    );
    if (dietPool.length >= 3) pool = dietPool;
  }

  if (allergies && Array.isArray(allergies) && allergies.length > 0) {
    const allergenList = allergies.map(a => a.toLowerCase().trim()).filter(Boolean);
    pool = pool.filter(r => {
      const recipeIngredients = r.ingredients.map(ing => ing.name.toLowerCase());
      const hasAllergen = recipeIngredients.some(ring =>
        allergenList.some(alg => ring.includes(alg) || alg.includes(ring))
      );
      return !hasAllergen;
    });
  }

  if (meal) {
    const filtered = pool.filter(r => r.category.includes(meal.toLowerCase()));
    if (filtered.length >= 5) pool = filtered;
  }

  const scored = pool.map(recipe => {
    const recipeIngredients = recipe.ingredients.map(ing => ing.name.toLowerCase());
    let matchedCount = 0;
    const missing = [];

    for (const reqIng of recipeIngredients) {
      const matched = Array.from(userSet).some(
        userIng => userIng.includes(reqIng) || reqIng.includes(userIng)
      );
      if (matched) matchedCount++;
      else missing.push(reqIng);
    }

    const matchScore = recipeIngredients.length > 0
      ? matchedCount / recipeIngredients.length
      : 0;

    return { ...recipe, matchScore, matchedCount, totalNeeded: recipeIngredients.length, missing };
  });

  // Only return recipes that share at least one ingredient with what the user has
  const matched = scored
    .filter(r => r.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  return limit ? matched.slice(0, limit) : matched;
}
