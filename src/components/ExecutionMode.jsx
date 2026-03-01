import { useState } from 'react';
import { formatMass, GOALS, recalculatePlan, generateClosingStep } from '../rollingEngine.js';
import MassProgressBar from './MassProgressBar.jsx';
import SideTracker from './SideTracker.jsx';

// ─── Goal-specific config ────────────────────────────────────────────────────

const DONE_SCREENS = {
  collapsed: {
    icon:    '💥',
    heading: 'WORMHOLE COLLAPSED',
    sub:     (wh) => `${wh.type} has been closed.`,
    note:    'All pilots should be accounted for.',
    color:   'text-emerald-400',
  },
  critical: {
    icon:    '⚡',
    heading: 'WORMHOLE CRITTED',
    sub:     (wh) => `${wh.type} is now at critical mass.`,
    note:    'One more jump will collapse it — tread carefully.',
    color:   'text-orange-400',
  },
  doorstop_active: {
    icon:    '🚪',
    heading: 'DOORSTOP ACTIVE',
    sub:     (wh) => `${wh.type} has been critted with a ship staged inside.`,
    note:    'Press "Close Now" when ready to collapse.',
    color:   'text-violet-400',
  },
};

const GOAL_CARD = {
  close:    { border: 'border-emerald-500', bg: 'bg-emerald-950/20', done: 'bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500' },
  crit:     { border: 'border-orange-500',  bg: 'bg-orange-950/20',  done: 'bg-orange-400 hover:bg-orange-300 active:bg-orange-500'   },
  doorstop: { border: 'border-violet-500',  bg: 'bg-violet-950/20',  done: 'bg-violet-400 hover:bg-violet-300 active:bg-violet-500'   },
};

// ─── Sub-screens ──────────────────────────────────────────────────────────────

function DoneScreen({ wormhole, result, onReset, doorstopShip, onCloseNow }) {
  const cfg = DONE_SCREENS[result] ?? DONE_SCREENS.collapsed;
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-6">
        <div className="text-8xl">{cfg.icon}</div>
      </div>
      <h1 className={`text-4xl font-bold mb-3 tracking-tight ${cfg.color}`}>
        {cfg.heading}
      </h1>
      <p className="text-slate-400 text-lg mb-2">{cfg.sub(wormhole)}</p>
      <p className="text-slate-600 text-sm mb-10">{cfg.note}</p>

      {result === 'doorstop_active' && doorstopShip && (
        <button
          onClick={onCloseNow}
          className="px-10 py-4 rounded-xl font-semibold bg-violet-500 hover:bg-violet-400 active:bg-violet-600 text-white text-lg transition-colors mb-4"
        >
          Close Now ({doorstopShip.pilotName} jumps home hot)
        </button>
      )}

      <button
        onClick={onReset}
        className="px-10 py-4 rounded-xl font-semibold bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-slate-900 text-lg transition-colors"
      >
        Roll Another Wormhole
      </button>
    </div>
  );
}

