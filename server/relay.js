// Kingdoms of Wobbleton — online relay.
// Pure message relay for LAN-party lockstep matches: rooms of up to 4 sockets,
// a shared map seed handed out once the host starts, then opaque {tick, cmds}
// batches forwarded verbatim to every other socket in the room. The relay never
// simulates or inspects game state — every client runs the identical
// deterministic sim (see src/sim.js checksum()).

import { WebSocketServer } from 'ws'

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
const MAX_PLAYERS = 4

function makeCode() {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

const rooms = new Map() // code -> { sockets: [ws|null, ...], mapSettings, started }

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function broadcastLobby(room, code) {
  const slots = room.sockets.map((s, i) => (s ? i : null)).filter((i) => i !== null)
  for (const ws of room.sockets) if (ws) send(ws, { type: 'lobby', code, slots })
}

function startMatch(room) {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const playerCount = room.sockets.filter(Boolean).length
  room.started = true
  room.sockets.forEach((ws, slot) => {
    if (ws) send(ws, { type: 'start', seed, slot, playerCount, aiCount: room.aiCount, mapSettings: room.mapSettings })
  })
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
      const room = { sockets: [ws, ...Array(MAX_PLAYERS - 1).fill(null)], mapSettings: msg.mapSettings, aiCount: msg.aiCount || 0, started: false }
      rooms.set(code, room)
      ws.room = code
      ws.slot = 0
      send(ws, { type: 'hosted', code })
      broadcastLobby(room, code)
      return
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase()
      const room = rooms.get(code)
      if (!room || room.started) { send(ws, { type: 'error', reason: room ? 'That match already started' : 'Room not found' }); return }
      const slot = room.sockets.findIndex((s) => !s)
      if (slot === -1) { send(ws, { type: 'error', reason: 'Room is full' }); return }
      room.sockets[slot] = ws
      ws.room = code
      ws.slot = slot
      send(ws, { type: 'joined', code, slot })
      broadcastLobby(room, code)
      return
    }

    if (msg.type === 'start_match') {
      const room = rooms.get(ws.room)
      // only the host (slot 0) can start, and only once 2+ players are present
      if (!room || ws.slot !== 0 || room.started) return
      if (room.sockets.filter(Boolean).length < 2) return
      startMatch(room)
      return
    }

    // in-match relay: forward verbatim to every other socket in the room
    if (msg.type === 'cmd' || msg.type === 'checksum') {
      const room = rooms.get(ws.room)
      if (!room) return
      room.sockets.forEach((other, i) => { if (other && i !== ws.slot) send(other, { ...msg, from: ws.slot }) })
      return
    }

    // self-healing resync: a drifted client asks the host (slot 0) for a full
    // state snapshot, and the host answers exactly one target slot. Still pure
    // relay — the payload is opaque here.
    if (msg.type === 'state_req') {
      const room = rooms.get(ws.room)
      if (!room || ws.slot === 0) return
      send(room.sockets[0], { ...msg, from: ws.slot })
      return
    }
    if (msg.type === 'state') {
      const room = rooms.get(ws.room)
      if (!room || ws.slot !== 0) return
      const target = room.sockets[msg.to]
      if (target && msg.to !== 0) send(target, { ...msg, from: 0 })
      return
    }
  })

  ws.on('close', () => {
    const room = rooms.get(ws.room)
    if (!room || ws.slot < 0) return
    room.sockets[ws.slot] = null
    if (room.started) {
      // mid-match: tell survivors who left, but the match continues for them
      for (const other of room.sockets) if (other) send(other, { type: 'peer_left', slot: ws.slot })
    } else {
      broadcastLobby(room, ws.room)
    }
    if (room.sockets.every((s) => !s)) rooms.delete(ws.room)
  })
})

console.log(`Relay listening on ws://0.0.0.0:${PORT}`)
