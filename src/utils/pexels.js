import fetch from 'node-fetch';

const PEXELS_BASE = 'https://api.pexels.com/v1/search';

// Fallback images per cuisine if Pexels finds nothing
const FALLBACKS = {
  pakistani: 'https://images.pexels.com/photos/1624487/pexels-photo-1624487.jpeg',
  indian: 'https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg',
  italian: 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg',
  mexican: 'https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg',
  american: 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg',
  french: 'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg',
  japanese: 'https://images.pexels.com/photos/2098085/pexels-photo-2098085.jpeg',
  chinese: 'https://images.pexels.com/photos/955137/pexels-photo-955137.jpeg',
  thai: 'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg',
  'middle eastern': 'https://images.pexels.com/photos/3738730/pexels-photo-3738730.jpeg',
  default: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg',
};

export async function fetchImage(query, cuisine = 'default') {
  const apiKey = process.env.PEXELS_API;
  if (!apiKey) throw new Error('PEXELS_API env var not set');

  const search = encodeURIComponent(`${query} food`);
  try {
    const res = await fetch(`${PEXELS_BASE}?query=${search}&per_page=3&orientation=landscape`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.large2x || data.photos[0].src.large;
    }
  } catch (err) {
    console.warn(`Pexels fetch failed for "${query}":`, err.message);
  }

  // Fallback: try cuisine name
  const cuisineKey = cuisine.toLowerCase();
  return FALLBACKS[cuisineKey] || FALLBACKS.default;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
