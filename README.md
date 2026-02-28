# Wormhole Roller – Dynamic Collapse Planner

A browser-based tool for planning EVE Online wormhole rolling operations. Given your fleet composition and wormhole status, it generates a precise step-by-step jump plan to roll, crit, or doorstop a wormhole safely.

## Features

- Supports Battleships, Cruisers, HICs, and a configurable Custom ship type
- Three goals: **Crit** (reduce to <10% mass), **Close** (fully collapse), **Doorstop** (crit and leave a ship to close on demand)
- Calibrated partial passes to hit exact mass targets without overshooting
- Per-step safety checks with status warnings after each jump
- Worst-case mass planning (assumes the wormhole is at the top of its current status band)

## Setup

Clone or download this repository, then open `index.html` in any modern web browser. No build step or server required.

## Usage

1. Type a wormhole code (e.g. `C247`) into the search box and select it from the autocomplete list.
2. Choose the **Current Mass State** (Stable, Unstable, or Critical).
3. Choose your **Goal** (Crit, Close, or Doorstop).
4. Enter your fleet counts. For Custom ships, set the cold and hot mass values.
5. Click **Calculate Plan** to generate the step-by-step rolling plan.

Each step shows the ship type, jump mode (COLD/HOT), direction (IN/OUT), and the mass consumed. Status check reminders after each inbound jump tell you when to abort and reassess.
