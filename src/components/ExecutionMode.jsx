import { useState, useEffect, useMemo } from 'react';
import { formatMass, GOALS, respondToStatus, estimateRemainingMass, generateClosingStep } from '../rollingEngine.js';
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

/**
 * Derive which pilots are home vs in hole based on completed plan items.
 * direction='in' moves a ship into the hole; direction='home' brings it back.
 */
function computeSides(completedItems, fleet) {
  const homeIds = new Set(fleet.map(s => s.id));
  const holeIds = new Set();
  for (const it of completedItems) {
    if (it.type !== 'step') continue;
    if (it.direction === 'in') { homeIds.delete(it.ship.id); holeIds.add(it.ship.id); }
    else                       { holeIds.delete(it.ship.id); homeIds.add(it.ship.id); }
  }
  return {
    homeSide: fleet.filter(s => homeIds.has(s.id)),
    holeSide: fleet.filter(s => holeIds.has(s.id)),
  };
}

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutionMode({ wormhole, fleet, initialItems, goal = 'close', doorstopShip, onReset }) {
  const [items,             setItems]             = useState(initialItems);
  const [currentIdx,        setCurrentIdx]        = useState(0);
  const [showTracker,       setShowTracker]       = useState(false);
  const [closingStep,       setClosingStep]       = useState(null);
  // Reduction tracking — set when FC confirms "Wormhole Reduced" at pass end
  const [reductionObserved, setReductionObserved] = useState(false);
  const [reductionAtMass,   setReductionAtMass]   = useState(0);

  // Resolve current item (may have been replaced by a closing step)
  const activeItems = useMemo(
    () => closingStep ? [...items, closingStep] : items,
    [items, closingStep],
  );
  const item     = currentIdx < activeItems.length ? activeItems[currentIdx] : null;
  const itemType = item?.type ?? null;

  // consumedFloor = sum of (massThisJump × 1.1) for all confirmed jumps.
  // Pessimistic lower bound on actual mass consumed through the wormhole.
  const consumedFloor = useMemo(() => {
    let floor = 0;
    for (let i = 0; i < currentIdx; i++) {
      const it = activeItems[i];
      if (it?.type === 'step') floor += Math.round(it.massThisJump * 1.1);
    }
    return floor;
  }, [activeItems, currentIdx]);

  // Auto-skip standing-by items — they are shown in the plan view but skipped in execution
  useEffect(() => {
    if (currentIdx < activeItems.length && activeItems[currentIdx]?.type === 'standing-by') {
      setCurrentIdx(i => i + 1);
    }
  }, [currentIdx, activeItems]);

  // ── Pass-end status handler (mandatory gate between passes) ────────────────
  function handlePassConfirmation(status) {
    const completedItems = activeItems.slice(0, currentIdx);
    const { homeSide, holeSide } = computeSides(completedItems, fleet);
    const session = { consumedFloor, reductionObserved, reductionAtMass, holeSide, homeSide };
    const { updatedSession, newSteps } = respondToStatus(status, session, fleet, wormhole, goal, doorstopShip);
    setReductionObserved(updatedSession.reductionObserved);
    setReductionAtMass(updatedSession.reductionAtMass);
    // Replace assessment item and everything after it with new steps
    setItems([...activeItems.slice(0, currentIdx), ...newSteps]);
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

  // ── Pass-end status gate ────────────────────────────────────────────────────
  if (itemType === 'assessment') {
    const massEst = estimateRemainingMass(wormhole, consumedFloor, reductionObserved, reductionAtMass);
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Top bar */}
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
            <div className="text-center text-xs text-slate-600 mt-1">
              Est. remaining: ~{formatMass(massEst.pessimistic)} – ~{formatMass(massEst.optimistic)}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🕳</div>
              <h2 className="text-2xl font-bold text-slate-100 mb-1">Pass {item.passNumber} complete.</h2>
              <p className="text-slate-400 text-sm">Check the hole.</p>
            </div>
            <div className="w-full flex flex-col gap-3 max-w-xs">
              <button
                onClick={() => handlePassConfirmation('no_change')}
                className="w-full py-5 rounded-2xl font-bold text-slate-100 text-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 transition-colors"
              >
                No Change
                <div className="text-xs text-slate-400 font-normal mt-1">Looks the same as before</div>
              </button>
              <button
                onClick={() => handlePassConfirmation('reduced')}
                className="w-full py-5 rounded-2xl font-bold text-slate-900 text-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-colors"
              >
                Wormhole Reduced
                <div className="text-xs text-amber-800 font-normal mt-1">Visually smaller — ≈50% consumed</div>
              </button>
              <button
                onClick={() => handlePassConfirmation('critical')}
                className="w-full py-5 rounded-2xl font-bold text-white text-lg bg-red-600 hover:bg-red-500 active:bg-red-700 transition-colors"
              >
                Wormhole Critical
                <div className="text-xs text-red-200 font-normal mt-1">Flashing / almost gone — ≈90% consumed</div>
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

  // ── Hold-back screen ────────────────────────────────────────────────────────
  if (itemType === 'hold-back') {
    const heldBack = item.sittingOut ?? [];
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

          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-6">
            <div className="text-5xl">⏸</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-blue-300 mb-2">Hold Back</h2>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">{item.reason}</p>
            </div>

            {heldBack.length > 0 && (
              <div className="w-full max-w-xs space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-wider text-center mb-1">Sitting out this pass</div>
                {heldBack.map(s => (
                  <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-slate-300 text-sm font-medium">{s.pilotName}</span>
                    <span className="text-slate-600 text-xs">{s.shipClass}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setCurrentIdx(i => i + 1)}
              className="w-full max-w-xs py-4 rounded-xl font-semibold text-slate-900 bg-blue-400 hover:bg-blue-300 active:bg-blue-500 transition-colors"
            >
              Continue →
            </button>
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
          {(() => {
            const est = estimateRemainingMass(wormhole, consumedFloor, reductionObserved, reductionAtMass);
            return (
              <div className="text-center text-xs text-slate-700 mt-0.5">
                Est. remaining: ~{formatMass(est.pessimistic)} – ~{formatMass(est.optimistic)}
              </div>
            );
          })()}
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
        {step.isHic && !isIn && step.collapses && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 text-red-100 text-sm font-semibold text-center">
            🚨 HIC ← home (MWD hot — {formatMass(step.massThisJump)}) ⚠ THIS JUMP COLLAPSES THE HOLE
          </div>
        )}
        {step.isHic && isIn && (
          <div className="bg-cyan-900/30 border border-cyan-500/40 rounded-xl p-3 text-cyan-300 text-sm text-center">
            Mass Entanglers active — near zero mass into hole
          </div>
        )}
        {isGoalStep && !isStrand && !step.isHic && goal === 'close' && (
          <div className="bg-emerald-900/40 border border-emerald-500/60 rounded-xl p-3 text-emerald-300 text-sm font-semibold text-center">
            💥 This is the collapsing jump
          </div>
        )}
        {isGoalStep && !isStrand && !step.isHic && goal === 'crit' && (
          <div className="bg-orange-900/40 border border-orange-500/60 rounded-xl p-3 text-orange-300 text-sm font-semibold text-center">
            ⚡ This jump criticals the wormhole
          </div>
        )}
        {isGoalStep && !isStrand && !step.isHic && goal === 'doorstop' && (
          <div className="bg-violet-900/40 border border-violet-500/60 rounded-xl p-3 text-violet-300 text-sm font-semibold text-center">
            🚪 This jump doorstops the wormhole
          </div>
        )}
        {/* Switched-to-cold safety notice */}
        {step.switched && step.warning && (
          <div className={`rounded-xl p-3 text-sm border ${
            step.switchReason === 'strand-risk'
              ? 'bg-blue-950/30 border-blue-500/40 text-blue-300'
              : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
          }`}>
            {step.switchReason === 'strand-risk' ? '🔵' : '⚠'} {step.warning}
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
            {/* Mode icon for switched steps */}
            {step.switchReason === 'strand-risk'   && <div className="text-3xl mb-1">🔵</div>}
            {step.switchReason === 'collapse-risk' && <div className="text-3xl mb-1">⚠</div>}
            {step.switchReason === 'abort'         && <div className="text-3xl mb-1">🚨</div>}
            {!step.switchReason && step.isHot && !step.isHic && <div className="text-2xl mb-1">✅</div>}
            <div className={`text-8xl font-bold leading-none ${isIn ? 'text-cyan-400' : 'text-amber-400'}`}>
              {isIn ? '→' : '←'}
            </div>
            <div className="text-slate-400 text-base mt-2">
              {step.isHic
                ? isIn
                  ? 'Jump INTO hole (Mass Entanglers active)'
                  : 'Jump HOME (MWD hot)'
                : isIn ? 'Jump INTO hole' : 'Jump HOME'
              }
            </div>
            {/* Reason sub-label */}
            {step.reason && (
              <div className={`text-xs mt-1.5 italic ${
                step.switchReason === 'strand-risk'   ? 'text-blue-400/80' :
                step.switchReason === 'collapse-risk' ? 'text-amber-400/80' :
                'text-slate-500'
              }`}>
                {step.reason}
              </div>
            )}
          </div>

          {/* Mode + Mass */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Mode</div>
              {step.isHic
                ? <div className={`text-xl font-bold ${isIn ? 'text-cyan-300' : 'text-orange-400'}`}>
                    {isIn ? 'ENTANGLERS' : 'MWD HOT'}
                  </div>
                : <div className={`text-2xl font-bold ${step.isHot ? 'text-orange-400' : 'text-slate-300'}`}>
                    {step.isHot ? 'HOT' : 'COLD'}
                  </div>
              }
              {step.switched && (
                <div className="text-xs text-slate-500 mt-1">auto-switched</div>
              )}
            </div>
            <div className="bg-slate-800 rounded-xl p-4 text-center">
              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Mass</div>
              <div className="text-2xl font-bold text-slate-100 font-mono">
                {step.showVariance ? '~' : ''}{formatMass(step.massThisJump)}
              </div>
              {step.showVariance && (
                <div className="text-xs text-slate-500 mt-0.5">±10% variance</div>
              )}
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
