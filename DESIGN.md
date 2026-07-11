# FUR & FURY: TIDES OF CLUTTER
## Competitive RTS Design Document — MVP "5x5" Framework
**Version 0.1 — Design Target: SC2-class competitive balance, pacing, and asymmetry**

---

## 0. DESIGN PILLARS

1. **Asymmetry with fairness.** Three factions that share zero units but converge on equal win-rate potential at equal skill, following the Terran/Zerg/Protoss triangle.
2. **Readable humor.** Every unit is a viral-animal archetype first, a war machine second. Comedy lives in the silhouette and animation; the numbers underneath are deadly serious.
3. **Macro is a faction identity.** Each faction's economy engine (Hot Springs / Clutter / Power Matrix) demands a distinct APM tax and rewards a distinct map-control philosophy.
4. **5x5 MVP discipline.** Exactly 5 units and 5 structures per faction. Every unit must earn its slot by covering a mandatory competitive role: Worker, T1 Core, T2 Skirmisher/AA, T2.5 Caster/Detector, T3 Powerhouse.

**Pacing targets (mirroring SC2):** first combat unit at ~1:30, first cross-map aggression window at ~3:00, tech-tier 2 online ~4:30, T3 powerhouses at ~8:00+, average competitive match length 12–18 minutes.

---

## 1. FACTION ARCHETYPES & MACRO MECHANICS

### 1.1 The Great Rodent Republic — Capybaras (*Terran archetype*)
**Fantasy:** Unbothered, moisturized, in their lane, armored. A dieselpunk republic of serene rodents who wage war from mobile hot tubs and rusted mech chassis, snacking on citrus throughout.

**Mechanical identity:**
- Durable, repairable mechanical units; positional, defensive play.
- Structures are **mobile**: they can retract onto tracked chassis and slowly relocate (the "Waddle-Lift" mechanic, analog to Terran lift-off).
- Army is cost-efficient when defending prepared positions; punished when caught mid-waddle.

**Macro mechanic — Thermal Steam Network:**
- The Town Hall and key structures generate **Steam** from Hot Spring tiles.
- Players place **Hot Spring Pods** (free, cooldown-limited, like MULE cadence) near mineral lines. Workers that path through steam gain **+20% gather rate for 15s** ("A Relaxed Worker Is a Productive Worker").
- Steam clouds also grant friendly mechanical units in them **+1 armor** — encouraging deliberate siege positions and defensive hubs.
- **APM tax:** cycling Hot Spring Pod placement every ~40s and choosing between *economic* placement (mineral line) and *military* placement (army position). This is the Republic's MULE/Scan tension.

### 1.2 The Trash Pandas — Raccoons (*Zerg archetype*)
**Fantasy:** A feral swarm of dumpster-diving anarchists in taped-together can armor. Nothing is manufactured; everything is *salvaged, chewed, and duct-taped*.

**Mechanical identity:**
- Cheapest units, fastest production, highest mobility; wins by out-expanding and out-trading.
- All units are produced from a single larva-like pool of **Grubs** at the Town Hall — production is fungible and can pivot instantly.
- Individually fragile; the swarm must fight on favorable terms or trade away.

**Macro mechanic — Clutter Spread:**
- Structures exude **Clutter**, a glistening purple trash-slime that creeps outward (creep analog).
- On Clutter: Trash Panda units gain **+30% movement speed**, and Clutter provides map vision.
- **Clutter Nodes** (free, spawned by the Garbologist caster or by Dumpster Dens) extend the network. Enemies can destroy nodes to recede it.
- **Mutation:** units standing on Clutter slowly gain the **Ripened** buff (+10% attack speed after 8 uninterrupted seconds) — rewarding fighting on your own filth and punishing engagements on clean ground.
- **APM tax:** continuous node-spreading and node-defense; the raccoon player literally paints the map purple or dies.

### 1.3 The Celestial Pallas — Pallas's Cats (*Protoss archetype*)
**Fantasy:** Ancient, judgmental, magnificently round. An order of floating cosmic monks whose permanent scowl conceals galaxy-brained warcraft. Everything shimmers, everything is expensive, everything is *displeased with you*.

