# Traduire Offline

An offline French ⇄ English translator that runs entirely on your own computer.

It uses the [QVAC SDK](https://github.com/tetherto/qvac) by Tether to run two small Bergamot neural translation models locally: `BERGAMOT_FR_EN` for French → English and `BERGAMOT_EN_FR` for English → French. There is no API key, no usage bill and no server to call. Your text never leaves your machine.

- **Web app**: a clean two-pane translator at `http://localhost:3210`
- **Terminal app**: an interactive prompt or one-shot command
- **Auto-detects** whether you typed French or English
- **Streams** the translation as it is produced
- **Works offline** after the first run: the SDK downloads the models once (about 75 MB total) and caches them

## Requirements

- Node.js **22.17 or newer** ([download](https://nodejs.org))
- Windows 10+ (x64), macOS or Linux. On Windows, QVAC needs a Vulkan 1.4 runtime, which comes with an up-to-date GPU driver.
- QVAC SDK version used: **@qvac/sdk 0.20.0**

## Install

```bash
git clone https://github.com/Imchadmohamed/traduire-offline.git
cd traduire-offline
npm install
```

## Run

**Web app**

```bash
npm start
```

Open http://localhost:3210, type or paste text, and press **Translate** (or Ctrl+Enter). The first start downloads the two models. After that you can unplug the network and it still works.

**Terminal**

```bash
npm run cli                                   # interactive mode
npm run cli -- "Bonjour, comment allez-vous ?"   # one-shot, language detected
npm run cli -- --to fr "See you tomorrow"      # force the target language
```

In interactive mode, `/fr` and `/en` set the target language, `/auto` goes back to detection, and `/quit` exits.

## How it works

`src/translator.js` is the only file that talks to QVAC:

1. `loadModel()` loads a Bergamot model from the QVAC registry with `modelConfig: { engine: 'Bergamot', from, to }`. It downloads the model the first time and caches it.
2. `translate()` runs the model on-device with `modelType: 'nmtcpp-translation'` and `stream: true`. The app forwards each token to the browser or terminal as it arrives.
3. `unloadModel()` and `close()` free memory on exit. The model files stay cached.

`qvac/worker.entry.mjs` is a custom QVAC worker entry (the same shape `npx qvac bundle sdk` generates) that registers only the Bergamot translation plugin, so the app starts faster and does not load unused plugins.

`src/server.js` is a small `node:http` server bound to `127.0.0.1` that serves the page in `public/` and streams translations. `src/cli.js` is the terminal version.

## Project layout

```
src/translator.js   QVAC calls: loadModel, translate, unloadModel
src/server.js       local web server (npm start)
src/cli.js          terminal app (npm run cli)
qvac/worker.entry.mjs  QVAC worker that loads only the translation plugin
public/             the web page
```

## Limits

- Bergamot models translate sentence by sentence. They are fast and small, but less fluent than large language models on idioms and slang.
- Input is capped at 5,000 characters per request.
- Language detection is a simple word and accent heuristic. Pick the direction by hand for very short inputs.

## License

MIT. See [LICENSE](LICENSE).
