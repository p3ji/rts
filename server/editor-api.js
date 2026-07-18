import http from 'http'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

const UNITS_PATH = path.join(rootDir, 'src', 'units.json')
const BUILDINGS_PATH = path.join(rootDir, 'src', 'buildings.json')
const DIFFICULTY_PATH = path.join(rootDir, 'src', 'difficulty.json')

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/data') {
    try {
      const units = JSON.parse(fs.readFileSync(UNITS_PATH, 'utf-8'))
      const buildings = JSON.parse(fs.readFileSync(BUILDINGS_PATH, 'utf-8'))
      const difficulty = JSON.parse(fs.readFileSync(DIFFICULTY_PATH, 'utf-8'))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ units, buildings, difficulty }))
    } catch (e) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: e.message }))
    }
  } else if (req.method === 'POST' && req.url === '/data') {
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const { units, buildings, difficulty } = JSON.parse(body)
        
        // Read old data to compute diff
        const oldUnits = JSON.parse(fs.readFileSync(UNITS_PATH, 'utf-8'))
        const oldBuildings = JSON.parse(fs.readFileSync(BUILDINGS_PATH, 'utf-8'))
        const oldDifficulty = JSON.parse(fs.readFileSync(DIFFICULTY_PATH, 'utf-8'))
        const changes = []

        const compare = (oldObj, newObj, category) => {
          for (const key in newObj) {
            for (const prop in newObj[key]) {
              if (typeof newObj[key][prop] !== 'object' && oldObj[key] && oldObj[key][prop] !== newObj[key][prop]) {
                changes.push(`${category} [${key}] ${prop}: ${oldObj[key][prop]} -> ${newObj[key][prop]}`)
              }
            }
          }
        }
        compare(oldUnits, units, 'Unit')
        compare(oldBuildings, buildings, 'Building')
        compare(oldDifficulty, difficulty, 'Difficulty')

        fs.writeFileSync(UNITS_PATH, JSON.stringify(units, null, 2))
        fs.writeFileSync(BUILDINGS_PATH, JSON.stringify(buildings, null, 2))
        fs.writeFileSync(DIFFICULTY_PATH, JSON.stringify(difficulty, null, 2))
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, changes }))
      } catch (e) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  } else if (req.method === 'POST' && req.url === '/push') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    exec('git add src/units.json src/buildings.json src/difficulty.json src/data.js && git commit -m "chore: Update game data via Editor" && git push origin main', { cwd: rootDir }, (err, stdout, stderr) => {
      if (err) {
        res.end(JSON.stringify({ success: false, error: err.message, stderr }))
      } else {
        res.end(JSON.stringify({ success: true, output: stdout }))
      }
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(3001, () => {
  console.log('Editor API listening on http://localhost:3001')
})