**Mechanical identity:**
- Fewest, costliest, individually strongest units; every unit has a **Floof Shield** (regenerating shield layer over HP).
- Structures and units **warp in** — placed anywhere within the Power Matrix after a channel time.
- Deathball potential is real but supply-inefficient early; punished hard by losing key units.

**Macro mechanic — The Power Matrix:**
- **Whisker Pylons** (crystal obelisks) project a power field. Structures only function inside the field; units may be **warped in directly to any powered location** via the production structure's Warp mode.
- Destroying a pylon disables everything in its radius (classic Protoss vulnerability — the "pylon snipe" is a first-class counterplay pattern).
- **Overcharge:** the Town Hall can overcharge one pylon per 60s, causing it to emit a defensive beam turret for 12s (Photon Overcharge analog) — the faction's early-defense crutch.
- **APM tax:** pylon placement is simultaneously supply, tech infrastructure, and forward-warp logistics. Great Pallas players weave hidden proxy pylons; bad ones die to one dark-alley pylon snipe.

---

## 2. THE TWO-RESOURCE ECONOMY

Universal resources with faction-skinned extractors (as SC2 does with Refinery/Extractor/Assimilator):

| | **SHINIES** (Mineral analog) | **ZEST** (Vespene analog) |
|---|---|---|
| **What it is** | Glittering crystal-scrap deposits — bottle caps, foil, geode shards fused into mineable crystal clusters | Volatile glowing citrus concentrate, pressure-trapped in **Citrus Geysers** |
| **Gathered by** | All workers, no structure needed | Requires an extractor structure on the geyser; max 3 workers |
| **Gates** | Unit *quantity* — most T1 costs | Unit *quality* — tech, casters, T3, upgrades |
| **Per-base layout** | 8 crystal nodes | 2 geysers |
| **Faction extractor skins** | — | Republic: **Juicing Rig** · Pandas: **Sticky Still** · Pallas: **Zest Chalice** |

- Income curve, saturation breakpoints (16 optimal / 24 max on Shinies), and worker-pairing math mirror SC2 directly — this is deliberate, so known competitive scaffolding (2-base timings, gas-first openings) transfers.
- **Zest is universally citrus-themed** because the lore holds that all three species discovered the same forbidden fruit; the Pallas refine it into "starlight" via the Zest Chalice, but the API is identical. One resource system, three flavors, zero balance drift.

---

## 3. THE 5x5 FACTION BLUEPRINTS

> **Reading the tables:** Cost = Shinies/Zest/Supply. "S-heavy" = Shinies-heavy, "Z-heavy" = Zest-heavy. Attack targets: G = ground, A = air. All numbers are MVP baselines for simulation, tuned around a 3-minute benchmark skirmish model.

---

### 3.A THE GREAT RODENT REPUBLIC (Capybaras)

#### Units

| # | Unit | Role | Tier | Cost (S/Z/Sup) | Profile | Targets |
|---|------|------|------|-----------------|---------|---------|
| 1 | **Hydro-Greaser** | Worker | T0 | 50/0/1 | S-only | G (weak) |
| 2 | **Citrus-Slinger** | Core fighter | T1 | 50/25/1 | Balanced | G + A |
| 3 | **Melon-Mortar** | Skirmisher / siege | T2 | 100/75/2 | Z-lean | G (siege) / A (flak mode) |
| 4 | **Spa Guardian** | Caster & Detector | T2.5 | 100/150/2 | Z-heavy | None (support) |
| 5 | **Guava Goliath** | Powerhouse | T3 | 300/200/6 | Z-heavy | G + A |

