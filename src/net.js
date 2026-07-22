// Thin WebSocket client for the relay in server/relay.js. Knows nothing about
// game rules — it only carries {tick, cmds} batches and the initial seed/slot
// handshake. See sim.js issue()/scheduleAt() for how batches turn into commands.

export function defaultRelayUrl() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.')) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.hostname}:8787`
  }
  return 'wss://rtswobble.onrender.com'
}

export class NetClient {
  constructor(url) {
    this.url = url
    this.ws = null
    this.onMessage = null // (msg) => void, set by caller
    this.onClose = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      let ws
      try { ws = new WebSocket(this.url) } catch (e) { reject(e); return }
      this.ws = ws
      const onOpenError = () => reject(new Error('Could not reach relay at ' + this.url))
      ws.addEventListener('open', () => { ws.removeEventListener('error', onOpenError); resolve() }, { once: true })
      ws.addEventListener('error', onOpenError, { once: true })
      ws.addEventListener('message', (ev) => {
        let msg
        try { msg = JSON.parse(ev.data) } catch { return }
        this.onMessage?.(msg)
      })
      ws.addEventListener('close', () => this.onClose?.())
    })
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  host(mapSettings, aiCount) { this.send({ type: 'host', mapSettings, aiCount }) }
  join(code) { this.send({ type: 'join', code }) }
  startMatch() { this.send({ type: 'start_match' }) }
  sendCommand(tick, cmds) { this.send({ type: 'cmd', tick, cmds }) }
  sendChecksum(tick, hash) { this.send({ type: 'checksum', tick, hash }) }
  // Self-healing resync: a drifted client asks the host (slot 0) for its full
  // game state; the host answers with a snapshot addressed to that one slot.
  requestState() { this.send({ type: 'state_req' }) }
  sendState(to, snap) { this.send({ type: 'state', to, snap }) }

  close() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null }
  }
}
