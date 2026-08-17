import { NextRequest, NextResponse } from 'next/server'
import { listUsers, grantUses, normaliseEmail, isValidEmail, DEFAULT_ALLOWANCE, storeConfigured } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * Admin endpoint. Guarded by ADMIN_KEY (set in Vercel environment variables).
 *
 *   List everyone who has signed up, as a CSV download:
 *     /api/admin?key=YOUR_KEY
 *
 *   Same list as JSON in the browser:
 *     /api/admin?key=YOUR_KEY&format=json
 *
 *   Give someone a fresh allowance (this is the "email us for more uses" flow):
 *     /api/admin?key=YOUR_KEY&grant=someone@example.com
 *     /api/admin?key=YOUR_KEY&grant=someone@example.com&uses=20
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

  // ── Grant more uses ───────────────────────────────────────────────────────
  const grant = normaliseEmail(params.get('grant'))
  if (grant) {
    if (!isValidEmail(grant)) {
      return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 })
    }
    const uses = Number(params.get('uses') || DEFAULT_ALLOWANCE)
    if (!Number.isFinite(uses) || uses < 1 || uses > 1000) {
      return NextResponse.json({ error: 'uses must be between 1 and 1000.' }, { status: 400 })
    }
    const record = await grantUses(grant, uses)
    return NextResponse.json({ granted: grant, uses, record })
  }

  // ── List users ────────────────────────────────────────────────────────────
  const users = await listUsers()

  if (params.get('format') === 'json') {
    return NextResponse.json({ count: users.length, users })
  }

  const header = 'Email,Used,Allowance,Remaining,First seen,Last used\n'
  const rows = users
    .map(u => {
      const remaining = Math.max(0, u.allowance - u.used)
      return [u.email, u.used, u.allowance, remaining, u.firstSeen, u.lastUsed].map(csvCell).join(',')
    })
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
