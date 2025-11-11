import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10_000);
const max = Number(process.env.RATE_LIMIT_MAX ??   10);

export const standardLimiter = rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' }
});
