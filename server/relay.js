// Kingdoms of Wobbleton — online relay.
// Pure message relay for 2-player lockstep matches: rooms of exactly two sockets,
// a shared map seed handed out once, then opaque {tick, cmds} batches forwarded
// verbatim between the pair. The relay never simulates or inspects game state —
// both clients run the identical deterministic sim (see src/sim.js checksum()).

import { WebSocketServer } from 'ws'

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

function makeCode() {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

const rooms = new Map() // code -> { sockets: [ws|null, ws|null] }

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function startMatch(room) {
  const seed = Math.floor(Math.random() * 2 ** 31)
  room.sockets.forEach((ws, slot) => send(ws, { type: 'start', seed, slot }))
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  ws.room = null
  ws.slot = -1

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'host') {
      let code
      do { code = makeCode() } while (rooms.has(code))
      const room = { sockets: [ws, null] }
      rooms.set(code, room)
      ws.room = code
      ws.slot = 0
      send(ws, { type: 'hosted', code })
      return
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase()
      const room = rooms.get(code)
      if (!room || room.sockets[1]) { send(ws, { type: 'error', reason: 'Room not found' }); return }
      room.sockets[1] = ws
      ws.room = code
      ws.slot = 1
      send(ws, { type: 'joined', code })
      startMatch(room)
      return
    }

    // in-match relay: forward verbatim to the other socket in the room
    if (msg.type === 'cmd' || msg.type === 'checksum') {
      const room = rooms.get(ws.room)
      if (!room) return
      const other = room.sockets[1 - ws.slot]
      if (other) send(other, { ...msg, from: ws.slot })
      return
    }
  })

  ws.on('close', () => {
    const room = rooms.get(ws.room)
    if (!room) return
    const other = room.sockets[1 - ws.slot]
    if (other) send(other, { type: 'peer_left' })
    rooms.delete(ws.room)
  })
})

console.log(`Relay listening on ws://0.0.0.0:${PORT}`)