function AssessmentScreen({ item, onAnswer }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl mb-6">❓</div>
      <h1 className="text-3xl font-bold text-slate-100 mb-2 tracking-tight">
        Pass {item.passNumber} Complete
      </h1>
      <p className="text-slate-400 text-base mb-8">
        How does the wormhole look right now?
      </p>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => onAnswer('not_reduced')}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-slate-300 hover:bg-slate-100 active:bg-slate-400 transition-colors text-base"
        >
          Not Reduced
          <div className="text-xs text-slate-600 font-normal mt-0.5">Looks fresh / still full-sized</div>
        </button>
        <button
          onClick={() => onAnswer('reduced')}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-colors text-base"
        >
          Reduced ⬇
          <div className="text-xs text-amber-800 font-normal mt-0.5">Visually smaller — ≥50% consumed</div>
        </button>
        <button
          onClick={() => onAnswer('critical')}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-red-400 hover:bg-red-300 active:bg-red-500 transition-colors text-base"
        >
          Critical ⚠
          <div className="text-xs text-red-800 font-normal mt-0.5">Flashing / almost gone — ≥90% consumed</div>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutionMode({ wormhole, fleet, initialItems, goal = 'close', doorstopShip, onReset }) {
  const [items,       setItems]       = useState(initialItems);
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [showTracker, setShowTracker] = useState(false);
  // When doorstop is active and user presses Close Now, we push a closing step
  const [closingStep, setClosingStep] = useState(null);

  // Resolve current item (may have been replaced by a closing step)
  const activeItems  = closingStep ? [...items, closingStep] : items;
  const item         = currentIdx < activeItems.length ? activeItems[currentIdx] : null;
  const itemType     = item?.type ?? null;

  // ── Assessment handler ──────────────────────────────────────────────────────
  function handleAssessment(answer) {
    // Find the runningTotal from the last completed step before this assessment
    let trackedConsumed = 0;
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (activeItems[i].type === 'step') {
        trackedConsumed = activeItems[i].runningTotal;
        break;
      }
    }

    const newTail = recalculatePlan(wormhole, fleet, goal, trackedConsumed, answer);
    // Replace everything from current index onwards
    const newItems = [...activeItems.slice(0, currentIdx), ...newTail];
    setItems(newItems);
    // Don't advance — the first item of newTail is now at currentIdx
    // (but we DO advance past the assessment item itself)
    setCurrentIdx(currentIdx);
  }

  // ── Doorstop close-now handler ──────────────────────────────────────────────
  function handleCloseNow() {
    if (!doorstopShip) return;
    // Find the last runningTotal
    let lastRunning = 0;
    for (let i = activeItems.length - 1; i >= 0; i--) {
      if (activeItems[i].type === 'step') {
        lastRunning = activeItems[i].runningTotal;
        break;
      }
    }
    const step = generateClosingStep(doorstopShip, lastRunning, wormhole);
    setClosingStep(step);
    // Navigate to this new step
    setCurrentIdx(activeItems.length);
  }

  // ── Step-only items for tracker/progress ───────────────────────────────────
  const stepItems = activeItems.filter(i => i.type === 'step');

  // Mass consumed before the current step (last completed step's runningTotal)
  let massConsumedSoFar = 0;
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (activeItems[i].type === 'step') {
      massConsumedSoFar = activeItems[i].runningTotal;
      break;
    }
  }

  const goalCard = GOAL_CARD[goal] ?? GOAL_CARD.close;

  // ── Outcome screen ──────────────────────────────────────────────────────────
  if (itemType === 'outcome') {
    return (
      <DoneScreen
        wormhole={wormhole}
        result={item.result}
        doorstopShip={doorstopShip}
        onCloseNow={handleCloseNow}
        onReset={onReset}
      />
    );
  }

  // ── End of items (fallback) ─────────────────────────────────────────────────
  if (!item) {
    return (
      <DoneScreen
        wormhole={wormhole}
        result={goal === 'close' ? 'collapsed' : goal === 'crit' ? 'critical' : 'doorstop_active'}
        doorstopShip={doorstopShip}
        onCloseNow={handleCloseNow}
        onReset={onReset}
      />
    );
  }

  // ── Assessment screen ───────────────────────────────────────────────────────
  if (itemType === 'assessment') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Top bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-mono text-sm">{wormhole.type}</span>
          </div>
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
        </div>

        <div className="flex-1 flex flex-col px-4 py-4 gap-3">
          <div>
            <MassProgressBar current={massConsumedSoFar} total={wormhole.totalMass} />
            <div className="flex justify-between text-xs text-slate-600 mt-1 font-mono">
              <span>{formatMass(massConsumedSoFar)}</span>
              <span>{formatMass(wormhole.totalMass)}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
            <div className="text-6xl">❓</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-100 mb-2">Pass {item.passNumber} Complete</h2>
              <p className="text-slate-400 text-sm">How does the wormhole look right now?</p>
            </div>
            <div className="w-full flex flex-col gap-3 max-w-xs">
              <button
                onClick={() => handleAssessment('not_reduced')}
                className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-slate-300 hover:bg-slate-100 active:bg-slate-400 transition-colors"
              >
                Not Reduced
                <div className="text-xs text-slate-600 font-normal mt-0.5">Looks full-sized</div>
              </button>
              <button
                onClick={() => handleAssessment('reduced')}
                className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-colors"
              >
                Reduced ⬇
                <div className="text-xs text-amber-800 font-normal mt-0.5">Visually smaller — ≥50% gone</div>
              </button>
              <button
                onClick={() => handleAssessment('critical')}
                className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-red-400 hover:bg-red-300 active:bg-red-500 transition-colors"
              >
                Critical ⚠
                <div className="text-xs text-red-800 font-normal mt-0.5">Flashing — ≥90% gone</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Doorstop-marker screen ─────────────────────────────────────────────────
  if (itemType === 'doorstop-marker') {
    const ds = item.ship;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <span className="text-slate-500 font-mono text-sm">{wormhole.type}</span>
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
        </div>

        <div className="flex-1 flex flex-col px-4 py-4 gap-3">
          <div>
            <MassProgressBar current={massConsumedSoFar} total={wormhole.totalMass} />
            <div className="flex justify-between text-xs text-slate-600 mt-1 font-mono">
              <span>{formatMass(massConsumedSoFar)}</span>
              <span>{formatMass(wormhole.totalMass)}</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
            <div className="text-6xl">🚪</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-violet-300 mb-2">Doorstop Active</h2>
              <p className="text-slate-300 text-base font-semibold">{ds?.pilotName}</p>
              <p className="text-slate-500 text-sm">{ds?.shipClass}{ds?.shipName ? ` — ${ds.shipName}` : ''}</p>
              <p className="text-slate-400 text-sm mt-2">staged in hole, all other pilots are home</p>
            </div>
            <div className="w-full flex flex-col gap-3 max-w-xs">
              <button
                onClick={() => setCurrentIdx(i => i + 1)}
                className="w-full py-4 rounded-xl font-semibold text-white bg-violet-500 hover:bg-violet-400 active:bg-violet-600 transition-colors"
              >
                Confirm Doorstop ✓
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step screen ─────────────────────────────────────────────────────────────
  const step     = item;
  const isIn       = step.direction === 'in';
  const isGoalStep = step.isGoalStep;
  const isStrand   = step.isStrandingRisk;

  const borderColor =
    isStrand   ? 'border-red-500'      :
    isGoalStep ? goalCard.border       :
    isIn       ? 'border-cyan-500/60'  :
                 'border-amber-500/40';

  const cardBg =
    isStrand   ? 'bg-red-950/20' :
    isGoalStep ? goalCard.bg     :
                 'bg-slate-900';

  const doneColor =
    isGoalStep ? goalCard.done :
    isIn       ? 'bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500'   :
                 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500';

  // Step counter among only step-type items
  const currentStepNumber = activeItems.slice(0, currentIdx + 1).filter(i => i.type === 'step').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Top bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 font-mono text-sm">{wormhole.type}</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400 text-sm">
            {currentStepNumber} <span className="text-slate-600">/ {stepItems.length}</span>
          </span>
        </div>
        <button
          onClick={() => setShowTracker(t => !t)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showTracker
              ? 'bg-slate-700 border-slate-600 text-slate-200'
              : 'border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          Tracker
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 py-4 gap-3 overflow-y-auto">

        {/* Mass progress */}
        <div>
          <MassProgressBar current={massConsumedSoFar} total={wormhole.totalMass} />
          <div className="flex justify-between text-xs text-slate-600 mt-1 font-mono">
            <span>{formatMass(massConsumedSoFar)}</span>
            <span>{formatMass(wormhole.totalMass)}</span>
          </div>
        </div>

        {/* Side tracker */}
        {showTracker && (
          <SideTracker
            fleet={fleet}
            steps={stepItems}
            currentStepIndex={stepItems.indexOf(step)}
          />
        )}

        {/* Alert banners */}
        {isStrand && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 text-red-200 text-sm font-semibold text-center">
            🚨 WARNING — This jump collapses the wormhole with pilots still inside!
          </div>
        )}
        {isGoalStep && !isStrand && goal === 'close' && (
          <div className="bg-emerald-900/40 border border-emerald-500/60 rounded-xl p-3 text-emerald-300 text-sm font-semibold text-center">
            💥 This is the collapsing jump
          </div>
        )}
        {isGoalStep && !isStrand && goal === 'crit' && (
          <div className="bg-orange-900/40 border border-orange-500/60 rounded-xl p-3 text-orange-300 text-sm font-semibold text-center">
            ⚡ This jump criticals the wormhole
          </div>
        )}
        {isGoalStep && !isStrand && goal === 'doorstop' && (
          <div className="bg-violet-900/40 border border-violet-500/60 rounded-xl p-3 text-violet-300 text-sm font-semibold text-center">
            🚪 This jump doorstops the wormhole
          </div>
        )}

        {/* Main step card */}
        <div className={`rounded-2xl border-2 ${borderColor} ${cardBg} p-5 flex flex-col gap-5`}>

          {/* Pilot */}
          <div>
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Pilot</div>
            <div className="text-3xl font-bold text-slate-100 leading-tight">{step.ship.pilotName}</div>
            <div className="text-slate-400 text-sm mt-1">
              {step.ship.shipClass}
              {step.ship.shipName ? ` — ${step.ship.shipName}` : ''}
            </div>
          </div>

          {/* Direction */}
          <div className="text-center">
            <div className={`text-8xl font-bold leading-none ${isIn ? 'text-cyan-400' : 'text-amber-400'}`}>
              {isIn ? '→' : '←'}
            </div>
            <div className="text-slate-400 text-base mt-2">
              {isIn ? 'Jump INTO hole' : 'Jump HOME'}
            </div>
          </div>

          {/* Mode + Mass */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Mode</div>
              <div className={`text-2xl font-bold ${step.isHot ? 'text-orange-400' : 'text-slate-300'}`}>
                {step.isHot ? 'HOT' : 'COLD'}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Mass</div>
              <div className="text-2xl font-bold text-slate-100 font-mono">
                {formatMass(step.massThisJump)}
              </div>
            </div>
          </div>

          {/* Running total after this jump */}
          <div className="text-center text-sm text-slate-500">
            After this jump:{' '}
            <span className={`font-mono font-semibold ${step.runningTotal >= wormhole.totalMass ? 'text-red-400' : 'text-slate-300'}`}>
              {formatMass(step.runningTotal)}
            </span>
            <span className="text-slate-700"> / </span>
            <span className="font-mono">{formatMass(wormhole.totalMass)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="py-5 rounded-xl font-semibold text-base border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500 active:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Undo
          </button>
          <button
            onClick={() => setCurrentIdx(i => i + 1)}
            className={`py-5 rounded-xl font-semibold text-base text-slate-900 ${doneColor} transition-colors`}
          >
            Done ✓
          </button>
        </div>

        {/* Step dots — only step-type items */}
        <div className="flex justify-center gap-1 flex-wrap pb-2">
          {activeItems.map((s, i) => {
            if (s.type !== 'step') return null;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentIdx(i)}
                className={[
                  'w-2.5 h-2.5 rounded-full transition-all',
                  i < currentIdx  ? 'bg-emerald-600'  :
                  i === currentIdx ? 'bg-cyan-400 scale-125' :
                                     'bg-slate-700',
                ].join(' ')}
                aria-label={`Go to step ${i + 1}`}
              />
            );
          })}
        </div>

      </div>
    </div>
  );
}
