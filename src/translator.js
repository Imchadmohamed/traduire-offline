// The only file that talks to QVAC.
//
// Two small Bergamot models from the QVAC registry do the work, one per
// direction: BERGAMOT_FR_EN (French -> English) and BERGAMOT_EN_FR
// (English -> French). Each is about 37 MB with its vocabulary and lexical
// shortlist. The SDK downloads them the first time and caches them, so from the
// second run on the app works with the network unplugged.

import {
  loadModel,
  translate,
  unloadModel,
  BERGAMOT_FR_EN,
  BERGAMOT_EN_FR
} from '@qvac/sdk'

// The SDK starts a background worker on first use and waits 30 s for it by
// default. On a first run Windows Defender scans the worker's native binaries,
// which can take longer than that, so allow up to 5 minutes unless the user
// already set their own value. The SDK reads this when the worker starts.
if (!process.env.QVAC_RPC_INIT_TIMEOUT_MS) process.env.QVAC_RPC_INIT_TIMEOUT_MS = '300000'

export const DIRECTIONS = {
  'fr-en': { from: 'fr', to: 'en', label: 'French → English', src: BERGAMOT_FR_EN },
  'en-fr': { from: 'en', to: 'fr', label: 'English → French', src: BERGAMOT_EN_FR }
}

// Generation settings taken from the QVAC Bergamot example.
const BERGAMOT_SETTINGS = {
  beamsize: 1,
  normalize: 1,
  temperature: 0.2,
  norepeatngramsize: 3,
  lengthpenalty: 1.2
}

const loaded = new Map() // direction -> Promise<modelId>

/**
 * Load the model for one direction (once). Later calls reuse the same model.
 * @param {'fr-en'|'en-fr'} direction
 * @param {(line: string) => void} [log] progress messages
 */
export function ensureModel (direction, log = () => {}) {
  const d = DIRECTIONS[direction]
  if (!d) throw new Error(`Unknown direction "${direction}". Use fr-en or en-fr.`)
  if (!loaded.has(direction)) {
    const p = loadModel({
      modelSrc: d.src,
      modelConfig: { engine: 'Bergamot', from: d.from, to: d.to, ...BERGAMOT_SETTINGS },
      onProgress: (prog) => {
        if (typeof prog?.percentage === 'number') {
          log(`${d.label}: downloading model ${prog.percentage.toFixed(0)}%`)
        }
      }
    }).then((modelId) => {
      log(`${d.label}: model ready`)
      return modelId
    })
    p.catch(() => loaded.delete(direction)) // allow a retry after a failed load
    loaded.set(direction, p)
  }
  return loaded.get(direction)
}

/** Load both directions up front so the first translation is instant. */
export async function warmUp (log) {
  await Promise.all(Object.keys(DIRECTIONS).map((dir) => ensureModel(dir, log)))
}

/**
 * Translate text on-device and stream the result piece by piece.
 * @param {string} text
 * @param {'fr-en'|'en-fr'} direction
 * @returns {AsyncGenerator<string>}
 */
export async function * translateStream (text, direction) {
  const modelId = await ensureModel(direction)
  // French typography puts a space before ! ? ; : ("Bonjour !"). The Bergamot
  // FR->EN model splits on that space and repeats the sentence ("Hello! Hello!"),
  // so drop it (normal, no-break and narrow no-break spaces) before translating.
  if (direction === 'fr-en') text = String(text).replace(/[   ]+([!?;:])/g, '$1')
  const run = translate({
    modelId,
    text,
    modelType: 'nmtcpp-translation',
    stream: true
  })
  for await (const token of run.tokenStream) yield token
}

/** Translate and return the whole result at once. */
export async function translateText (text, direction) {
  let out = ''
  for await (const token of translateStream(text, direction)) out += token
  return out.trim()
}

// A cheap guess at the input language, so the user does not have to pick.
// Looks at accents and very common short words; good enough for a sentence or more.
const FR_WORDS = new Set(['le', 'la', 'les', 'des', 'du', 'une', 'est', 'et', 'je', 'tu', 'il', 'elle',
  'nous', 'vous', 'ils', 'pas', 'que', 'qui', 'pour', 'dans', 'avec', 'sur', 'mais', 'bonjour',
  'merci', 'oui', 'très', 'suis', 'avez', 'avons', 'ce', 'cette', 'mon', 'ma', 'mes', 'au', 'aux'])
const EN_WORDS = new Set(['the', 'and', 'is', 'are', 'you', 'i', 'he', 'she', 'we', 'they', 'not',
  'that', 'what', 'for', 'with', 'on', 'but', 'hello', 'thanks', 'yes', 'very', 'am', 'have',
  'has', 'this', 'my', 'your', 'of', 'to', 'in', 'it', 'was', 'will', 'can'])

export function guessDirection (text) {
  const words = String(text).toLowerCase().match(/[a-zàâäçéèêëîïôöùûüÿœ']+/g) || []
  let fr = (String(text).match(/[àâçéèêëîïôùûüœ]/gi) || []).length
  let en = 0
  for (const w of words) {
    if (FR_WORDS.has(w) || /^(l|d|j|qu|n|c|s)'/.test(w)) fr++
    if (EN_WORDS.has(w)) en++
  }
  return fr > en ? 'fr-en' : 'en-fr'
}

/** Free the models when the app closes. Files stay cached on disk. */
export async function shutdown () {
  const ids = await Promise.allSettled([...loaded.values()])
  loaded.clear()
  await Promise.allSettled(
    ids.filter((r) => r.status === 'fulfilled').map((r) => unloadModel({ modelId: r.value, clearStorage: false }))
  )
}
