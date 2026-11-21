import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Dev-only: serve ../Chug_Examples (gitignored test clips) at /clips/ so the lab page
// can load them. Never included in a production build.
const CLIPS_DIR = path.resolve(import.meta.dirname, '../Chug_Examples')

function serveClips(): Plugin {
  return {
    name: 'serve-chug-examples',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/clips', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\//, ''))
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
})
