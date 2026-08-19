import { NextRequest, NextResponse } from 'next/server'
import {
  listUsers,
  listPremium,
  grantUses,
  setPremium,
  normaliseEmail,
  isValidEmail,
  storeConfigured,
  FREE_USES,
  PREMIUM_USES,
  period,
  resetsOn,
} from '@/lib/store'

export const runtime = 'nodejs'

/**
 * Admin endpoint. Guarded by ADMIN_KEY (set in Vercel environment variables).
 *
 *   Everyone who has signed up, as a CSV download:
 *     /api/admin?key=YOUR_KEY
 *
 *   Same list as JSON in the browser:
 *     /api/admin?key=YOUR_KEY&format=json
 *
 *   Put someone on the premium (course) list — 15 generations a month:
 *     /api/admin?key=YOUR_KEY&premium=someone@example.com
 *
 *   Take them off it again:
 *     /api/admin?key=YOUR_KEY&unpremium=someone@example.com
 *
 *   See who is on the premium list:
 *     /api/admin?key=YOUR_KEY&premiumlist=1
 *
 *   Give someone extra generations for THIS MONTH ONLY (the "email us for
 *   more" flow). Next month they drop back to their normal allowance:
 *     /api/admin?key=YOUR_KEY&grant=someone@example.com&uses=5
 *
 * None of these need a redeploy. They take effect immediately.
 */
export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_KEY is not set on this deployment.' }, { status: 500 })
  }

  const params = req.nextUrl.searchParams
  if (params.get('key') !== adminKey) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  }

  if (!storeConfigured) {
    return NextResponse.json(
      { error: 'No Redis store is connected, so no emails are being recorded.' },
      { status: 500 }
    )
  }

  // ── Premium list ──────────────────────────────────────────────────────────
  if (params.get('premiumlist')) {
    const emails = await listPremium()
    return NextResponse.json({
      count: emails.length,
      monthlyAllowance: PREMIUM_USES,
      emails,
    })
  }

  const premium = normaliseEmail(params.get('premium'))
  if (premium) {
    if (!isValidEmail(premium)) {
      return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 })
    }
    const record = await setPremium(premium, true)
    return NextResponse.json({ premium: premium, tier: 'premium', record })
  }

  const unpremium = normaliseEmail(params.get('unpremium'))
  if (unpremium) {
    if (!isValidEmail(unpremium)) {
      return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 })
    }
    const record = await setPremium(unpremium, false)
    return NextResponse.json({ removed: unpremium, tier: 'free', record })
  }

  // ── Extra generations for this month ──────────────────────────────────────
  const grant = normaliseEmail(params.get('grant'))
  if (grant) {
    if (!isValidEmail(grant)) {
      return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 })
    }
    const uses = Number(params.get('uses') || FREE_USES)
    if (!Number.isFinite(uses) || uses < 1 || uses > 1000) {
      return NextResponse.json({ error: 'uses must be between 1 and 1000.' }, { status: 400 })
    }
    const record = await grantUses(grant, uses)
    return NextResponse.json({
      granted: grant,
      extraUsesThisMonth: uses,
      appliesUntil: resetsOn(),
      record,
    })
  }

  // ── List users ────────────────────────────────────────────────────────────
  const users = await listUsers()

  if (params.get('format') === 'json') {
    return NextResponse.json({
      month: period(),
      resetsOn: resetsOn(),
      freeAllowance: FREE_USES,
      premiumAllowance: PREMIUM_USES,
      count: users.length,
      users,
    })
  }

  const header = 'Email,Tier,Used this month,Allowance,Remaining,Used all time,First seen,Last used\n'
  const rows = users
    .map(u =>
      [u.email, u.tier, u.used, u.allowance, u.remaining, u.totalUsed, u.firstSeen, u.lastUsed]
        .map(csvCell)
        .join(',')
    )
    .join('\n')

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(header + rows + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cv-suite-users_${stamp}.csv"`,
    },
  })
}

function csvCell(value: string | number): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
