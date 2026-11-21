/**
 * PigeonFeed on PeerPigeon (PeerPigeonNode) with freertc signaling, as PigeonChess runs it: one node for
 * the page, in the room 'pigeonfeed' / <network>. Its storage replicates everything under pf/ (the feed's
 * records, utils/records.ts) and uses the mesh's storage servers (PigeonFS) for them and for media.
 */
import { ref } from 'vue'
import { PeerPigeonNode, type PeerPigeonKeyPair, type PeerPigeonStorage } from 'peerpigeon'
import { FEED_KEYS } from '@/utils/records'
import type { BlobStore } from '@/utils/media'

export const DEFAULT_SIGNALING_URLS = ['wss://peer.ooo/ws']

/**
 * The relays to start from: ?signal=<ws url>[,<ws url>…] in the page's address (a local relay, say), else
 * the default. A local relay is ws://<its host>:8788/ws.
 */
export function signalingUrls(): string[] {
  try {
    const asked = new URLSearchParams(location.search).get('signal')
    const urls = (asked ?? '').split(',').map((u) => u.trim()).filter((u) => /^wss?:\/\//.test(u))
    if (urls.length) return urls
  } catch { /* no address: the default */ }
  return DEFAULT_SIGNALING_URLS
}

export type Keys = PeerPigeonKeyPair

const connected = ref(false)
const starting = ref(false)
const error = ref<string | null>(null)
/** Everyone else in the room right now. */
const online = ref(0)
/** The relay this page signals through, as a person reads it. */
const relay = ref('')

let node: PeerPigeonNode | null = null
let started: Promise<void> | null = null
let accountKeys: { pub: string; priv: string } | null = null
let timer: ReturnType<typeof setInterval> | null = null

const refresh = () => {
  if (!node) { online.value = 0; return }
  const self = String(node.getClientId() ?? '')
  const ids = new Set([...node.getGlobalPeers(), ...node.getConnectedPeers()].map(String))
  ids.delete(self)
  // Not people: peers a relay lists with a role (storage servers, bots).
  for (const id of [...ids]) if (node.getPeerRole(id)) ids.delete(id)
  online.value = ids.size
  relay.value = node.currentRelayName?.() ?? ''
}

/** Start the node (once) on the given relays; the first is the bootstrap, freertc then picks the room's. */
export function startMesh(network = 'global', urls: string[] = signalingUrls()): Promise<void> {
  if (started) return started
  starting.value = true
  error.value = null
  const n = new PeerPigeonNode({
    networkId: 'pigeonfeed',
    sessionId: network || 'global',
    signalingServer: urls[0],
    signalingServers: urls.slice(1),
    automaticSignalingServer: true,
    minPeers: 2,
    maxPeers: 10,
    crypto: {},
    storage: { replicate: [FEED_KEYS] },
  })
  node = n
  // For looking at a running page from the console; read-only by intent.
  ;(globalThis as Record<string, unknown>).__pigeonfeed = { node: n }
  n.on('ready', () => { connected.value = true; refresh() })
  n.on('peerConnected', () => { connected.value = true; refresh() })
  n.on('peerDisconnected', () => refresh())
  n.on('error', (err: Error) => console.warn('PeerPigeon:', err?.message ?? err))
  started = n.start().then(() => {
    // Signed in before the mesh was up: sign as the account from the start.
    if (accountKeys) n.storage?.signAs(accountKeys)
    connected.value = true
    refresh()
  }).catch((err: unknown) => {
    error.value = err instanceof Error ? err.message : String(err)
    node = null
    started = null
    throw err
  }).finally(() => { starting.value = false })
  timer ??= setInterval(refresh, 2000)
  // A tab closing tells its neighbours, so their count drops it now and not when its lease runs out.
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return
    try { (node?.mesh as unknown as { announceLeave?: () => void })?.announceLeave?.() } catch { /* best effort */ }
  })
  return started
}

/** The room's storage, once the node is running (null if it could not start). */
export async function storage(): Promise<PeerPigeonStorage | null> {
  await started?.catch(() => {})
  return node?.storage ?? null
}

/** This browser's own keys: who a person is here before (or without) signing in. */
export async function browserKeys(): Promise<Keys | null> {
  await started?.catch(() => {})
  try { return node ? { ...node.getKeyPair() } : null } catch { return null }
}

/** Sign what this page writes as an account (after signing in); null: as this browser again. */
export function signAs(keys: { pub: string; priv: string } | null): void {
  accountKeys = keys?.pub && keys?.priv ? { pub: keys.pub, priv: keys.priv } : null
  node?.storage?.signAs(accountKeys)
}

/** Media pieces on the storage servers (utils/media.ts). */
export const blobs: BlobStore = {
  async put(bytes) {
    await started?.catch(() => {})
    const link = node?.storageServers
    if (!link || !(await link.hasServers().catch(() => false))) return 0
    return link.putBlob(bytes)
  },
  async get(hash) {
    await started?.catch(() => {})
    return (await node?.storageServers?.getBlob(hash).catch(() => null)) ?? null
  },
}

/** A request to the relay this page is on (PigeonIdP accounts, kept by local relays). */
export async function relayRequest(body: Record<string, unknown>): Promise<any> {
  const mesh = node?.mesh as unknown as { relayRequest?: (b: Record<string, unknown>, o?: { timeoutMs?: number }) => Promise<unknown> } | undefined
  if (!mesh?.relayRequest) throw new Error('not on a relay')
  return mesh.relayRequest(body, { timeoutMs: 5000 })
}

/** A record everyone may read and write (account records, as copies of what the relays keep). */
export async function publicPut(key: string, value: unknown): Promise<void> {
  const s = await storage()
  if (!s) throw new Error('Storage not ready')
  await s.put('public', key, JSON.parse(JSON.stringify(value)))
}

/** waitMs: keep asking that long when nobody has answered yet (links still forming after the page opens). */
export async function publicGet(key: string, options: { waitMs?: number } = {}): Promise<any> {
  const s = await storage()
  if (!s) throw new Error('Storage not ready')
  const deadline = Date.now() + Math.max(0, Number(options.waitMs) || 0)
  for (;;) {
    const record = await s.retrieve('public', key, { timeoutMs: 3000 })
    if (record) return record.value
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

export function useMesh() {
  return { connected, starting, error, online, relay }
}
