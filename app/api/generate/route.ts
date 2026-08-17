import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { PROMPTS, PROMPTS_OVERRIDE } from '@/lib/prompts'
import { normaliseEmail, isValidEmail, reserveUse, refundUse } from '@/lib/store'
import { getClientIp } from '@/lib/ip'

export const runtime = 'nodejs'

// Hobby plan allows up to 300s with fluid compute (on by default).
// A long CV streaming at Haiku speed finishes well inside this; the headroom is
// what stops a long generation being cut off at the old 60s ceiling.
export const maxDuration = 300

/**
 * Output ceilings per tool. A truncated CV is worse than no CV, so these are set
 * generously — you are billed for tokens actually produced, not for the ceiling.
 */
const MAX_TOKENS: Record<string, number> = {
  tailoredCV: 16000,
  coverLetter: 4000,
  interviewPrep: 8000,
}

/** Marker the browser watches for so it can show a proper warning. */
const TRUNCATION_MARKER = '\n\n[[TRUNCATED]]'

const MAX_INPUT_CHARS = 400_000

export async function POST(req: NextRequest) {
  let reservedEmail = ''

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const body = await req.json()
    const { tool, inputs, forceGenerate } = body

    if (!tool || !inputs) return NextResponse.json({ error: 'Missing tool or inputs' }, { status: 400 })

    // ── Access check ────────────────────────────────────────────────────────
    const email = normaliseEmail(body?.email)
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter your email address to use these tools.' }, { status: 401 })
    }

    // ── Input floor ─────────────────────────────────────────────────────────
    // The browser checks this too, but the browser can be bypassed — without a real
    // CV and a real job ad the model has nothing to ground its output in.
    const cvText = typeof inputs.cv === 'string' ? inputs.cv.trim() : ''
    const jdText = typeof inputs.jd === 'string' ? inputs.jd.trim() : ''
    if (cvText.length < 200) {
      return NextResponse.json({ error: 'A full CV is required.' }, { status: 400 })
    }
    if (jdText.length < 100) {
      return NextResponse.json({ error: 'A full job advertisement is required.' }, { status: 400 })
    }
    if (cvText.length + jdText.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: 'That is too much text to process at once. Please trim your CV or the job ad.' },
        { status: 400 }
      )
    }

    let systemPrompt: string
    if (tool === 'tailoredCV' && forceGenerate) {
      systemPrompt = PROMPTS_OVERRIDE.tailoredCVForced
    } else {
      systemPrompt = PROMPTS[tool as keyof typeof PROMPTS]
    }
    if (!systemPrompt) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 })

    // ── Reserve a use ───────────────────────────────────────────────────────
    // Reserved before the model runs so the output cannot be taken for free by
    // aborting at the last moment. Refunded below if the generation fails or is
    // cut short.
    const reservation = await reserveUse(email, getClientIp(req.headers))
    if (!reservation.ok) {
      if (reservation.reason === 'ip_limit') {
        return NextResponse.json(
          { error: 'This connection has reached its daily limit. Please try again tomorrow.', remaining: reservation.remaining },
          { status: 429 }
        )
      }
      return NextResponse.json(
        {
          error: `You have used all ${reservation.allowance} of your free generations.`,
          exhausted: true,
          remaining: 0,
        },
        { status: 429 }
      )
    }
    reservedEmail = email

    // ── Build the request ───────────────────────────────────────────────────
    let userMessage = ''
    if (tool === 'tailoredCV') {
      userMessage = `CANDIDATE CV:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}`
    } else if (tool === 'coverLetter') {
      const companyName = typeof inputs.company === 'string' ? inputs.company.trim() : ''
      const roleTitle = typeof inputs.role === 'string' ? inputs.role.trim() : ''
      userMessage = `CANDIDATE CV:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nCOMPANY NAME: ${companyName}\nROLE TITLE: ${roleTitle}`
    } else if (tool === 'interviewPrep') {
      const companyName = typeof inputs.company === 'string' ? inputs.company.trim() : ''
      const companyLine = companyName
        ? `COMPANY NAME: ${companyName}`
        : `COMPANY NAME: not supplied — do not name or describe any company.`
      userMessage = `CANDIDATE CV:\n${cvText}\n\nJOB ADVERTISEMENT:\n${jdText}\n\n${companyLine}`
    }

    const anthropic = new Anthropic({ apiKey })
    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: MAX_TOKENS[tool] ?? 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let stopReason: string | null = null
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text))
            } else if (chunk.type === 'message_delta') {
              stopReason = chunk.delta.stop_reason ?? null
            }
          }

          // Hitting the token ceiling means the output stopped mid-sentence. The user
          // gets a clear warning instead of a silently broken document, and the use
          // goes back on their allowance.
          if (stopReason === 'max_tokens') {
            controller.enqueue(encoder.encode(TRUNCATION_MARKER))
            await refundUse(email).catch(() => {})
          }
        } catch (err) {
          console.error('Streaming error:', err)
          controller.enqueue(encoder.encode(TRUNCATION_MARKER))
          await refundUse(email).catch(() => {})
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Uses-Remaining': String(reservation.remaining),
        'X-Uses-Allowance': String(reservation.allowance),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Generate error:', message)
    // Never charge for a request that never produced anything.
    if (reservedEmail) await refundUse(reservedEmail).catch(() => {})
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }
}
