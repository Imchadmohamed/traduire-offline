const $ = (id) => document.getElementById(id)
const input = $('input')
const output = $('output')
const direction = $('direction')
const statusEl = $('status')
const goBtn = $('go')
const info = $('info')
const LABELS = { 'fr-en': 'French → English', 'en-fr': 'English → French' }
let busy = false

async function pollStatus () {
  try {
    const s = await (await fetch('/api/status')).json()
    statusEl.textContent = s.message
    statusEl.className = 'status ' + (s.ready ? 'ready' : 'loading')
    if (!s.ready) setTimeout(pollStatus, 1000)
  } catch {
    statusEl.textContent = 'The local server is not running. Start it with: npm start'
    setTimeout(pollStatus, 2000)
  }
}

async function run () {
  const text = input.value.trim()
  if (!text || busy) return
  busy = true
  goBtn.disabled = true
  output.textContent = ''
  info.textContent = 'Translating…'
  const started = performance.now()
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, direction: direction.value })
    })
    if (!res.ok) throw new Error((await res.json()).error || res.statusText)
    const dir = res.headers.get('X-Direction')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      output.textContent += dec.decode(value, { stream: true })
    }
    output.textContent = output.textContent.trim()
    info.textContent = `${LABELS[dir] || ''} · ${Math.round(performance.now() - started)} ms · on-device`
  } catch (err) {
    info.textContent = 'Error: ' + err.message
  } finally {
    busy = false
    goBtn.disabled = false
  }
}

goBtn.addEventListener('click', run)
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run() })
input.addEventListener('input', () => { $('count').textContent = `${input.value.length} / 5000` })
$('copy').addEventListener('click', () => navigator.clipboard.writeText(output.textContent))
$('swap').addEventListener('click', () => {
  if (!output.textContent) return
  input.value = output.textContent
  output.textContent = ''
  if (direction.value === 'fr-en') direction.value = 'en-fr'
  else if (direction.value === 'en-fr') direction.value = 'fr-en'
  input.dispatchEvent(new Event('input'))
})

pollStatus()
