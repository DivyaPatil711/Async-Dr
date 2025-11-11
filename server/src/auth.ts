import { Router } from 'express';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { prisma } from './prisma';
import { authLimiter } from './rateLimit';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens';

const router = Router();

const COOKIE_NAME  = process.env.REFRESH_COOKIE_NAME  || 'rt';
const COOKIE_PATH  = process.env.REFRESH_COOKIE_PATH  || '/api/auth/refresh';
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

// Attach cookie parser for this subrouter
router.use(cookieParser());

// Helpers
function setRefreshCookie(res: any, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 1000 * 60 * 60 * 24 * 30 // ~30d
  });
}
function clearRefreshCookie(res: any) {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
}

// POST /auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name ?? null }
    });

    const accessToken  = signAccessToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    const refreshToken = signRefreshToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    setRefreshCookie(res, refreshToken);

    return res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || 'register failed' });
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken  = signAccessToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    const refreshToken = signRefreshToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    setRefreshCookie(res, refreshToken);

    return res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e:any) {
    return res.status(500).json({ error: e?.message || 'login failed' });
  }
});

// POST /auth/refresh (uses cookie)
router.post('/refresh', authLimiter, async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: 'No refresh token' });

    const payload = verifyRefreshToken(raw);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check tokenVersion to invalidate old sessions
    if (payload.tokenVersion !== user.tokenVersion) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // rotate refresh
    const accessToken  = signAccessToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    const refreshToken = signRefreshToken({ sub: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion });
    setRefreshCookie(res, refreshToken);

    return res.json({ accessToken });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /auth/logout (invalidate all sessions by bumping tokenVersion)
router.post('/logout', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

export default router;
