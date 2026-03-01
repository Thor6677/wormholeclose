import { formatMass, GOALS } from '../rollingEngine.js';
import MassProgressBar from './MassProgressBar.jsx';

// Per-goal badge styling (full Tailwind strings required — no dynamic interpolation)
const GOAL_BADGE = {
  close:    'bg-emerald-900/50 text-emerald-300',
  crit:     'bg-orange-900/50 text-orange-300',
  doorstop: 'bg-violet-900/50 text-violet-300',
};

function StepRow({ step, index, goal }) {
  const isIn       = step.direction === 'in';
  const isGoalStep = step.isGoalStep;
  const isStrand   = step.isStrandingRisk;
  const goalCfg    = GOALS[goal] ?? GOALS.close;
  const badgeCls   = GOAL_BADGE[goal] ?? GOAL_BADGE.close;

  const rowBg =
    isStrand   ? 'bg-red-950/30' :
    isGoalStep ? (goal === 'close' ? 'bg-emerald-950/20' : goal === 'crit' ? 'bg-orange-950/20' : 'bg-violet-950/20') :
    '';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 select-none ${rowBg}`}>
      {/* Step number */}
      <span className="text-slate-600 text-xs font-mono w-5 text-center shrink-0">{index + 1}</span>

      {/* Direction arrow */}
      <span className={`text-xl shrink-0 ${isIn ? 'text-cyan-400' : 'text-amber-400'}`}>
        {isIn ? '→' : '←'}
      </span>

      {/* Pilot + ship */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-100 text-sm">{step.ship.pilotName}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${step.isHot ? 'bg-orange-900/50 text-orange-300' : 'bg-slate-700 text-slate-400'}`}>
            {step.isHot ? 'HOT' : 'COLD'}
          </span>
          {isGoalStep && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${badgeCls}`}>
              {goalCfg.badge}
            </span>
          )}
          {isStrand && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 font-bold">
              STRANDING
            </span>
          )}
        </div>
        <div className="text-slate-500 text-xs mt-0.5">
          {step.ship.shipClass}{step.ship.shipName ? ` — ${step.ship.shipName}` : ''}
          <span className="ml-2 text-slate-600">
            {isIn ? 'into hole' : 'home'}
          </span>
        </div>
      </div>

      {/* Mass */}
      <div className="text-right shrink-0">
        <div className="text-slate-200 text-sm font-mono">{formatMass(step.massThisJump)}</div>
        <div className={`text-xs font-mono ${step.runningTotal >= step._target ? 'text-red-400' : 'text-slate-600'}`}>
          {formatMass(step.runningTotal)}
        </div>
      </div>
    </div>
  );
}

function AssessmentRow({ item }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-700/30 border-y border-slate-600/40">
      <span className="text-slate-400 text-xs font-mono w-5 text-center shrink-0">—</span>
      <span className="text-yellow-400 text-base shrink-0">❓</span>
      <div className="flex-1 min-w-0">
        <div className="text-slate-300 text-sm font-semibold">Assessment Point</div>
        <div className="text-slate-500 text-xs mt-0.5">
          Pass {item.passNumber} complete — FC checks wormhole visual state
        </div>
      </div>
    </div>
  );
}

function DoorstopMarkerRow({ item }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-violet-950/20 border-y border-violet-600/40">
      <span className="text-slate-400 text-xs font-mono w-5 text-center shrink-0">—</span>
      <span className="text-violet-400 text-base shrink-0">🚪</span>
      <div className="flex-1 min-w-0">
        <div className="text-violet-300 text-sm font-semibold">Doorstop — {item.ship?.pilotName}</div>
        <div className="text-slate-500 text-xs mt-0.5">
          {item.ship?.shipClass} staged in hole; jumps home hot to close on demand
        </div>
      </div>
    </div>
  );
}

function OutcomeRow({ item }) {
  const cfg = {
    collapsed:        { icon: '💥', label: 'WORMHOLE COLLAPSES', cls: 'text-emerald-400 bg-emerald-950/20 border-emerald-600/40' },
    critical:         { icon: '⚡', label: 'WORMHOLE CRITTED',   cls: 'text-orange-400 bg-orange-950/20 border-orange-600/40'   },
    doorstop_active:  { icon: '🚪', label: 'DOORSTOP COMPLETE',  cls: 'text-violet-400 bg-violet-950/20 border-violet-600/40'   },
  }[item.result] ?? { icon: '✅', label: 'GOAL REACHED', cls: 'text-cyan-400 bg-cyan-950/20 border-cyan-600/40' };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-y ${cfg.cls}`}>
      <span className="text-xs font-mono w-5 text-center shrink-0">—</span>
      <span className="text-base shrink-0">{cfg.icon}</span>
      <div className={`text-sm font-bold ${cfg.cls.split(' ')[0]}`}>{cfg.label}</div>
    </div>
  );
}

