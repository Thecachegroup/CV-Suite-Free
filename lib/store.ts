import { Redis } from '@upstash/redis'

/**
 * Usage store for CV Suite Free.
 *
 * Backed by Upstash Redis (Vercel Marketplace → Storage → Upstash for Redis).
 * Vercel KV was retired in December 2024; existing stores were migrated to Upstash.
 *
 * The Vercel integration injects both naming conventions depending on when the
 * store was created, so we accept either rather than making Andrew debug env vars.
 *
 * Allowances are MONTHLY and reset on the 1st, Melbourne time:
 *   Free     5 generations per calendar month
 *   Premium  15 generations per calendar month (course enrolees)
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

/** Monthly allowance for an ordinary user. Override with FREE_USES in Vercel. */
export const FREE_USES = Number(process.env.FREE_USES || 5)

/** Monthly allowance for a premium (course) user. Override with PREMIUM_USES. */
export const PREMIUM_USES = Number(process.env.PREMIUM_USES || 15)

/** Hard daily backstop per connection, so one person cannot simply cycle email addresses. */
export const DAILY_IP_LIMIT = Number(process.env.DAILY_IP_LIMIT || 25)

/**
 * Optional seed list of premium addresses, comma separated, set in Vercel.
 * Anyone added later through /api/admin is stored in Redis instead, so you never
 * need a redeploy to enrol someone.
 */
