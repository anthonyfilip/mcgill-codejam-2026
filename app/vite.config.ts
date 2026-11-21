import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Dev-only: serve ../Chug_Examples (gitignored test clips) at /clips/ so the lab page
// can load them. Never included in a production build.
const CLIPS_DIR = path.resolve(import.meta.dirname, '../Chug_Examples')
const LABELS_FILE = path.join(CLIPS_DIR, 'labels.csv')
const EDITABLE_FIELDS = new Set(['start_s', 'end_s', 'people_in_frame', 'contestant', 'notes'])

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

const toCsvLine = (cells: string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')

/** Update one cell of labels.csv for a clip (adds a row if the clip is missing). */
function saveLabel(clip: string, field: string, value: string) {
  const text = fs.readFileSync(LABELS_FILE, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = parseCsvLine(lines[0])
  const col = header.indexOf(field)
  if (col < 0) throw new Error(`labels.csv has no "${field}" column`)
  const rows = lines.slice(1).map(parseCsvLine)
  let row = rows.find((r) => r[0] === clip)
  if (!row) {
    row = header.map((h) => (h === 'clip' ? clip : ''))
    rows.push(row)
  }
  while (row.length < header.length) row.push('')
  row[col] = value
  fs.writeFileSync(LABELS_FILE, '﻿' + [header, ...rows].map(toCsvLine).join('\r\n') + '\r\n', 'utf8')
}

function serveClips(): Plugin {
  return {
    name: 'serve-chug-examples',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/clips', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\//, ''))
        if (name === 'labels' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => (body += chunk))
          req.on('end', () => {
            try {
              const { clip, field, value } = JSON.parse(body) as { clip: string; field: string; value: string }
              if (!EDITABLE_FIELDS.has(field)) throw new Error(`can't edit "${field}"`)
              saveLabel(clip, field, String(value))
              res.end('ok')
            } catch (e) {
              res.statusCode = 400
              // EBUSY/EPERM usually means labels.csv is open in Excel.
              res.end(String(e))
            }
          })
          return
        }
        if (name === '' || name === 'index.json') {
          const files = fs.existsSync(CLIPS_DIR)
            ? fs.readdirSync(CLIPS_DIR).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).sort()
            : []
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(files))
          return
        }
        const file = path.join(CLIPS_DIR, name)
        if (!file.startsWith(CLIPS_DIR + path.sep) || !fs.existsSync(file)) return next()

        const size = fs.statSync(file).size
        const type = name.endsWith('.csv') ? 'text/csv' : 'video/mp4'
        const range = req.headers.range
        if (range) {
          const [startStr, endStr] = range.replace('bytes=', '').split('-')
          const start = Number(startStr)
          const end = endStr ? Number(endStr) : size - 1
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': type,
          })
          fs.createReadStream(file, { start, end }).pipe(res)
        } else {
          res.writeHead(200, { 'Content-Length': size, 'Content-Type': type, 'Accept-Ranges': 'bytes' })
          fs.createReadStream(file).pipe(res)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveClips()],
  build: {
    rollupOptions: {
      // Two pages: the live tracker (index.html, Lana's) and the detection lab (lab.html).
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        lab: path.resolve(import.meta.dirname, 'lab.html'),
      },
    },
  },
})
