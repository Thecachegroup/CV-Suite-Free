import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (ext === 'txt') {
      const text = buffer.toString('utf-8')
      return NextResponse.json({ text })
    }

    if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return NextResponse.json({ text: result.value })
    }

    if (ext === 'pdf') {
      // pdf-parse has a known Next.js issue — import from lib path directly
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(buffer)
      return NextResponse.json({ text: data.text })
    }

    return NextResponse.json(
      { error: `Unsupported file type: .${ext}. Please use .txt, .docx, or .pdf` },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    console.error('Extract error:', message)
    return NextResponse.json({ error: 'Could not extract text from file. Try copying and pasting instead.' }, { status: 500 })
  }
}
