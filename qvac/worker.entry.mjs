/**
 * QVAC SDK worker entry with only the translation plugin.
 *
 * The SDK picks up `qvac/worker.entry.mjs` from the project root automatically.
 * The default worker loads every built-in plugin (LLM, OCR, TTS, diffusion…),
 * some of which need a recent Vulkan runtime on Windows even when unused.
 * This app only translates, so it registers just the Bergamot (nmtcpp)
 * plugin. It starts faster and runs on more machines.
 *
 * Same shape as the entry that `npx qvac bundle sdk` generates.
 */

import { initializeWorker, ensureRPCSetup } from '@qvac/sdk/worker-lifecycle'
import { registerPlugin } from '@qvac/sdk/plugins'
import { getServerLogger } from '@qvac/sdk/logging'
import { nmtPlugin } from '@qvac/sdk/nmtcpp-translation/plugin'

const { hasRPCConfig } = initializeWorker()

const logger = getServerLogger()
logger.info('🐻 QVAC Worker (translation only)')

registerPlugin(nmtPlugin)

if (hasRPCConfig) {
  ensureRPCSetup()
}
