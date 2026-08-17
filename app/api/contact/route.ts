import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { underDailyIpLimit } from '@/lib/store'
import { getClientIp } from '@/lib/ip'

export const runtime = 'nodejs'

const CONTACT_LIMIT_PER_DAY = 5

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, message } = await req.json()

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 })
    }

    // Without this, the endpoint can be scripted in a loop and used to flood the inbox.
    const allowed = await underDailyIpLimit('contact', getClientIp(req.headers), CONTACT_LIMIT_PER_DAY)
    if (!allowed) {
      return NextResponse.json(
        { error: 'You have sent several messages today. Please email us directly instead.' },
        { status: 429 }
      )
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('RESEND_API_KEY not set')
      return NextResponse.json({ error: 'Email service not configured.' }, { status: 500 })
    }

    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: 'CV Suite <noreply@thecachegroup.com.au>',
      to: 'matt@thecachegroup.com.au',
      replyTo: String(email).trim(),
      subject: `CV Suite enquiry from ${String(name).trim().slice(0, 80)}`,
      html: `
        <h2>New enquiry from CV Suite Free</h2>
        <p><strong>Name:</strong> ${esc(name)}</p>
        <p><strong>Email:</strong> ${esc(email)}</p>
        <p><strong>Phone:</strong> ${phone ? esc(phone) : 'Not provided'}</p>
        <hr />
        <p><strong>Message:</strong></p>
        <p>${esc(message).replace(/\n/g, '<br />')}</p>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Contact error:', err)
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }
}

/** Anything a stranger types goes through here before it reaches an HTML email. */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}
