'use client'

import { useState, useRef, useEffect, useCallback, DragEvent, ChangeEvent, ReactNode } from 'react'
import Image from 'next/image'

type Tool = 'tailoredCV' | 'coverLetter' | 'interviewPrep'

const TABS: { id: Tool; label: string; desc: string }[] = [
  { id: 'tailoredCV', label: 'Tailored CV', desc: 'Reformat your CV to match a specific role' },
  { id: 'coverLetter', label: 'Cover Letter', desc: 'Write a targeted cover letter grounded in your CV' },
  { id: 'interviewPrep', label: 'Interview Prep', desc: 'The 8 behavioural questions you are most likely to be asked, and what to draw on from your CV for each' },
]

const LOCKED_TABS = [
  { label: 'Master CV', desc: 'Consolidate multiple CVs into one comprehensive master document' },
  { label: '90-Sec Intro', desc: 'Role-specific spoken introduction tailored to your interview' },
  { label: 'Deep Interview Prep', desc: 'Interviewer profiling, self-calibration, panel dynamics, and 20 behavioural scenarios' },
]

const TEACHABLE_URL = 'https://www.teachable.com' // ← Replace with real URL when available

const ENQUIRIES_EMAIL = 'careers@thecachegroup.com.au'
const EMAIL_STORAGE_KEY = 'cvsuite_email'

/** Appended by /api/generate when the model ran out of room mid-output. */
const TRUNCATION_MARKER = '[[TRUNCATED]]'

