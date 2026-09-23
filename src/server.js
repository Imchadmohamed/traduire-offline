#!/usr/bin/env node
// A tiny local web app: open http://localhost:3210 and translate.
// The server only listens on 127.0.0.1, and all translation runs in this
// process through the QVAC SDK. Nothing is sent to any cloud service.

import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { close } from '@qvac/sdk'
import { DIRECTIONS, warmUp, translateStream, guessDirection, shutdown } from './translator.js'

const PORT = Number(process.env.PORT) || 3210
const HOST = '127.0.0.1'
const MAX_CHARS = 5000
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

let status = { ready: false, message: 'Loading translation models…' }
const log = (msg) => { status.message = msg; console.log(`▸ ${msg}`) }

function readBody (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_CHARS * 4) { reject(new Error('Text too long')); req.destroy() }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function handleTranslate (req, res) {
  let body
  try { body = JSON.parse(await readBody(req)) } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Send JSON: { "text": "...", "direction": "auto" | "fr-en" | "en-fr" }' }))
  }
  const text = String(body.text || '').trim().slice(0, MAX_CHARS)
  if (!text) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Nothing to translate' }))
  }
  const direction = DIRECTIONS[body.direction] ? body.direction : guessDirection(text)

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Direction': direction
  })
  const started = Date.now()
  try {
    for await (const token of translateStream(text, direction)) res.write(token)
    console.log(`▸ ${DIRECTIONS[direction].label}: ${text.length} chars in ${Date.now() - started} ms`)
  } catch (err) {
    console.error('✖ translation failed:', err)
    res.write(`\n[error: ${err.message || err}]`)
  }
  res.end()
}

async function serveStatic (req, res) {
  const url = new URL(req.url, `http://${HOST}`)
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const full = path.join(PUBLIC_DIR, path.normalize(file))
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end() }
  try {
    const content = await fs.readFile(full)
    const type = full.endsWith('.html') ? 'text/html; charset=utf-8'
      : full.endsWith('.css') ? 'text/css; charset=utf-8'
        : full.endsWith('.js') ? 'text/javascript; charset=utf-8'
          : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(content)
  } catch {
    res.writeHead(404); res.end('Not found')
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/translate') return handleTranslate(req, res)
  if (req.method === 'GET' && req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(status))
  }
  if (req.method === 'GET') return serveStatic(req, res)
  res.writeHead(405); res.end()
})

server.listen(PORT, HOST, () => {
  console.log(`\n  Traduire Offline is running → http://localhost:${PORT}\n`)
  console.log('  First start downloads two small models (~75 MB total). After that it works offline.\n')
})

async function startModels (attempt = 1) {
  try {
    log(attempt === 1 ? 'Starting the QVAC worker (the first start can take a minute)…' : `Retrying (attempt ${attempt} of 3)…`)
    await warmUp(log)
    status = { ready: true, message: 'Models loaded. Translation runs 100% on this device.' }
    log(status.message)
  } catch (err) {
    console.error('✖', err?.message || err)
    const c = err?.cause
    if (c) console.error('  cause:', c.message || c, '| exitCode:', c.exitCode, '| signal:', c.exitSignal, '| stderr:', c.stderrTail || '(empty)')
    if (attempt < 3) {
      setTimeout(() => startModels(attempt + 1), 5000)
    } else {
      status = { ready: false, message: `Could not load models: ${err.message || err}` }
    }
  }
}
startModels()

async function stop () {
  console.log('\n▸ Shutting down…')
  server.close()
  await shutdown()
  await close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
