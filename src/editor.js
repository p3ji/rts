const API = 'http://localhost:3001'

let currentData = { units: {}, buildings: {}, difficulty: {} }

async function init() {
  try {
    const res = await fetch(`${API}/data`)
    currentData = await res.json()
    render()
  } catch (e) {
    showToast('Failed to load data from API. Is the Editor API running?', true)
  }
}

function render() {
  const unitsTbody = document.querySelector('#units-table tbody')
  unitsTbody.innerHTML = ''
  for (const [id, u] of Object.entries(currentData.units)) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${u.name}</strong></td>
      <td><input type="number" data-type="units" data-id="${id}" data-key="hp" value="${u.hp}"></td>
      <td><input type="number" data-type="units" data-id="${id}" data-key="dmg" value="${u.dmg || 0}"></td>
      <td><input type="number" data-type="units" data-id="${id}" data-key="range" value="${u.range || 0}" step="0.1"></td>
      <td><input type="number" data-type="units" data-id="${id}" data-key="speed" value="${u.speed || 0}" step="0.1"></td>
      <td><input type="number" data-type="units" data-id="${id}" data-key="buildTime" value="${u.buildTime || 0}"></td>
    `
    unitsTbody.appendChild(tr)
  }

  const bldgsTbody = document.querySelector('#buildings-table tbody')
  bldgsTbody.innerHTML = ''
  for (const [id, b] of Object.entries(currentData.buildings)) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${b.name}</strong></td>
      <td><input type="number" data-type="buildings" data-id="${id}" data-key="hp" value="${b.hp}"></td>
      <td><input type="number" data-type="buildings" data-id="${id}" data-key="dmg" value="${b.dmg || 0}"></td>
      <td><input type="number" data-type="buildings" data-id="${id}" data-key="range" value="${b.range || 0}" step="0.1"></td>
      <td><input type="number" data-type="buildings" data-id="${id}" data-key="buildTime" value="${b.buildTime || 0}"></td>
    `
    bldgsTbody.appendChild(tr)
  }

  const diffTbody = document.querySelector('#difficulty-table tbody')
  diffTbody.innerHTML = ''
  for (const [id, d] of Object.entries(currentData.difficulty)) {
    if (id === 'globals') continue
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td><strong>${d.name}</strong></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="workers" value="${d.workers}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="armyCap" value="${d.armyCap}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="waveFirst" value="${d.waveFirst}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="waveEvery" value="${d.waveEvery}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="waveStart" value="${d.waveStart}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="waveGrow" value="${d.waveGrow}"></td>
      <td><input type="number" data-type="difficulty" data-id="${id}" data-key="incomeMul" value="${d.incomeMul}" step="0.1"></td>
    `
    diffTbody.appendChild(tr)
  }

  // Populate global inputs
  const globals = currentData.difficulty.globals || { separationFriendly: 1.75, separationHostile: 1.10 }
  const friendlyInput = document.getElementById('global-sep-friendly')
  const hostileInput = document.getElementById('global-sep-hostile')
  if (friendlyInput) friendlyInput.value = globals.separationFriendly
  if (hostileInput) hostileInput.value = globals.separationHostile

  // Attach listeners
  document.querySelectorAll('#units-table input, #buildings-table input, #difficulty-table input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const type = e.target.dataset.type
      const id = e.target.dataset.id
      const key = e.target.dataset.key
      let val = parseFloat(e.target.value)
      if (isNaN(val)) val = 0
      
      if (currentData[type][id][key] !== undefined || val !== 0) {
        currentData[type][id][key] = val
      }
    })
  })

  if (friendlyInput && hostileInput) {
    const updateGlobals = () => {
      if (!currentData.difficulty.globals) {
        currentData.difficulty.globals = { name: "Global Settings" }
      }
      let fVal = parseFloat(friendlyInput.value)
      let hVal = parseFloat(hostileInput.value)
      currentData.difficulty.globals.separationFriendly = isNaN(fVal) ? 1.75 : fVal
      currentData.difficulty.globals.separationHostile = isNaN(hVal) ? 1.10 : hVal
    }
    friendlyInput.addEventListener('change', updateGlobals)
    hostileInput.addEventListener('change', updateGlobals)
  }
}

async function saveLocally() {
  try {
    const res = await fetch(`${API}/data`, {
      method: 'POST',
      body: JSON.stringify(currentData),
      headers: { 'Content-Type': 'application/json' }
    })
    const out = await res.json()
    if (out.success) {
      if (out.changes.length > 0) {
        showToast('Saved locally! Changes:\n' + out.changes.join('\n'))
      } else {
        showToast('Saved locally! (No changes detected)')
      }
    } else {
      showToast('Error saving: ' + out.error, true)
    }
  } catch (e) {
    showToast('Failed to connect to API', true)
  }
}

async function pushToGithub() {
  document.getElementById('btn-push').innerText = 'Pushing...'
  try {
    const res = await fetch(`${API}/push`, { method: 'POST' })
    const out = await res.json()
    if (out.success) {
      showToast('Successfully merged to main on GitHub!')
    } else {
      showToast('Git error: ' + out.error + '\n' + out.stderr, true)
    }
  } catch (e) {
    showToast('Failed to connect to API', true)
  }
  document.getElementById('btn-push').innerText = 'Push to GitHub'
}

let toastTimer
function showToast(msg, isError = false) {
  const el = document.getElementById('toast')
  el.innerText = msg
  el.style.color = isError ? '#ff6a55' : '#a8e86a'
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.classList.remove('show')
  }, 4000)
}

document.getElementById('btn-save').addEventListener('click', saveLocally)
document.getElementById('btn-push').addEventListener('click', pushToGithub)

init()
