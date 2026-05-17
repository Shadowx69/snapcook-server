import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function sanitize(user) {
  const u = user.toObject ? user.toObject() : { ...user };
  delete u.password;
  return u;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password, and displayName are required' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ email, password: hashed, displayName });
    const token = signToken(user);
    res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/google  — receives access_token from @react-oauth/google
router.post('/google', async (req, res) => {
  try {
    // Frontend sends either 'accessToken' (from useGoogleLogin) or 'credential' (alias)
    const accessToken = req.body.accessToken || req.body.credential;
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });

    const gRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!gRes.ok) return res.status(401).json({ error: 'Invalid Google token' });
    const gUser = await gRes.json();

    let user = await User.findOne({ googleId: gUser.id });
    if (!user) {
      user = await User.findOne({ email: gUser.email.toLowerCase() });
      if (user) {
        user.googleId = gUser.id;
        user.googleLinked = true;
        await user.save();
      } else {
        user = await User.create({
          email: gUser.email.toLowerCase(),
          displayName: gUser.name || gUser.email.split('@')[0],
          googleId: gUser.id,
          googleLinked: true,
        });
      }
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  res.status(204).end();
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword required' });
    }
    const user = await User.findById(req.user.id);
    if (!user.password) return res.status(400).json({ error: 'No password set on this account' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/link-google
router.post('/link-google', requireAuth, async (req, res) => {
  try {
    const accessToken = req.body.accessToken || req.body.credential;
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });

    const gRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!gRes.ok) return res.status(401).json({ error: 'Invalid Google token' });
    const gUser = await gRes.json();

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { googleId: gUser.id, googleLinked: true },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/link-google
router.delete('/link-google', requireAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $unset: { googleId: '' }, googleLinked: false },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
