import jwt from 'jsonwebtoken';

const ACCESS_SECRET  = process.env.ACCESS_TOKEN_SECRET  ?? process.env.JWT_SECRET ?? 'dev_access';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'dev_refresh';
// Narrow types to jsonwebtoken's expected expiresIn type to satisfy TS overloads
const ACCESS_EXPIRES_IN: jwt.SignOptions['expiresIn']  = (process.env.ACCESS_TOKEN_EXPIRES_IN  ?? '15m') as unknown as jwt.SignOptions['expiresIn'];
const REFRESH_EXPIRES_IN: jwt.SignOptions['expiresIn'] = (process.env.REFRESH_TOKEN_EXPIRES_IN ?? '30d') as unknown as jwt.SignOptions['expiresIn'];

export type JwtUser = {
  sub: string;
  email: string;
  name?: string | null;
  tokenVersion: number; // mirrors prisma User.tokenVersion
};

export function signAccessToken(u: JwtUser) {
  // keep payload minimal for size
  return jwt.sign({ sub: u.sub, email: u.email, name: u.name ?? undefined }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN
  });
}

export function signRefreshToken(u: JwtUser) {
  // include tokenVersion so we can invalidate all sessions
  return jwt.sign({ sub: u.sub, email: u.email, tokenVersion: u.tokenVersion }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN
  });
}

export function verifyAccessToken(t: string): JwtUser {
  return jwt.verify(t, ACCESS_SECRET) as any;
}

export function verifyRefreshToken(t: string): JwtUser {
  return jwt.verify(t, REFRESH_SECRET) as any;
}