const PREMIUM_SEED: string[] = (process.env.PREMIUM_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

export type Tier = 'free' | 'premium'

export type AccessRecord = {
  email: string
  tier: Tier
  used: number
  allowance: number
  remaining: number
  isNew: boolean
  /** Human-readable date the allowance rolls over, e.g. "1 September 2026". */
  resetsOn: string
}

// ── Keys ──────────────────────────────────────────────────────────────────────
const userKey = (email: string) => `user:${email}`
const usedKey = (email: string, p: string) => `used:${email}:${p}`
const bonusKey = (email: string, p: string) => `bonus:${email}:${p}`
const ipKey = (ip: string, day: string) => `ip:${ip}:${day}`
const USERS_INDEX = 'users:index'
const PREMIUM_SET = 'premium:members'

/** Monthly counters are kept a little over three months, then expire themselves. */
const PERIOD_TTL_SECONDS = 100 * 24 * 60 * 60

const MELBOURNE = 'Australia/Melbourne'

export function normaliseEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

/** Deliberately permissive — we are capturing leads, not validating identity. */
export function isValidEmail(email: string): boolean {
  if (email.length < 6 || email.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

// ── Dates (Melbourne, so the month rolls over at local midnight) ───────────────

function melbourneParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MELBOURNE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Current billing period, e.g. "2026-08". */
export function period(d: Date = new Date()): string {
  const { year, month } = melbourneParts(d)
  return `${year}-${month}`
}

/** Current date in Melbourne, e.g. "2026-08-19". Used for daily IP counters. */
export function today(d: Date = new Date()): string {
  const { year, month, day } = melbourneParts(d)
  return `${year}-${month}-${day}`
}

/** The 1st of next month, written out for the user. */
export function resetsOn(d: Date = new Date()): string {
  const { year, month } = melbourneParts(d)
  const y = Number(year)
  const m = Number(month)
  const nextYear = m === 12 ? y + 1 : y
  const nextMonth = m === 12 ? 1 : m + 1
  const monthName = new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(nextYear, nextMonth - 1, 1)))
  return `1 ${monthName} ${nextYear}`
}

// ── Tier ──────────────────────────────────────────────────────────────────────

export async function getTier(email: string): Promise<Tier> {
  if (PREMIUM_SEED.includes(email)) return 'premium'
  if (!redis) return 'free'
  const member = await redis.sismember(PREMIUM_SET, email)
  return member ? 'premium' : 'free'
}

export function baseAllowance(tier: Tier): number {
  return tier === 'premium' ? PREMIUM_USES : FREE_USES
}

/** Base allowance for the tier plus any top-up granted this month. */
async function allowanceFor(email: string, tier: Tier, p: string): Promise<number> {
  const base = baseAllowance(tier)
  if (!redis) return base
  const bonus = Number((await redis.get<number>(bonusKey(email, p))) || 0)
  return base + Math.max(0, bonus)
}

async function usedThisPeriod(email: string, p: string): Promise<number> {
  if (!redis) return 0
  return Number((await redis.get<number>(usedKey(email, p))) || 0)
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Look up an email, creating the record on first sight.
 * Returns the current position without consuming a use.
 */
export async function registerOrFetch(email: string): Promise<AccessRecord> {
  const p = period()

  if (!redis) {
    // Store not configured — fail open so the tools keep working, but nothing is
    // recorded. Shows as a full allowance rather than a hard outage.
    return {
      email,
      tier: 'free',
      used: 0,
      allowance: FREE_USES,
      remaining: FREE_USES,
      isNew: false,
      resetsOn: resetsOn(),
    }
  }

  const key = userKey(email)
  const existing = await redis.hgetall<Record<string, string>>(key)
  const isNew = !existing || !existing.email

  if (isNew) {
    await redis.hset(key, {
      email,
      firstSeen: new Date().toISOString(),
      lastUsed: '',
      totalUsed: 0,
    })
    await redis.zadd(USERS_INDEX, { score: Date.now(), member: email })
  }

  const tier = await getTier(email)
  const allowance = await allowanceFor(email, tier, p)
  const used = await usedThisPeriod(email, p)

  return {
    email,
    tier,
    used,
    allowance,
    remaining: Math.max(0, allowance - used),
    isNew,
    resetsOn: resetsOn(),
  }
}

// ── Consuming a use ───────────────────────────────────────────────────────────

export type ReserveResult =
  | { ok: true; remaining: number; allowance: number; tier: Tier }
  | { ok: false; reason: 'exhausted' | 'ip_limit'; remaining: number; allowance: number; tier: Tier }

/**
 * Reserve one use up front, before the model is called.
 *
 * Reserving first (rather than counting afterwards) means a user cannot abort the
 * request at the last moment and get the output for free. If the generation fails
 * or is cut short, refundUse() puts it back — see /api/generate.
 */
export async function reserveUse(email: string, ip: string): Promise<ReserveResult> {
  const p = period()

  if (!redis) {
    return { ok: true, remaining: FREE_USES, allowance: FREE_USES, tier: 'free' }
  }

  const tier = await getTier(email)
  const allowance = await allowanceFor(email, tier, p)

  // Daily IP backstop — stops one person cycling through throwaway addresses.
  if (ip) {
    const dayKey = ipKey(ip, today())
    const ipCount = await redis.incr(dayKey)
    if (ipCount === 1) await redis.expire(dayKey, 60 * 60 * 26)
    if (ipCount > DAILY_IP_LIMIT) {
      const used = await usedThisPeriod(email, p)
      return {
        ok: false,
        reason: 'ip_limit',
        remaining: Math.max(0, allowance - used),
        allowance,
        tier,
      }
    }
  }

  // Increment first, then check. Doing it this way round means two requests
  // arriving at the same instant cannot both slip through on the last use.
  const key = usedKey(email, p)
  const used = await redis.incr(key)
  if (used === 1) await redis.expire(key, PERIOD_TTL_SECONDS)

  if (used > allowance) {
    await redis.decr(key)
    return { ok: false, reason: 'exhausted', remaining: 0, allowance, tier }
  }

  await redis.hset(userKey(email), { lastUsed: new Date().toISOString() })
  await redis.hincrby(userKey(email), 'totalUsed', 1)

  return { ok: true, remaining: Math.max(0, allowance - used), allowance, tier }
}

/**
 * Give a use back. Called when a generation fails or is truncated mid-output —
 * nobody should pay for a half-finished CV.
 */
export async function refundUse(email: string): Promise<void> {
  if (!redis) return
  const p = period()
  const key = usedKey(email, p)
  const current = Number((await redis.get<number>(key)) || 0)
  if (current <= 0) return
  await redis.decr(key)
  await redis.hincrby(userKey(email), 'totalUsed', -1)
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
  tier: Tier
  used: number
  allowance: number
  remaining: number
  totalUsed: number
  firstSeen: string
  lastUsed: string
}

/** Newest first. Usage figures are for the current month. */
export async function listUsers(limit = 5000): Promise<UserRow[]> {
  if (!redis) return []
  const emails = await redis.zrange<string[]>(USERS_INDEX, 0, limit - 1, { rev: true })
  if (!emails.length) return []

  const p = period()
  const stored = ((await redis.smembers(PREMIUM_SET)) as string[] | null) || []
  const premiumMembers = new Set<string>(stored)
  PREMIUM_SEED.forEach(e => premiumMembers.add(e))

  const rows: UserRow[] = []
  for (const email of emails) {
    const r = await redis.hgetall<Record<string, string>>(userKey(email))
    if (!r?.email) continue
    const tier: Tier = premiumMembers.has(email) ? 'premium' : 'free'
    const bonus = Number((await redis.get<number>(bonusKey(email, p))) || 0)
    const allowance = baseAllowance(tier) + Math.max(0, bonus)
    const used = Number((await redis.get<number>(usedKey(email, p))) || 0)
    rows.push({
      email: r.email,
      tier,
      used,
      allowance,
      remaining: Math.max(0, allowance - used),
      totalUsed: Number(r.totalUsed || 0),
      firstSeen: r.firstSeen || '',
      lastUsed: r.lastUsed || '',
    })
  }
  return rows
}

/**
 * Top someone up for the current month only. Used for the "email us for more"
 * flow. Next month they go back to their normal tier allowance.
 */
export async function grantUses(email: string, extra: number): Promise<AccessRecord | null> {
  if (!redis) return null
  const p = period()
  await registerOrFetch(email)
  const key = bonusKey(email, p)
  const current = Number((await redis.get<number>(key)) || 0)
  await redis.set(key, current + extra, { ex: PERIOD_TTL_SECONDS })
  return registerOrFetch(email)
}

/** Move an address on or off the premium (course) list. Takes effect immediately. */
export async function setPremium(email: string, on: boolean): Promise<AccessRecord | null> {
  if (!redis) return null
  await registerOrFetch(email)
  if (on) await redis.sadd(PREMIUM_SET, email)
  else await redis.srem(PREMIUM_SET, email)
  return registerOrFetch(email)
}

/** Every address currently on the premium list, including any set via PREMIUM_EMAILS. */
export async function listPremium(): Promise<string[]> {
  const seeded = [...PREMIUM_SEED]
  if (!redis) return seeded.sort()
  const stored = ((await redis.smembers(PREMIUM_SET)) as string[] | null) || []
  return Array.from(new Set([...seeded, ...stored])).sort()
}
