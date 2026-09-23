#!/usr/bin/env node
// Terminal version.
//
//   npm run cli                      interactive mode
//   npm run cli -- "Bonjour tout le monde"      one-shot, language auto-detected
//   npm run cli -- --to fr "Good morning"      force the direction
//
// In interactive mode type a sentence and press Enter. Commands:
//   /fr   always translate into French
//   /en   always translate into English
//   /auto detect the language (default)
//   /quit exit

import readline from 'node:readline/promises'
import { stdin, stdout, stderr } from 'node:process'
import { close } from '@qvac/sdk'
import { DIRECTIONS, ensureModel, translateStream, guessDirection, shutdown } from './translator.js'

const args = process.argv.slice(2)
let forced = null
const toIdx = args.indexOf('--to')
if (toIdx !== -1) {
  const lang = args[toIdx + 1]
  forced = lang === 'fr' ? 'en-fr' : lang === 'en' ? 'fr-en' : null
  args.splice(toIdx, 2)
}
const log = (m) => stderr.write(`▸ ${m}\n`)

async function run (text, direction) {
  await ensureModel(direction, log)
  stdout.write(`[${DIRECTIONS[direction].label}] `)
  for await (const token of translateStream(text, direction)) stdout.write(token)
  stdout.write('\n')
}

async function finish (code = 0) {
  await shutdown()
  await close()
  process.exit(code)
}

try {
  if (args.length) {
    const text = args.join(' ')
    await run(text, forced || guessDirection(text))
    await finish(0)
  }

  console.log('Traduire Offline: French ⇄ English, on your device. Type /quit to exit.')
  const rl = readline.createInterface({ input: stdin, output: stdout })
  const prompt = () => { rl.setPrompt(forced ? `(${forced}) > ` : '(auto) > '); rl.prompt() }
  prompt()
  for await (const raw of rl) {
    const line = raw.trim()
    if (line === '/quit' || line === '/exit') break
    if (line === '/fr') forced = 'en-fr'
    else if (line === '/en') forced = 'fr-en'
    else if (line === '/auto') forced = null
    else if (line) await run(line, forced || guessDirection(line))
    prompt()
  }
  rl.close()
  await finish(0)
} catch (err) {
  console.error('✖', err)
  await finish(1)
}
