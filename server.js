import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './src/config/db.js';

import authRoutes from './src/routes/auth.js';
import recipeRoutes from './src/routes/recipes.js';
import userRoutes from './src/routes/users.js';
import cuisineRoutes from './src/routes/cuisines.js';
import collectionRoutes from './src/routes/collections.js';
import mealPlannerRoutes from './src/routes/mealPlanner.js';
import snapRoutes from './src/routes/snap.js';

connectDB().catch(err => {
  console.error('Fatal: could not connect to MongoDB:', err.message);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 8000;

// /health — registered before any other middleware, no DB queries
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

app.use(helmet());

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://snapcook-topaz.vercel.app', /\.vercel\.app$/]
    : true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — auth routes get a strict window to slow brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Snap is the most expensive endpoint (Gemini AI call)
const snapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many snap requests, please slow down.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cuisines', cuisineRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/meal-planner', mealPlannerRoutes);
app.use('/api/snap', snapLimiter, snapRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`SnapCook backend running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing process and try again.`);
  } else {
    console.error('Server failed to start:', err.message);
  }
  process.exit(1);
});
