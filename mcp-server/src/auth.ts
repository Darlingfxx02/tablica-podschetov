import crypto from 'node:crypto'
import { promisify } from 'node:util'
import type { Request, Response, NextFunction } from 'express'
import type { ProposalStore } from './store.js'

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>

const HASH_KEYLEN = 64
const SALT_BYTES = 16
const TOKEN_BYTES = 32
const SESSION_TTL_DAYS = 30
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'tablica_session'

export const SESSION_TTL_MS_VALUE = SESSION_TTL_MS
export const SESSION_COOKIE_NAME = COOKIE_NAME

/** Returns "<saltHex>:<hashHex>" — single column in the DB. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES)
  const hash = await scrypt(password, salt, HASH_KEYLEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const got = await scrypt(password, salt, HASH_KEYLEN)
  // Constant-time compare — tolerant of length mismatch.
  return expected.length === got.length && crypto.timingSafeEqual(expected, got)
}

/** URL-safe random token; 32 bytes → 43 base64url chars. */
export function randomToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url')
}

export interface AuthRequest extends Request {
  userId?: string
  userEmail?: string
}

/** Reads tablica_session cookie, validates against the DB, attaches user to req. */
export function makeAuthMiddleware(store: ProposalStore) {
  return function readSession(req: AuthRequest, _res: Response, next: NextFunction) {
    const token = readCookie(req.headers.cookie, COOKIE_NAME)
    if (!token) return next()
    const session = store.getSession(token)
    if (!session) return next()
    if (session.expiresAt < Date.now()) {
      store.deleteSession(token)
      return next()
    }
    req.userId = session.userId
    req.userEmail = session.userEmail
    next()
  }
}

/** Gates a route on an authenticated user. Use after readSession. */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'unauthenticated' })
  next()
}

/**
 * Cookie config — tuned per env. In prod the cookie spans both kp and
 * api.kp via Domain=.kp.darlingdesign.pro, requires HTTPS, and stays
 * SameSite=Lax (cross-subdomain same-site requests still send it).
 */
export function buildSessionCookie(token: string): string {
  const isProd = process.env.NODE_ENV === 'production'
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (isProd) {
    parts.push('Secure')
    const domain = process.env.SESSION_COOKIE_DOMAIN || '.kp.darlingdesign.pro'
    parts.push(`Domain=${domain}`)
  }
  return parts.join('; ')
}

export function buildClearCookie(): string {
  const isProd = process.env.NODE_ENV === 'production'
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd) {
    parts.push('Secure')
    const domain = process.env.SESSION_COOKIE_DOMAIN || '.kp.darlingdesign.pro'
    parts.push(`Domain=${domain}`)
  }
  return parts.join('; ')
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return null
}

/** Light-touch email check — keep generous, real validation happens via login attempts. */
export function isEmailish(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function isPasswordOk(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 8 && s.length <= 256
}