// ── Email gate ────────────────────────────────────────────────────────────────
function EmailGate({ onAccess }: { onAccess: (email: string, remaining: number, allowance: number, resetsOn: string) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const value = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setErr('Please enter a valid email address.')
      return
    }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not verify your email.')
      try { localStorage.setItem(EMAIL_STORAGE_KEY, value) } catch {}
      onAccess(value, data.remaining, data.allowance, data.resetsOn || '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: '520px', margin: '40px auto', background: '#FFF', borderRadius: '12px', padding: '36px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#932B46', margin: '0 0 10px 0' }}>
        Enter your email to get started
      </h2>
      <p style={{ fontSize: '14px', color: '#6B5B5F', lineHeight: 1.6, margin: '0 0 22px 0' }}>
        These tools are free. Enter your email address and you will get a monthly allowance of
        generations across the tailored CV, cover letter and interview prep tools. Your allowance
        resets on the 1st of each month.
      </p>

      <label htmlFor="gate-email" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A3B3F', marginBottom: '6px' }}>
        Email address
      </label>
      <input
        id="gate-email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="your@email.com"
        style={{ width: '100%', padding: '11px 13px', border: '1px solid #E0D5D8', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '14px' }}
      />

      {err && (
        <div style={{ padding: '10px 14px', background: '#FDF0F2', border: '1px solid #F5C5CE', borderRadius: '8px', fontSize: '13px', color: '#932B46', marginBottom: '14px' }}>{err}</div>
      )}

      <button onClick={submit} disabled={busy}
        style={{ width: '100%', padding: '13px', background: busy ? '#C47A8E' : '#932B46', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? 'Checking…' : 'Start using the tools'}
      </button>

      <p style={{ fontSize: '12px', color: '#9E8A8E', lineHeight: 1.6, margin: '18px 0 0 0' }}>
        We store your email address so we can manage free usage, and we may contact you about
        roles and services. We do not store your CV or anything else you paste in. You can ask
        us to delete your address at any time by emailing {ENQUIRIES_EMAIL}.
      </p>
    </div>
  )
}

// ── Contact modal ─────────────────────────────────────────────────────────────
function ContactModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')

  const submit = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      setFormError('Please fill in your name, email, and message.')
      return
    }
    setSending(true)
    setFormError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSent(true)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: '14px',
    color: '#1A1A1A', background: '#FAFAFA',
    border: '1.5px solid #D4C5C9', borderRadius: '7px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: '#6B5B5F', marginBottom: '6px',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: '#FFF', borderRadius: '14px', padding: '36px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '18px', background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#9E8A8E', lineHeight: 1 }}>×</button>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A1A1A', margin: '0 0 6px 0' }}>Upgrade to Full Suite</h2>
        <p style={{ fontSize: '13px', color: '#9E8A8E', margin: '0 0 20px 0' }}>Get access to the complete toolkit — or enrol in our course to use it as part of your training.</p>

        <div style={{ background: '#FDF4F6', border: '1px solid #F0D5DB', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#932B46', margin: '0 0 8px 0' }}>Full Suite includes:</p>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#6B5B5F', lineHeight: '1.8' }}>
            <li>Master CV consolidation</li>
            <li>Role-specific 90-second introduction</li>
            <li>Deep interview prep — 20 behavioural scenarios, interviewer profiling, self-calibration</li>
            <li>Panel dynamics and deal-breaker analysis</li>
          </ul>
          <a href={TEACHABLE_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', marginTop: '12px', textAlign: 'center', padding: '10px', background: '#932B46', color: '#FFF', borderRadius: '7px', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
            Enrol in the Course →
          </a>
        </div>

        <p style={{ fontSize: '12px', color: '#9E8A8E', margin: '0 0 16px 0', textAlign: 'center' }}>Or contact us directly:</p>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#1A1A1A', margin: '0 0 6px 0' }}>Message sent!</p>
            <p style={{ fontSize: '13px', color: '#9E8A8E', margin: '0 0 24px 0' }}>We&apos;ll be in touch shortly.</p>
            <button onClick={onClose} style={{ padding: '10px 28px', background: '#932B46', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Name *</label>
              <input style={inp} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Email *</label>
              <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Phone <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="04xx xxx xxx" />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Message *</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="How can we help you?" rows={3} style={{ ...inp, resize: 'vertical' }} />
            </div>
            {formError && (
              <div style={{ padding: '10px 14px', background: '#FDF0F2', border: '1px solid #F5C5CE', borderRadius: '7px', fontSize: '13px', color: '#932B46', marginBottom: '16px' }}>{formError}</div>
            )}
            <button onClick={submit} disabled={sending} style={{ width: '100%', padding: '13px', background: sending ? '#C47A8E' : '#932B46', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer' }}>
              {sending ? 'Sending…' : 'Send Message'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Upgrade teaser (blurred preview after output) ─────────────────────────────
function UpgradeTeaser({ tool, onUpgrade }: { tool: Tool; onUpgrade: () => void }) {
  const teaserContent: Record<Tool, { title: string; preview: string }> = {
    tailoredCV: {
      title: 'Full Suite also prepares you for the interview',
      preview: `INTERVIEWER PROFILE — Sarah Chen, Head of Talent\n\nSarah has 12 years in financial services recruitment. She will probe hardest on stakeholder management and commercial acumen. Based on her LinkedIn activity she prioritises candidates who can demonstrate...\n\nPANEL DYNAMIC\n\n- The panel will collectively test delivery credibility hardest\n- Watch for tension between what the hiring manager wants and what HR is screening for\n- Lead with your [most recent role] example if given the choice\n\nSELF-CALIBRATION Q3\n\n"You don't have direct experience in [industry]. Why should we take a risk on you?"`,
    },
    coverLetter: {
      title: 'Full Suite prepares you for what comes after the application',
      preview: `90-SECOND INTRODUCTION — Role Specific\n\nWith twelve years building and leading [function] teams across [sector], I've spent my career solving the exact problem this role exists to address...\n\nSCENARIO 4 — Adaptability & Change\n\nQ. Tell me about a time you had to deliver under significant ambiguity.\n\nModel answer: When [company] restructured mid-program, I was handed a team of eight with no...\n\nDEAL-BREAKERS TO CLARIFY\n\n- Confirm whether the role has genuine budget authority or is advisory only\n- Validate reporting line — the JD is ambiguous between...`,
    },
    interviewPrep: {
      title: 'The Full Suite goes significantly deeper',
      preview: `INTERVIEWER PROFILE — Marcus Webb, CFO\n\nMarcus joined 18 months ago from [company]. His published commentary focuses on operational efficiency and ROI discipline. He will test your numbers...\n\nBEHAVIOURAL SCENARIO 6 OF 20 — Planning & Prioritisation\n\nQ. Walk me through how you managed competing priorities when [situation].\n\nPAR Story: The challenge was a hard deadline with three concurrent workstreams...\n**The decision to deprioritise [X] was mine and I owned the outcome.**\n\nSCENARIO 12 — Drive & Commercial Awareness\n\nQ. Tell me about a time you identified a commercial opportunity nobody else had seen.`,
    },
  }

  const { title, preview } = teaserContent[tool]

  return (
    <div style={{ marginTop: '28px', borderTop: '1px solid #E8DDE0', paddingTop: '24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#932B46' }}>Full Suite Preview</span>
        <p style={{ fontSize: '13px', color: '#6B5B5F', margin: '4px 0 0 0' }}>{title}</p>
      </div>
      <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
        {/* Blurred preview content */}
        <div style={{
          fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7',
          color: '#1A1A1A', background: '#F9F5F6', padding: '16px',
          whiteSpace: 'pre-wrap', filter: 'blur(3.5px)', userSelect: 'none',
          pointerEvents: 'none', maxHeight: '180px', overflow: 'hidden',
        }}>
          {preview}
        </div>
        {/* Overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(245,239,241,0.3) 0%, rgba(245,239,241,0.85) 60%, rgba(245,239,241,1) 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
          padding: '20px',
        }}>
          <button onClick={onUpgrade}
            style={{ padding: '10px 28px', background: '#932B46', color: '#FFF', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(147,43,70,0.3)' }}>
            See what&apos;s in the Full Suite →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Output renderer ───────────────────────────────────────────────────────────
function renderOutput(text: string): ReactNode[] {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const trimmed = line.trim()
    if (trimmed === '---') {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid #E0E0E0', margin: '14px 0' }} />
    }
    if (line.startsWith('# ')) {
      return <div key={i} style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', marginTop: '6px', marginBottom: '4px' }}>{renderInline(line.replace(/^# /, ''))}</div>
    }
    if (line.startsWith('## ')) {
      return <div key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginTop: '16px', marginBottom: '4px' }}>{renderInline(line.replace(/^## /, ''))}</div>
    }
    if (line.startsWith('### ')) {
      return <div key={i} style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A', marginTop: '12px', marginBottom: '2px' }}>{renderInline(line.replace(/^### /, ''))}</div>
    }
    if (trimmed.length > 2 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /^[A-Z][A-Z\s&\/()–-]+$/.test(trimmed)) {
      return <div key={i} style={{ fontSize: '12px', fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.1em', marginTop: '20px', marginBottom: '6px' }}>{trimmed}</div>
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: '8px', lineHeight: '1.6', marginBottom: '5px', paddingLeft: '4px' }}>
          <span style={{ color: '#555', flexShrink: 0, marginTop: '1px' }}>•</span>
          <span>{renderInline(line.replace(/^[-*] /, ''))}</span>
        </div>
      )
    }
    if (trimmed === '') return <div key={i} style={{ height: '8px' }} />
    return <div key={i} style={{ lineHeight: '1.6', marginBottom: '2px' }}>{renderInline(line)}</div>
  })
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    return part
  })
}

// ── DragArea ──────────────────────────────────────────────────────────────────
interface DragAreaProps {
  id: string; label: string; value: string
  onChange: (val: string) => void; onClear: () => void
  placeholder?: string; rows?: number
}

function DragArea({ id, label, value, onChange, onClear, placeholder, rows = 8 }: DragAreaProps) {
  const [dragging, setDragging] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const extractFile = async (file: File) => {
    setExtracting(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.text) onChange(data.text)
      else alert(data.error || 'Could not extract text.')
    } catch { alert('Failed to extract file. Try pasting text instead.') }
    finally { setExtracting(false) }
  }

  const onDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]; if (file) await extractFile(file)
  }, [])

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) await extractFile(file); e.target.value = ''
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label htmlFor={id} style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B5B5F' }}>{label}</label>
        {value && (
          <button onClick={onClear} style={{ fontSize: '11px', color: '#555', background: '#F0F0F0', border: '1px solid #CCC', borderRadius: '4px', cursor: 'pointer', padding: '2px 10px', fontWeight: 500 }}>
            Clear
          </button>
        )}
      </div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        style={{ borderRadius: '8px', border: `2px ${dragging ? 'solid' : 'dashed'} ${dragging ? '#932B46' : '#D4C5C9'}`, background: dragging ? '#FDF4F6' : '#FAFAFA', transition: 'all 0.15s' }}>
        <textarea id={id} value={extracting ? 'Extracting text from file...' : value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={rows} disabled={extracting}
          style={{ width: '100%', padding: '12px 14px', fontSize: '14px', lineHeight: '1.6', color: '#1A1A1A', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 8px', borderTop: '1px solid #EDE5E7' }}>
          <span style={{ fontSize: '11px', color: '#9E8A8E' }}>{extracting ? 'Reading file…' : 'Drop a .txt, .docx, or .pdf — or paste text above'}</span>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={extracting}
            style={{ fontSize: '11px', color: '#932B46', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontWeight: 600 }}>
            Browse file
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".txt,.docx,.pdf" onChange={onFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

// ── TextField ─────────────────────────────────────────────────────────────────
function TextField({ id, label, value, onChange, onClear, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; onClear?: () => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label htmlFor={id} style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B5B5F' }}>{label}</label>
        {onClear && value && (
          <button onClick={onClear} style={{ fontSize: '11px', color: '#555', background: '#F0F0F0', border: '1px solid #CCC', borderRadius: '4px', cursor: 'pointer', padding: '2px 10px', fontWeight: 500 }}>
            Clear
          </button>
        )}
      </div>
      <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 14px', fontSize: '14px', color: '#1A1A1A', background: '#FAFAFA', border: '2px dashed #D4C5C9', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<Tool>('tailoredCV')
  const [cv, setCv] = useState('')
  const [jd, setJd] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [isFitWarning, setIsFitWarning] = useState(false)

  // Access state
  const [email, setEmail] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [allowance, setAllowance] = useState<number | null>(null)
  const [resetDate, setResetDate] = useState('')
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [wasTruncated, setWasTruncated] = useState(false)

  // Returning users are remembered, so the gate is a one-time step per browser.
  useEffect(() => {
    let saved = ''
    try { saved = localStorage.getItem(EMAIL_STORAGE_KEY) || '' } catch {}
    if (!saved) { setCheckingAccess(false); return }
    fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: saved }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setEmail(saved); setRemaining(d.remaining); setAllowance(d.allowance); setResetDate(d.resetsOn || '') }
      })
      .catch(() => {})
      .finally(() => setCheckingAccess(false))
  }, [])

  const refreshRemaining = useCallback(async (addr: string) => {
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      })
      if (!res.ok) return
      const d = await res.json()
      setRemaining(d.remaining); setAllowance(d.allowance); setResetDate(d.resetsOn || '')
    } catch {}
  }, [])
  const abortRef = useRef<AbortController | null>(null)

  const switchTab = (tab: Tool) => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    setIsFitWarning(false)
    setActiveTab(tab)
    setOutput('')
    setError('')
    setLoading(false)
  }

  const getInputs = () => {
    if (activeTab === 'tailoredCV') return { cv, jd }
    if (activeTab === 'coverLetter') return { cv, jd, company, role }
    if (activeTab === 'interviewPrep') return { cv, jd, company }
    return {}
  }

  const validate = () => {
    if (!cv.trim()) return 'Please enter your CV.'
    if (cv.trim().length < 200) return 'That CV looks too short. Paste your full CV so the output is based on your real experience.'
    if (!jd.trim()) return 'Please enter the job advertisement or job description.'
    if (jd.trim().length < 100) return 'That job ad looks too short. Paste the full advertisement so the questions match the role.'
    if (activeTab === 'coverLetter' && !company.trim()) return 'Please enter the company name.'
    if (activeTab === 'coverLetter' && !role.trim()) return 'Please enter the role title.'
    return ''
  }

  const runGenerate = async (force = false) => {
    const err = validate(); if (err) { setError(err); return }
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError(''); setOutput(''); setLoading(true); setIsFitWarning(false); setWasTruncated(false)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: activeTab, inputs: getInputs(), forceGenerate: force, email }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const d = await res.json()
        if (typeof d.remaining === 'number') setRemaining(d.remaining)
        throw new Error(d.error || 'Generation failed')
      }

      const headerRemaining = res.headers.get('X-Uses-Remaining')
      if (headerRemaining !== null) setRemaining(Number(headerRemaining))

      const reader = res.body?.getReader(); if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder(); let acc = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        acc += decoder.decode(value, { stream: true })
        setOutput(acc.replace(TRUNCATION_MARKER, ''))
      }

      // The server appends a marker if the model ran out of room. The output is
      // incomplete, so flag it and do not count it against their allowance.
      const truncated = acc.includes(TRUNCATION_MARKER)
      const clean = acc.replace(TRUNCATION_MARKER, '')
      setOutput(clean)
      setWasTruncated(truncated)

      if (activeTab === 'tailoredCV' && !force && !truncated && clean.toLowerCase().includes('fit assessment')) {
        setIsFitWarning(true)
      }

      if (email) refreshRemaining(email)
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally { setLoading(false); abortRef.current = null }
  }

  const generate = () => runGenerate(false)
  const generateForced = () => runGenerate(true)

  const download = async () => {
    if (!output || downloading) return
    setDownloading(true)
    try {
      const label = TABS.find(t => t.id === activeTab)?.label || 'output'
      const filename = label.replace(/\s+/g, '_')
      const res = await fetch('/api/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: output, filename }) })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.docx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Download failed. Try copying instead.') }
    finally { setDownloading(false) }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5EFF1', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {showContact && <ContactModal onClose={() => setShowContact(false)} />}

      {/* Header */}
      <header style={{ background: '#FFF', borderBottom: '1px solid #E8DDE0', padding: '0 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Image src="/tcg-icon.png" alt="The Cache Group" width={40} height={40} style={{ objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#932B46' }}>The Cache Group</div>
              <div style={{ fontSize: '11px', color: '#9E8A8E', letterSpacing: '0.05em' }}>CV Suite — Free Tools</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <a href={TEACHABLE_URL} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '13px', fontWeight: 600, color: '#FFF', background: '#932B46', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer', textDecoration: 'none' }}>
              Enrol in Course
            </a>
            <button onClick={() => setShowContact(true)}
              style={{ fontSize: '13px', fontWeight: 600, color: '#932B46', background: 'transparent', border: '1.5px solid #932B46', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer' }}>
              Contact Us
            </button>
          </div>
        </div>
      </header>

      {/* Privacy banner */}
      <div style={{ background: '#2D1F22', padding: '14px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>🔒</span>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFF', margin: 0, textAlign: 'center' }}>
            Your CV is never stored or saved. All content downloads directly to your device. We keep only your email address.
          </p>
        </div>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 24px' }}>

        {checkingAccess ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9E8A8E', fontSize: '14px' }}>Loading…</div>
        ) : !email ? (
          <EmailGate onAccess={(addr, rem, allow, reset) => { setEmail(addr); setRemaining(rem); setAllowance(allow); setResetDate(reset) }} />
        ) : (
        <>

        {/* Usage counter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#FFF', border: '1px solid #E8DDE0', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: '#6B5B5F' }}>
            Signed in as <strong style={{ color: '#4A3B3F' }}>{email}</strong>
          </span>
          {remaining !== null && allowance !== null && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: remaining === 0 ? '#932B46' : remaining <= 3 ? '#B4573F' : '#4A3B3F' }}>
              {remaining === 0
                ? `No generations left this month${resetDate ? ` — resets ${resetDate}` : ''}`
                : `${remaining} of ${allowance} generations remaining this month`}
            </span>
          )}
        </div>

        {/* Out of uses */}
        {remaining === 0 && (
          <div style={{ background: '#FFF', border: '1.5px solid #932B46', borderRadius: '10px', padding: '20px 22px', marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#932B46', margin: '0 0 8px 0' }}>
              You have used all your generations for this month.
            </p>
            <p style={{ fontSize: '13px', color: '#6B5B5F', lineHeight: 1.6, margin: '0 0 14px 0' }}>
              Your allowance resets{resetDate ? ` on ${resetDate}` : ' on the 1st of next month'}. If
              you need more before then, email us and we will top you up. If you want the full
              toolkit — master CV, 90-second introductions and the deep interview preparation pack —
              ask us about the course at the same time.
            </p>
            <a href={`mailto:${ENQUIRIES_EMAIL}?subject=${encodeURIComponent('CV Suite — more free uses')}&body=${encodeURIComponent(`Hello,\n\nCould I please have more free uses on the CV Suite tools?\n\nMy email address is: ${email}\n\nThank you.`)}`}
              style={{ display: 'inline-block', padding: '10px 20px', background: '#932B46', color: '#FFF', borderRadius: '7px', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
              Email {ENQUIRIES_EMAIL}
            </a>
          </div>
        )}

        {/* Active tabs */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9E8A8E', marginBottom: '8px' }}>Free Tools</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => switchTab(tab.id)}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === tab.id ? 700 : 500, background: activeTab === tab.id ? '#932B46' : '#FFF', color: activeTab === tab.id ? '#FFF' : '#6B5B5F', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(147,43,70,0.25)' : '0 1px 3px rgba(0,0,0,0.08)', transition: 'all 0.15s' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Locked tabs */}
        <div style={{ marginBottom: '24px', marginTop: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9E8A8E', marginBottom: '8px' }}>Full Suite</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {LOCKED_TABS.map(tab => (
              <button key={tab.label} onClick={() => setShowContact(true)}
                title={tab.desc}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1.5px dashed #D4C5C9', cursor: 'pointer', fontSize: '14px', fontWeight: 500, background: '#FFF', color: '#C4B0B4', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.8 }}>
                <span style={{ fontSize: '12px' }}>🔒</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '14px', color: '#6B5B5F', marginBottom: '20px' }}>{TABS.find(t => t.id === activeTab)?.desc}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

          {/* Input panel */}
          <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#932B46', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 20px 0' }}>Inputs</h2>

            <DragArea id="cv" label="Your CV *" value={cv} onChange={setCv} onClear={() => setCv('')} placeholder="Paste your CV here, or drag and drop a file…" rows={10} />
            <DragArea id="jd" label="Job Advertisement *" value={jd} onChange={setJd} onClear={() => setJd('')} placeholder="Paste the full job advertisement or position description here…" rows={6} />

            {activeTab === 'coverLetter' && (
              <>
                <TextField id="company" label="Company Name" value={company} onChange={setCompany} onClear={() => setCompany('')} placeholder="e.g. Accenture" />
                <TextField id="role" label="Role Title" value={role} onChange={setRole} onClear={() => setRole('')} placeholder="e.g. Senior Business Analyst" />
              </>
            )}

            {activeTab === 'interviewPrep' && (
              <TextField id="company" label="Company Name (optional)" value={company} onChange={setCompany} onClear={() => setCompany('')} placeholder="If you know who the interview is with, e.g. Deloitte" />
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: '#FDF0F2', border: '1px solid #F5C5CE', borderRadius: '8px', fontSize: '13px', color: '#932B46', marginBottom: '16px' }}>{error}</div>
            )}

            <button onClick={generate} disabled={loading || remaining === 0}
              style={{ width: '100%', padding: '13px', background: (loading || remaining === 0) ? '#C47A8E' : '#932B46', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: (loading || remaining === 0) ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
              {loading ? 'Generating…' : remaining === 0 ? 'No free generations left' : 'Generate'}
            </button>

            {remaining !== null && remaining > 0 && !loading && (
              <p style={{ fontSize: '12px', color: '#9E8A8E', textAlign: 'center', margin: '10px 0 0 0' }}>
                This will use 1 of your {remaining} remaining generations.
              </p>
            )}
          </div>

          {/* Output panel */}
          <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#932B46', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Output</h2>
              {output && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={copy} style={{ fontSize: '12px', color: copied ? '#932B46' : '#6B5B5F', background: 'none', border: '1px solid #E8DDE0', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={download} disabled={downloading} style={{ fontSize: '12px', color: '#FFF', background: downloading ? '#C47A8E' : '#932B46', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: downloading ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                    {downloading ? 'Preparing…' : 'Download .docx'}
                  </button>
                </div>
              )}
            </div>

            {!output && !loading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4B0B4', fontSize: '14px', textAlign: 'center' }}>
                Fill in the inputs and click Generate
              </div>
            )}
            {loading && !output && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9E8A8E', fontSize: '14px' }}>Generating…</div>
            )}
            {output && wasTruncated && (
              <div style={{ padding: '12px 16px', background: '#FFF6E8', border: '1px solid #E8C89A', borderRadius: '8px', fontSize: '13px', color: '#8A5A1F', marginBottom: '14px', lineHeight: 1.6 }}>
                <strong>This output was cut short.</strong> It stopped before the document was
                finished, so please do not use it as it stands. This one has <strong>not</strong> been
                counted against your free generations — press Generate again, and if it keeps
                happening, shorten your CV or the job ad slightly.
              </div>
            )}
            {output && (
              <div style={{ flex: 1, fontSize: '13px', color: '#1A1A1A', overflowY: 'auto', maxHeight: '700px' }}>
                {renderOutput(output)}
                {isFitWarning && (
                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E0E0E0' }}>
                    <p style={{ fontSize: '13px', color: '#6B5B5F', marginBottom: '10px' }}>
                      If you&apos;d still like to apply, we can generate a tailored CV anyway.
                    </p>
                    <button onClick={generateForced} disabled={loading}
                      style={{ padding: '10px 20px', background: '#FFF', color: '#932B46', border: '1.5px solid #932B46', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                      Generate Anyway
                    </button>
                  </div>
                )}
                {/* Upgrade teaser — shows after any successful output */}
                {!isFitWarning && <UpgradeTeaser tool={activeTab} onUpgrade={() => setShowContact(true)} />}
              </div>
            )}
          </div>
        </div>

        </>
        )}

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#B09CA0', marginTop: '32px' }}>
          © {new Date().getFullYear()} The Cache Group
        </p>
      </main>
    </div>
  )
}
