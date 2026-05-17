import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Hydrates req.user.preferences from the database. The JWT only carries {id, email},
// so any route that needs to honour the user's diet/allergy/favCuisines preferences
// must run this AFTER requireAuth.
export async function loadPreferences(req, _res, next) {
  if (req.user?.id) {
    try {
      const u = await User.findById(req.user.id).select('preferences').lean();
      if (u) req.user.preferences = u.preferences || {};
    } catch { /* non-critical — fall through with no preferences */ }
  }
  next();
}