1. **Hydro-Greaser** — A capybara in a rusted mini-excavator with a hot-tub cab. Gathers, builds, and can **Repair** mechanical units/structures (the Republic's sustain identity). Slightly higher HP than other workers (45 vs 40) but 10% slower build speed.
2. **Citrus-Slinger** — Quad-bike weapons platform lobbing ignited blood oranges. The Marine analog: ranged, general-purpose, shoots up and down. Ability: **Squeeze the Day** (stim analog) — +50% attack speed for 10s at the cost of 10 HP ("the capybara eats one of its own shells").
3. **Melon-Mortar** — Tracked mortar crewed by a stone-faced capybara, firing whole watermelons. Two modes (Siege Tank analog): **Lob Mode** (long-range ground siege, splash, min range) and **Flak Mode** (mobile, medium-range anti-air firing grapeshot seeds). The mode toggle is the Republic's key skill expression.
4. **Spa Guardian** — A steam-wreathed mobile hot tub. **Detector.** Energy abilities: **Steam Cloak** (allies in its steam take −25% damage from ranged attacks, Medivac-meets-Smoke), **Purifying Soak** (single-target heal-over-time for biological... and mechanical, because everything soaks), **Scald** (dispels enemy buffs in an area). No attack; positioning is everything.
5. **Guava Goliath** — Bipedal siege mech with twin gatling "seed-shredders" and a dome cockpit that is, structurally, a hot tub. Massive HP, G+A dual gatlings, ability **Guava Barrage** (channelled AoE knockback cone). Slow; pairs with Spa Guardian steam armor to anchor pushes. The Thor-class ultimatum.

#### Structures

| # | Structure | Function | Key Vulnerability |
|---|-----------|----------|-------------------|
| 1 | **The Grand Bathhouse** (Town Hall) | Worker production, drop-off; generates the base Steam field; launches Hot Spring Pods (macro cycle) | Enormous footprint; steam plume reveals its position over fog at long range |
| 2 | **Boiler Totem** (Supply) | +8 supply; extends the Thermal Steam Network as relay pipes | Destroying a Totem vents its steam: 6s of vision-blocking smoke *for both players* around its wreck |
| 3 | **Grease Garage** (Basic production) | Builds Citrus-Slingers and Melon-Mortars; can Waddle-Lift and relocate | Cannot produce while moving; a mid-waddle Garage has 0 armor |
| 4 | **The Percolator** (Tech Lab) | Unlocks T2/T3; researches Flak Mode, Squeeze the Day, +armor tiers | All Republic tech in one building — a successful snipe hard-resets their upgrade tree |
| 5 | **Squirt Turret** (Perimeter defense) | Automated pressurized-citrus turret, G+A, gains +1 armor in steam | Requires a Boiler Totem within 8 tiles to fire at full rate; kill the pipe, halve the DPS |

---

### 3.B THE TRASH PANDAS (Raccoons)

#### Units

| # | Unit | Role | Tier | Cost (S/Z/Sup) | Profile | Targets |
|---|------|------|------|-----------------|---------|---------|
| 1 | **Junkyard Salvager** | Worker | T0 | 50/0/1 | S-only | G (weak) |
| 2 | **Scavenger** | Core fighter | T1 | 25/0/0.5 | S-only | G |
| 3 | **Shopping Cart Glider** | Skirmisher / AA | T2 | 75/50/1.5 | Balanced | G + A |
| 4 | **Garbologist** | Caster & Detector | T2.5 | 100/125/2 | Z-heavy | None (support) |
| 5 | **Dumpster Titan** | Powerhouse | T3 | 250/175/5 | Z-heavy | G |

1. **Junkyard Salvager** — Raccoon dragging a chicken-wire salvage sled. Standard gather/build; uniquely, structures are **grown from buried trash caches**, so the Salvager is consumed... just kidding — it *naps inside the pile* and pops back out on completion (worker is briefly unavailable, not lost; a softened drone-morph tax).
2. **Scavenger** — Raccoon skirmisher in soda-can scale mail wielding a "Caution: Wet Floor" sign ground into a spear, broom slung on back. Zergling analog: dirt-cheap, fast (faster still on Clutter), produced in pairs. Ability (researched): **Rabies Shift** — reburrow into a Clutter tile and re-emerge at any other Clutter tile in vision (Nydus-flavored micro-teleport with 20s cooldown, per-unit).
3. **Shopping Cart Glider** — Two raccoons: one pushes the cart at reckless speed, one rides inside hurling weighted trash-bag bolas. Hits air and ground; bolas apply **Tangled** (−20% move speed, 3s). The Hydralisk-Mutalisk bridge: fast, fragile, kites beautifully on Clutter, evaporates if caught off it.
4. **Garbologist** — Elder raccoon shaman crowned with a traffic cone, swinging a censer that is a smoldering tin can. **Detector** (smells everything). Abilities: **Spawn Clutter Node** (the faction's creep-spread engine — this caster IS the macro mechanic), **Stink Cloud** (AoE: enemy ranged units inside have −4 range), **Ripen** (instantly grants one allied unit the Ripened attack-speed buff).
5. **Dumpster Titan** — A garbage truck torn open and worn as power armor by a raccoon matriarch; a walking landfill golem. Ultralisk analog: massive melee AoE swipes, **Trash Avalanche** ability (leaves a temporary Clutter trail as it charges). Ground-only — the swarm must screen its sky.

#### Structures

| # | Structure | Function | Key Vulnerability |
|---|-----------|----------|-------------------|
| 1 | **The Heap** (Town Hall) | Spawns **Grubs** (universal production larvae); workers drop off here; exudes base Clutter | All production flows through Grub cadence — losing The Heap stalls *every* unit line at once |
| 2 | **Raccoon Pile** (Supply) | +8 supply; literally a dozing pile of raccoons; must be placed ON Clutter | Recedes into the ground (supply blocked!) if its Clutter patch is destroyed |
| 3 | **Dumpster Den** (Basic production) | Doesn't build units — **unlocks** Scavenger/Glider morphs from Grubs; passively spawns 1 Clutter Node/45s | Cheap and flammable; splash damage clears Dens and their node output together |
| 4 | **The Compost Codex** (Tech Lab) | Unlocks T2.5/T3; researches Rabies Shift, Tangled bolas, carapace tiers | Must be built on mature (fully-opaque) Clutter — enemy Clutter-clearing delays your tech |
| 5 | **Bottle-Cap Ballista** (Perimeter defense) | Static G+A launcher firing jagged cap-discs; uproots and *slowly crawls* along Clutter to reposition | Nearly useless off-Clutter (−50% attack speed); clearing slime disarms the perimeter |

---

### 3.C THE CELESTIAL PALLAS (Pallas's Cats)

#### Units

| # | Unit | Role | Tier | Cost (S/Z/Sup) | Profile | Targets |
|---|------|------|------|-----------------|---------|---------|
| 1 | **Astral Levator** | Worker | T0 | 50/0/1 | S-only | G (weak) |
| 2 | **Looming Disciple** | Core fighter | T1 | 100/25/2 | S-heavy | G |
| 3 | **Nebula Stalker** | Skirmisher / AA | T2 | 125/75/2 | Z-lean | G + A |
| 4 | **Grand Seer** | Caster & Detector | T2.5 | 50/200/2 | Z-heavy | None (support) |
| 5 | **Cosmic Floof** | Powerhouse | T3 | 350/275/8 | Z-heavy | G + A |

1. **Astral Levator** — A perfectly spherical Pallas cat levitating cross-pawed, telekinetically floating crystal-scrap behind it. Gathers without touching anything (disdain). **Warps in** structure blueprints then leaves them to self-assemble (Probe analog — one worker can queue an entire base).
2. **Looming Disciple** — Robed novice monk-cat that *looms*. Zealot analog: melee, expensive, Floof Shield, hits like a grand piano. Researched ability: **Judgmental Advance** (charge — closes distance while maintaining unblinking eye contact).
3. **Nebula Stalker** — A lithe(ish) cat fused into a four-legged crystalline walker frame. Stalker analog: ranged G+A, Floof Shield, researched **Blink** (short teleport — the cat simply decides to be elsewhere). The faction's kiting, harassing, pylon-defending workhorse.
4. **Grand Seer** — Ancient floating oracle-cat inside a slowly rotating halo ring. **Detector.** Abilities: **Hairball Vortex** (AoE pull + 1.5s stun in a small radius — the premier engagement-breaker), **Veil of Disdain** (cloaks allied units in a small field while the Seer channels), **Foresight** (reveals an area anywhere on the map for 8s). Zest-devouring and slow — protect at all costs.
5. **Cosmic Floof** — A colossal astral projection of the roundest recorded Pallas cat, limbs of starlight, expression of infinite contempt. Archon-meets-Carrier: G+A splash beam attack ("Gaze of Judgment"), gigantic Floof Shield that regenerates rapidly out of combat, aura slows enemy attack speed by 10% ("performance anxiety"). Supply-devouring win condition.

#### Structures

| # | Structure | Function | Key Vulnerability |
|---|-----------|----------|-------------------|
| 1 | **The Observatory Throne** (Town Hall) | Worker warp-in, drop-off; can **Overcharge** one Whisker Pylon per 60s (defensive beam turret, 12s) | Overcharge is the only early static defense — on cooldown, the front door is open |
| 2 | **Whisker Pylon** (Supply) | +8 supply; projects the Power Matrix field; forward pylons enable proxy warp-ins | The keystone weakness: kill a pylon → unpower structures, cancel in-progress warps in its radius |
| 3 | **Warp Alcove** (Basic production) | Builds Disciples/Stalkers; toggles to **Warp Mode** to deliver units at any powered tile | In Warp Mode, production cooldowns run 25% slower; misusing the toggle bleeds macro |
| 4 | **Halo Archive** (Tech Lab) | Unlocks T2.5/T3; researches Blink, Judgmental Advance, shield tiers | Requires the *largest* power-field overlap (2 pylons) — a single snipe can unpower tech |
| 5 | **Scratching Obelisk** (Perimeter defense) | Crystal pillar, G+A beam, built-in **Detector** (the only static detection in the game) | Only functions inside the Matrix; pylon-snipe blinds and disarms the perimeter simultaneously |

---

## 4. COUNTER-PLAY & BALANCE MATRIX

### 4.1 Tier 1 triangle (opening 5 minutes)

| Matchup | Dynamic |
|---|---|
| **Citrus-Slinger vs Scavenger** | Slingers win at range with even micro; Scavengers win on Clutter or in surrounds. The Panda player fights on purple or retreats; the Republic player takes clean-ground engagements and kites toward steam. |
| **Scavenger vs Looming Disciple** | Disciples demolish Scavengers 1v1 (shield + damage) but cost 4x. Pandas surround-and-trade; a Disciple caught by 6+ Scavengers on Clutter dies before its shield matters. Cost-for-cost, near-even; positioning decides. |
| **Looming Disciple vs Citrus-Slinger** | Melee vs ranged: Slingers kite unenhanced Disciples forever; Judgmental Advance (research) flips it. This creates the classic timing war — the Republic must hit *before* Charge finishes, the Pallas must survive to it. |

### 4.2 Tier 2 anti-air bridge & skirmish layer

- **Melon-Mortar** is the game's positional wall: Lob Mode zones both Glider packs and Stalker blink-jumps, but its min-range in siege is exploitable by Rabies-Shift Scavenger ambushes and Blink surrounds. Flak Mode answers mass Gliders but sacrifices siege pressure — mode-toggle reads are the RvT and RvP skill test.
- **Shopping Cart Glider** is the tempo unit: it outruns everything off-creep *while on Clutter*, punishes Republic waddle-relocations and unescorted Pallas expansions, and its Tangle slows Disciples off their Charge. It loses straight fights vs Stalkers (shields absorb bolas) and vs Flak Mortars — it must hit-and-run.
- **Nebula Stalker** wins attrition duels against both skirmishers via shield regen and Blink, but is Zest-expensive: trading Stalkers evenly against Gliders is *losing on economy*. Blink pylon-defense vs Glider pylon-snipes is the central PvR micro war.

### 4.3 Invisibility & detection economy

| | Cloak source | Mobile detector | Static detector |
|---|---|---|---|
| **Republic** | Steam Cloak (damage-reduction, *not* invisibility — the Republic hides nothing, it just doesn't care) | **Spa Guardian** | none (Squirt Turret does NOT detect) |
| **Pandas** | Rabies Shift burrow-transit (untargetable in transit) | **Garbologist** | none |
| **Pallas** | **Veil of Disdain** (true area cloak, channelled) | **Grand Seer** | **Scratching Obelisk** (only static detection in the game) |

- Only the Pallas own hard invisibility, and only while a Grand Seer channels — killing the channel breaks the veil (counterplay is a snipe, not a scan-race).
- Republic and Panda static defense *cannot detect*: both factions must pull their T2.5 caster to answer cloaked pushes, making the caster snipe/protect war the mid-game focal point of every matchup involving Pallas.
- Panda Rabies Shift is transit-only stealth: nodes can be pre-emptively destroyed to deny the exits — Clutter-clearing doubles as anti-stealth play.

### 4.4 T3 checks (no unanswerable powerhouse)

- **Guava Goliath** ← swarmed by Ripened Scavenger floods (DPS-per-cost) or pulled/stunned by Hairball Vortex and focused by Stalkers.
- **Dumpster Titan** ← ground-only: kited by Flak Melon-Mortars and Gliders' Tangle, or zoned entirely by Lob Mode; Cosmic Floof outranges it.
- **Cosmic Floof** ← supply-inefficient: hard-countered economically by mass Glider harass elsewhere on the map, and burst down by Squeeze-the-Day Slinger volleys focused through the shield window.

### 4.5 Macro-mechanic counterplay (attack the engine, not just the army)

- vs **Republic**: kill Boiler Totems to sever steam relays — their army armor bonus and turret rate both degrade.
- vs **Pandas**: clear Clutter Nodes (any attack works; nodes have 30 HP) — recede the speed carpet before engaging.
- vs **Pallas**: snipe pylons — every fight near a Pallas position should begin with the question "which crystal turns this base off?"

---

## 5. VISUAL DIRECTION & ASSET MANIFEST

**Established style (from `exampleassets/`):** painterly stylized-realism, isometric ¾ view, studio-neutral backdrop, grounded dirt/stone base plates, weathered metal with copper piping (Republic), taped salvage and purple slime (Pandas), iridescent crystal and gold halos (Pallas). All future assets must match this sheet.

| File | In-game entity |
|---|---|
| `Gemini_Generated_Image_ (4).png` | **Guava Goliath** — T3 mech, hot-tub dome cockpit, twin gatlings |
| `Gemini_Generated_Image_ (5).png` | **Spa Guardian** — mobile hot-tub caster, steam stacks, bath-bomb tray |
| `Gemini_Generated_Image_ (6).png` | **Melon-Mortar** — tracked watermelon mortar, Lob Mode |
| `Gemini_Generated_Image_ (7).png` | **Citrus-Slinger** — 3D render, flaming-orange launcher quad |
| `Gemini_Generated_Image_ (11).png` | **Citrus-Slinger** — 2D painted key-art variant |
| `Gemini_Generated_Image_ (8).png` | **Hydro-Greaser** (left) + terrain-biome diorama: Republic dirt / Panda clutter-stone / Pallas crystal field (right) |
| `Gemini_Generated_Image_ (9).png` | **Grand Seer** — haloed levitating oracle-cat |
| `Gemini_Generated_Image_ (10).png` | **Scavenger** — wet-floor-sign spear, can-mail, standing on Clutter |
| `Gemini_Generated_Image_ (12).png` | **The Grand Bathhouse** — Republic Town Hall, twin citrus hot-spring pools |
| `Gemini_Generated_Image_n2todn...png` | **Master roster sheet** — all three factions with canonical unit names (naming source of truth) |

**Asset gaps for MVP:** Panda structures (all 5), Pallas structures except pylon-adjacent crystals, Republic Boiler Totem / Grease Garage / Percolator / Squirt Turret, plus the remaining unit renders (Junkyard Salvager, Shopping Cart Glider, Garbologist, Dumpster Titan, Astral Levator, Looming Disciple, Nebula Stalker, Cosmic Floof exist on the roster sheet but need individual hero renders).

---

## 6. OPEN BALANCE QUESTIONS (v0.2 agenda)

1. Scavenger 0.5-supply granularity vs UI clarity — round to 1 supply with pair-production?
2. Does Steam armor + Spa Guardian damage reduction stack too hard on Goliath pushes? (Candidate cap: one defensive aura per unit.)
3. Warp Mode 25% production penalty — sufficient to stop permanent-Warp degenerate play?
4. Clutter recession rate after node death: instant hole vs 10s decay (currently 10s decay).
5. Should Foresight (Seer map-reveal) share a cooldown with Veil to prevent one Seer doing everything?
