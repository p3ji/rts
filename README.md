# Fur & Fury: Tides of Clutter

A competitive RTS prototype where viral internet animals wage war. Three asymmetric
factions modeled on StarCraft 2 archetypes — see [DESIGN.md](DESIGN.md) for the full
design document.

- **Great Rodent Republic** (capybaras) — durable mechanical units, worker Repair
- **Trash Pandas** (raccoons) — cheap fast swarm, frenzy auras
- **Celestial Pallas** (Pallas's cats) — expensive shielded elites, Pylon power matrix

## Play

```bash
npm install
npm run dev     # http://localhost:5173
```

Pick a faction; a random enemy faction AI plays against you.
**Win by destroying the enemy town hall.**

## Controls

| Input | Action |
|---|---|
| Left-click / drag | Select units (box-select prefers combat units) |
| Right-click | Context command: move / attack / gather / repair / rally |
| A + left-click | Attack-move |
| Build buttons | Enter placement mode, click ground to place (right-click cancels) |
| Mouse edge / arrows / middle-drag | Pan camera |
| Wheel | Zoom |
| Space | Jump to your town hall |
| Esc | Cancel placement |

## Implemented in this prototype

- Two-resource economy: Shinies (crystal nodes) + Zest (geysers, require extractor)
- Full 5×5 rosters for all three factions (stats in `src/data.js`, from DESIGN.md)
- Tech gating (Tier 2/3 units require the faction tech structure)
- Pallas Power Matrix: non-pylon structures must be placed and powered within pylon radius
- Support auras: Spa Guardian heal · Garbologist frenzy · Grand Seer shield-restore
- Floof Shields with out-of-combat regeneration, splash damage, Tangle slow
- Worker economy with auto-gather, construction, Republic worker Repair
- Scripted AI opponent: economy build-out, tech, army production, escalating attack waves
- Minimap with camera control, HUD with portraits from the concept art

Deliberately out of scope (see DESIGN.md for the full design): Clutter creep spread,
Hot Spring pods, warp-in mechanics, cloak/detection, upgrades, fog of war.

## Stack

Three.js + Vite, no other runtime dependencies. Concept art in `exampleassets/`
is served as static assets and used for UI portraits.