export default function RollingPlan({ wormhole, plan, fleet, onStart, onBack }) {
  const goal    = plan.goal ?? 'close';
  const goalCfg = GOALS[goal] ?? GOALS.close;

  const items = plan.items ?? [];
  // Attach _target to step items for colour threshold in StepRow
  const annotated = items.map(item =>
    item.type === 'step' ? { ...item, _target: wormhole.totalMass } : item
  );

  // Last runningTotal from step items
  const lastStep   = [...annotated].reverse().find(i => i.type === 'step');
  const lastTotal  = lastStep?.runningTotal ?? 0;
  const stepItems  = annotated.filter(i => i.type === 'step');
  const hasStrand  = stepItems.some(s => s.isStrandingRisk);
  const canReachGoal = plan.canReachGoal;

  let stepIndex = 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-8">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100 text-xl p-1">←</button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-cyan-400">Rolling Plan — {wormhole.type}</h2>
          <p className="text-slate-500 text-xs">
            {fleet.length} ship{fleet.length !== 1 ? 's' : ''} · {stepItems.length} jump{stepItems.length !== 1 ? 's' : ''} · {goalCfg.label}
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">

        {/* Warnings */}
        {plan.warnings.map(w => (
          <div
            key={w.id}
            className={[
              'p-3 rounded-xl text-sm flex items-start gap-2 border',
              w.type === 'insufficient' || w.type === 'doorstop-solo'
                ? 'bg-red-950/30 border-red-500/40 text-red-300'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-300',
            ].join(' ')}
          >
            <span className="shrink-0 mt-0.5">
              {w.type === 'insufficient' || w.type === 'doorstop-solo' ? '🚨' : '⚠'}
            </span>
            <span>{w.message}</span>
          </div>
        ))}

        {/* Mass summary */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <MassProgressBar current={lastTotal} total={wormhole.totalMass} />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>{formatMass(lastTotal)} consumed</span>
            <span>Max {formatMass(wormhole.totalMass)}</span>
          </div>
          {!canReachGoal && (
            <div className="mt-2 text-red-400 text-xs">
              ⚠ Insufficient fleet mass — add more ships to {goalCfg.label.toLowerCase()} this wormhole.
            </div>
          )}
        </div>

        {/* Item list */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jump Sequence</span>
          </div>

          {annotated.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-600 text-sm">
              No steps generated — add ships to your fleet.
            </div>
          )}

          <div className="divide-y divide-slate-700/40">
            {annotated.map(item => {
              if (item.type === 'step') {
                const idx = stepIndex++;
                return <StepRow key={item.id} step={item} index={idx} goal={goal} />;
              }
              if (item.type === 'assessment')     return <AssessmentRow     key={item.id} item={item} />;
              if (item.type === 'doorstop-marker') return <DoorstopMarkerRow key={item.id} item={item} />;
              if (item.type === 'outcome')         return <OutcomeRow        key={item.id} item={item} />;
              return null;
            })}
          </div>
        </div>

        {hasStrand && (
          <div className="p-3 rounded-xl text-xs text-red-300 bg-red-950/20 border border-red-500/30">
            <strong>Red steps</strong> indicate a pilot would be stranded when the wormhole collapses. Reduce the fleet size or switch goal.
          </div>
        )}

        <button
          onClick={() => onStart(plan.items)}
          disabled={annotated.length === 0 || !canReachGoal}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors text-lg"
        >
          Start {goalCfg.shortLabel} Run →
        </button>
      </div>
    </div>
  );
}
