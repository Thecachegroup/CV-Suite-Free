import { NextRequest, NextResponse } from 'next/server'
import { Document, Paragraph, TextRun, Packer, BorderStyle, IRunOptions } from 'docx'

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true } as IRunOptions))
    } else if (part) {
      runs.push(new TextRun({ text: part } as IRunOptions))
    }
  }
  return runs.length ? runs : [new TextRun({ text: '' } as IRunOptions)]
}

export async function POST(req: NextRequest) {
  try {
    const { text, filename } = await req.json()
    const lines: string[] = text.split('\n')
    const children: Paragraph[] = []

    for (const line of lines) {
      if (line.startsWith('# ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace(/^# /, ''), bold: true, size: 32, font: 'Calibri' } as IRunOptions)],
          spacing: { after: 120 },
        }))
      } else if (line.startsWith('## ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace(/^## /, ''), bold: true, size: 26, color: '932B46', font: 'Calibri' } as IRunOptions)],
          spacing: { before: 240, after: 80 },
        }))
      } else if (line.startsWith('### ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace(/^### /, ''), bold: true, size: 24, font: 'Calibri' } as IRunOptions)],
          spacing: { before: 160, after: 60 },
        }))
      } else if (line.trim() === '---') {
        children.push(new Paragraph({
          border: { bottom: { color: 'D4C5C9', style: BorderStyle.SINGLE, size: 6 } },
          spacing: { after: 120 },
          children: [],
        }))
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        children.push(new Paragraph({
          children: parseInline(line.replace(/^[-*] /, '')),
          bullet: { level: 0 },
          spacing: { after: 60 },
        }))
      } else if (line.trim() === '') {
        children.push(new Paragraph({ children: [new TextRun({ text: '' } as IRunOptions)], spacing: { after: 80 } }))
      } else {
        children.push(new Paragraph({
          children: parseInline(line),
          spacing: { after: 60 },
        }))
      }
    }

    const doc = new Document({
      sections: [{ children }],
    })

    const buffer = await Packer.toBuffer(doc)
    const uint8Array = new Uint8Array(buffer)

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}.docx"`,
      },
    })
  } catch (err) {
    console.error('Docx error:', err)
    return NextResponse.json({ error: 'Failed to generate document' }, { status: 500 })
  }
}
