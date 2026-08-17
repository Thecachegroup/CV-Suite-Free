import { Redis } from '@upstash/redis'

/**
 * Usage store for CV Suite Free.
 *
 * Backed by Upstash Redis (Vercel Marketplace → Storage → Upstash for Redis).
 * Vercel KV was retired in December 2024; existing stores were migrated to Upstash.
 *
 * The Vercel integration injects both naming conventions depending on when the
 * store was created, so we accept either rather than making Andrew debug env vars.
 */

const url =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  ''

const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  ''

export const storeConfigured = Boolean(url && token)

const redis = storeConfigured ? new Redis({ url, token }) : null

/** Uses granted to a new email address. Override with FREE_USES in Vercel. */
export const DEFAULT_ALLOWANCE = Number(process.env.FREE_USES || 10)

/** Hard daily backstop per IP, so one person cannot simply cycle email addresses. */
export const DAILY_IP_LIMIT = Number(process.env.DAILY_IP_LIMIT || 25)

export type AccessRecord = {
  email: string
  used: number
  allowance: number
  remaining: number
  isNew: boolean
}

// ── Keys ──────────────────────────────────────────────────────────────────────
const userKey = (email: string) => `user:${email}`
const ipKey = (ip: string, day: string) => `ip:${ip}:${day}`
const USERS_INDEX = 'users:index'

export function normaliseEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

/** Deliberately permissive — we are capturing leads, not validating identity. */
export function isValidEmail(email: string): boolean {
  if (email.length < 6 || email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Look up an email, creating the record on first sight.
 * Returns the current position without consuming a use.
 */
export async function registerOrFetch(email: string): Promise<AccessRecord> {
  if (!redis) {
    // Store not configured — fail open so the tools keep working, but grant nothing
    // persistent. Surfaces as an unlimited session rather than a hard outage.
    return { email, used: 0, allowance: DEFAULT_ALLOWANCE, remaining: DEFAULT_ALLOWANCE, isNew: false }
  }

  const key = userKey(email)
  const existing = await redis.hgetall<Record<string, string>>(key)

  if (existing && existing.email) {
    const used = Number(existing.used || 0)
    const allowance = Number(existing.allowance || DEFAULT_ALLOWANCE)
    return { email, used, allowance, remaining: Math.max(0, allowance - used), isNew: false }
  }

  const now = new Date().toISOString()
  await redis.hset(key, {
    email,
    used: 0,
    allowance: DEFAULT_ALLOWANCE,
    firstSeen: now,
    lastUsed: '',
  })
  await redis.zadd(USERS_INDEX, { score: Date.now(), member: email })

  return { email, used: 0, allowance: DEFAULT_ALLOWANCE, remaining: DEFAULT_ALLOWANCE, isNew: true }
}

// ── Consuming a use ───────────────────────────────────────────────────────────

export type ReserveResult =
  | { ok: true; remaining: number; allowance: number }
  | { ok: false; reason: 'exhausted' | 'ip_limit'; remaining: number; allowance: number }

/**
 * Reserve one use up front, before the model is called.
 *
 * Reserving first (rather than counting afterwards) means a user cannot abort the
 * request at the last moment and get the output for free. If the generation fails
 * or is cut short, refundUse() puts it back — see /api/generate.
 */
export async function reserveUse(email: string, ip: string): Promise<ReserveResult> {
  if (!redis) {
    return { ok: true, remaining: DEFAULT_ALLOWANCE, allowance: DEFAULT_ALLOWANCE }
  }

  const key = userKey(email)
  const record = await redis.hgetall<Record<string, string>>(key)
  const allowance = Number(record?.allowance || DEFAULT_ALLOWANCE)
  const used = Number(record?.used || 0)

  if (used >= allowance) {
    return { ok: false, reason: 'exhausted', remaining: 0, allowance }
  }

  // Daily IP backstop — stops one person cycling through throwaway addresses.
  if (ip) {
    const dayKey = ipKey(ip, today())
    const ipCount = await redis.incr(dayKey)
    if (ipCount === 1) await redis.expire(dayKey, 60 * 60 * 26)
    if (ipCount > DAILY_IP_LIMIT) {
      return { ok: false, reason: 'ip_limit', remaining: Math.max(0, allowance - used), allowance }
    }
  }

  const newUsed = await redis.hincrby(key, 'used', 1)
  await redis.hset(key, { lastUsed: new Date().toISOString() })

  return { ok: true, remaining: Math.max(0, allowance - newUsed), allowance }
}

/**
 * Give a use back. Called when a generation fails or is truncated mid-output —
 * nobody should pay for a half-finished CV.
 */
export async function refundUse(email: string): Promise<number> {
  if (!redis) return DEFAULT_ALLOWANCE
  const key = userKey(email)
  const record = await redis.hgetall<Record<string, string>>(key)
  if (!record?.email) return 0
  const allowance = Number(record.allowance || DEFAULT_ALLOWANCE)
  const used = Number(record.used || 0)
  if (used <= 0) return allowance
  const newUsed = await redis.hincrby(key, 'used', -1)
  return Math.max(0, allowance - newUsed)
}

/**
 * Generic per-IP daily counter, used to stop endpoints being hammered.
 * Returns true when the caller is still under the limit.
 */
export async function underDailyIpLimit(bucket: string, ip: string, limit: number): Promise<boolean> {
  if (!redis || !ip) return true
  const key = `limit:${bucket}:${ip}:${today()}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 60 * 60 * 26)
  return count <= limit
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export type UserRow = {
  email: string
  used: number
  allowance: number
  firstSeen: string
  lastUsed: string
}

/** Newest first. */
export async function listUsers(limit = 5000): Promise<UserRow[]> {
  if (!redis) return []
  const emails = await redis.zrange<string[]>(USERS_INDEX, 0, limit - 1, { rev: true })
  if (!emails.length) return []

  const rows: UserRow[] = []
  for (const email of emails) {
    const r = await redis.hgetall<Record<string, string>>(userKey(email))
    if (!r?.email) continue
    rows.push({
      email: r.email,
      used: Number(r.used || 0),
      allowance: Number(r.allowance || DEFAULT_ALLOWANCE),
      firstSeen: r.firstSeen || '',
      lastUsed: r.lastUsed || '',
    })
  }
  return rows
}

/** Grant a fresh allowance to one address. Used when someone emails asking for more. */
export async function grantUses(email: string, uses: number): Promise<AccessRecord | null> {
  if (!redis) return null
  const key = userKey(email)
  const record = await redis.hgetall<Record<string, string>>(key)
  if (!record?.email) {
    await registerOrFetch(email)
  }
  await redis.hset(key, { used: 0, allowance: uses })
  return { email, used: 0, allowance: uses, remaining: uses, isNew: false }
}
