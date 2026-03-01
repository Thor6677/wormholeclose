import { useState } from 'react';
import { formatMass } from '../rollingEngine.js';
import MassProgressBar from './MassProgressBar.jsx';
import SideTracker from './SideTracker.jsx';

function CollapseScreen({ wormhole, onReset }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 relative">
        <div className="text-8xl">💥</div>
      </div>
      <h1 className="text-4xl font-bold text-emerald-400 mb-3 tracking-tight">
        WORMHOLE COLLAPSED
      </h1>
      <p className="text-slate-400 text-lg mb-2">{wormhole.type} has been closed.</p>
      <p className="text-slate-600 text-sm mb-10">All pilots should be accounted for.</p>
      <button
        onClick={onReset}
        className="px-10 py-4 rounded-xl font-semibold bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-slate-900 text-lg transition-colors"
      >
        Roll Another Wormhole
      </button>
    </div>
  );
}

export default function ExecutionMode({ wormhole, fleet, steps, onReset }) {
  const [currentIdx,   setCurrentIdx]   = useState(0);
  const [showTracker,  setShowTracker]  = useState(false);

  const done = currentIdx >= steps.length;
  const step = done ? null : steps[currentIdx];

  // Mass consumed BEFORE the current step (i.e. from already-completed steps)
  const massConsumedSoFar = currentIdx > 0 ? steps[currentIdx - 1].runningTotal : 0;

  if (done) {
    return <CollapseScreen wormhole={wormhole} onReset={onReset} />;
  }

  const isIn       = step.direction === 'in';
  const isCollapse = step.collapses;
  const isStrand   = step.isStrandingRisk;

  const borderColor =
    isStrand   ? 'border-red-500'            :
    isCollapse ? 'border-emerald-500'         :
    isIn       ? 'border-cyan-500/60'         :
                 'border-amber-500/40';

  const cardBg =
    isStrand   ? 'bg-red-950/20'     :
    isCollapse ? 'bg-emerald-950/20' :
                 'bg-slate-900';

  const doneColor =
    isCollapse ? 'bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500' :
    isIn       ? 'bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500'         :
                 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Top bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 font-mono text-sm">{wormhole.type}</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400 text-sm">
            {currentIdx + 1} <span className="text-slate-600">/ {steps.length}</span>
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
          <SideTracker fleet={fleet} steps={steps} currentStepIndex={currentIdx} />
        )}

        {/* Alert banners */}
        {isStrand && (
          <div className="bg-red-900/50 border border-red-500 rounded-xl p-3 text-red-200 text-sm font-semibold text-center">
            🚨 WARNING — This jump collapses the wormhole with pilots still inside!
          </div>
        )}
        {isCollapse && !isStrand && (
          <div className="bg-emerald-900/40 border border-emerald-500/60 rounded-xl p-3 text-emerald-300 text-sm font-semibold text-center">
            💥 This is the collapsing jump
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

        {/* Step dots */}
        <div className="flex justify-center gap-1 flex-wrap pb-2">
          {steps.map((s, i) => (
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
          ))}
        </div>

      </div>
    </div>
  );
}
