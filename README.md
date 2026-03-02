# Wormhole Rolling Assistant

A mobile-first React app for planning and executing EVE Online wormhole rolling operations. Enter your wormhole type and fleet, and it generates a precise step-by-step jump plan — then guides you through each jump in real time, replanning on the fly as the hole's mass state becomes clear.

## Features

### Planning
- **Wormhole database** — search by type code (e.g. `C247`); total mass and per-jump limit loaded automatically
- **Per-pilot fleet setup** — add each ship individually with pilot name, ship class, and optional ship name; edit or remove at any time
- **Custom ship masses** — enter cold and hot mass in millions of kg for any ship class, including Custom
- **Three goals**
  - **Close** — fully collapse the wormhole (100% mass consumed)
  - **Crit** — bring to critical mass (≥90% consumed), all ships home
  - **Doorstop** — crit the hole and stage the heaviest ship inside; close on demand with one hot jump
- **HIC support** — Mass Entanglers near-zero entry (~0M), MWD hot return (300M)
- **Plan view** — full jump sequence before execution starts, with mode icons and mass annotations

### Safety engine (`rollingEngine.js`)
- **Dynamic hot/cold selection** per jump — defaults HOT; switches to COLD on strand risk, collapse risk, or grey-zone uncertainty
- **Grey zone protection** — if a hot jump outcome falls in [target×0.9, target×1.1), the WH may or may not collapse due to mass variance; engine prefers cold when pilots are at risk
- **Per-ship entry gate** (`canSafelyEnter`) — before allowing each inbound jump, simulates all worst-case returns for every pilot that would be in the hole; aborts if no safe mode exists
- **Efficiency-first subset selection** — before each pass, tests whether the full fleet can complete a cold round trip safely; if not, iteratively removes the heaviest contributor until the remaining subset is safe (hold-back notice shown in plan and execution)
- **Crit state strategy** (`getCritStrategy`) — at ≥90% consumed on a close goal, switches to cold in → hot back for controlled collapse
- **Fleet completeness** — every ship in the fleet appears in the plan as a jump step or a standing-by entry (with a reason); execution mode skips standing-by items automatically
- **Debug assertion** — `generatePlan()` logs an error if any eligible ship is missing from the plan

### Execution mode
- **Step-by-step cards** — pilot name, ship class, direction (→ / ←), mode (HOT / COLD), mass (±10% variance shown where relevant)
- **Mass progress bar** — live consumed vs. total
- **Side tracker** — toggle overlay showing which pilots are home vs. in the hole
- **Alert banners** — strand risk, goal step (collapse / crit / doorstop), switched-to-cold warnings
- **Assessment checkpoints** — after each multi-pass intermediate, FC reports the WH's visual state; plan tail is regenerated accordingly
- **Dynamic replanning** — after every step, press **Done ✓** to report the current WH state (Fresh / Reduced / Critical / Skip) and regenerate the remaining plan tail:
  - *Fresh / Unknown* → plan normally from current mass
  - *Reduced* → conservative: assumes only 60% of remaining mass is usable
  - *Critical* → `getCritStrategy` takes over using actual pilot positions (home vs. in hole)
- **Replan button** in the top bar — trigger a state update at any point without marking the current step done
- **Doorstop screen** — once critted with a ship staged, shows a **Close Now** button that appends the final hot jump

## Tech stack

- **React 18** + **Vite**
- **Tailwind CSS**
- Pure-logic engine (`src/rollingEngine.js`) — no React, fully testable in isolation

## Setup

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Project structure

```
src/
  rollingEngine.js          # Pure logic: plan generation, safety checks, mass math
  App.jsx                   # Screen router (wormhole-select → fleet-setup → plan → execution)
  components/
    WormholeSelect.jsx      # Wormhole type search + autocomplete
    FleetSetup.jsx          # Per-pilot fleet builder + goal selection
    RollingPlan.jsx         # Full plan view before execution
    ExecutionMode.jsx       # Step-by-step execution with live replanning
    MassProgressBar.jsx     # Consumed mass progress bar
    SideTracker.jsx         # Home / in-hole pilot tracker overlay
```

## Mass units

The engine uses raw EVE file units internally where **1 unit = 1,000 kg**. All display values are converted to millions of kg (e.g. `300_000` file units → `300M`). The ±10% variance shown on uncertain jumps reflects EVE's wormhole mass randomisation.
