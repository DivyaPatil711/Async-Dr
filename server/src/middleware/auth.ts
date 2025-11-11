import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtUser } from '../tokens';

declare global {
  // add user to req
  namespace Express {
    interface Request { user?: JwtUser }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const u = verifyAccessToken(token);
    req.user = u;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
