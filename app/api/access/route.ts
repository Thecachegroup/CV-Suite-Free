import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { normaliseEmail, isValidEmail, registerOrFetch, storeConfigured } from '@/lib/store'

export const runtime = 'nodejs'

/**
 * Registers an email address and returns how many uses are left.
 * Does not consume a use — that happens in /api/generate.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = normaliseEmail(body?.email)

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const record = await registerOrFetch(email)

    // Tell Andrew when someone new signs up. Non-blocking on failure — a notification
    // problem must never stop a candidate using the tool.
    if (record.isNew) {
      notifyNewSignup(email).catch(err => console.error('Signup notification failed:', err))
    }

    return NextResponse.json({
      email: record.email,
      tier: record.tier,
      remaining: record.remaining,
      allowance: record.allowance,
      resetsOn: record.resetsOn,
      stored: storeConfigured,
    })
  } catch (err) {
    console.error('Access error:', err)
    return NextResponse.json({ error: 'Could not verify your email. Please try again.' }, { status: 500 })
  }
}

async function notifyNewSignup(email: string) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  if (!apiKey || !to) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'CV Suite <noreply@thecachegroup.com.au>',
    to,
    subject: `CV Suite — new user: ${email}`,
    html: `<p>New email registered on CV Suite Free:</p><p><strong>${escapeHtml(email)}</strong></p>`,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}
