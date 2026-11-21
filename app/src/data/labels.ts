// Ground truth from Chug_Examples/labels.csv (served by the dev server at /clips/labels.csv).

export interface ClipLabel {
  clip: string
  start_s: number | null
  end_s: number | null
  people_in_frame: string
  contestant: string
  notes: string
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

const num = (s: string | undefined) => {
  const n = Number.parseFloat(s ?? '')
  return Number.isFinite(n) ? n : null
}

export async function loadLabels(): Promise<Map<string, ClipLabel>> {
  const res = await fetch('/clips/labels.csv')
  if (!res.ok) return new Map()
  const text = (await res.text()).replace(/^﻿/, '')
  const [header, ...lines] = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const cols = parseCsvLine(header)
  const map = new Map<string, ClipLabel>()
  for (const line of lines) {
    const cells = parseCsvLine(line)
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']))
    map.set(row.clip, {
      clip: row.clip,
      start_s: num(row.start_s),
      end_s: num(row.end_s),
      people_in_frame: row.people_in_frame,
      contestant: row.contestant,
      notes: row.notes,
    })
  }
  return map
}
