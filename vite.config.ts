import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// Which build a page is running, shown under the feed, so a stale page is easy to spot.
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()
// When it was built: the month and year only, in the site's own time zone.
const builtAt = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Chicago' })
// The commits of the packages installed from GitHub, as the lockfile names them (shown with the build).
const pinned = (name: string): string | null => {
  try {
    const lock = JSON.parse(readFileSync(resolve(__dirname, 'package-lock.json'), 'utf8'))
    return /[#/]([0-9a-f]{7})[0-9a-f]*$/.exec(lock.packages?.[`node_modules/${name}`]?.resolved ?? '')?.[1] ?? null
  } catch { return null }
}
const build = `${commit} (PeerPigeon ${pinned('peerpigeon') ?? '?'}, freertc ${pinned('freertc') ?? '?'}), ${builtAt}`

export default defineConfig({
  plugins: [vue(), {
    // version.json names the build; open pages compare it with their own and
    // reload when a newer one is out (src/main.ts).
    name: 'build-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
    },
  }],
  define: { __BUILD__: JSON.stringify(build) },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  server: { port: 5174, host: true },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: { output: { manualChunks: { 'vue-core': ['vue'] } } },
  },
})
