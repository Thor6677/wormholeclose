import { formatMass, GOALS, INITIAL_MASS_STATES, validatePlan } from '../rollingEngine.js';
import MassProgressBar from './MassProgressBar.jsx';
import FeedbackForm from './FeedbackForm.jsx';

// Per-goal badge styling (full Tailwind strings required — no dynamic interpolation)
const GOAL_BADGE = {
  close:    'bg-emerald-900/50 text-emerald-300',
  crit:     'bg-orange-900/50 text-orange-300',
  doorstop: 'bg-violet-900/50 text-violet-300',
};

// Mode icon for a step: reflects the selectJumpMode outcome
function modeIcon(step) {
  if (step.switchReason === 'strand-risk')    return { glyph: '🔵', label: 'Switched cold — strand risk' };
  if (step.switchReason === 'collapse-risk')  return { glyph: '⚠', label: 'Switched cold — collapse risk' };
  if (step.switchReason === 'abort')          return { glyph: '🚨', label: 'Abort — cannot proceed safely' };
  if (step.isHic)                             return null; // HIC has its own badge
  if (step.isHot)                             return { glyph: '✅', label: 'Hot — safe' };
  return null; // forced cold, no extra icon
}

function StepRow({ step, index, goal }) {
  const isIn       = step.direction === 'in';
  const isGoalStep = step.isGoalStep;
  const isStrand   = step.isStrandingRisk;
  const goalCfg    = GOALS[goal] ?? GOALS.close;
  const badgeCls   = GOAL_BADGE[goal] ?? GOAL_BADGE.close;
  const icon       = modeIcon(step);

  const rowBg =
    isStrand   ? 'bg-red-950/30' :
    isGoalStep ? (goal === 'close' ? 'bg-emerald-950/20' : goal === 'crit' ? 'bg-orange-950/20' : 'bg-violet-950/20') :
    '';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 select-none ${rowBg}`}>
      {/* Step number */}
      <span className="text-slate-600 text-xs font-mono w-5 text-center shrink-0">{index + 1}</span>

      {/* Mode icon + direction arrow */}
      <div className="flex flex-col items-center shrink-0 w-6">
        {icon && <span className="text-xs leading-none mb-0.5">{icon.glyph}</span>}
        <span className={`text-xl leading-none ${isIn ? 'text-cyan-400' : 'text-amber-400'}`}>
          {isIn ? '→' : '←'}
        </span>
      </div>

      {/* Pilot + ship */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-100 text-sm">{step.ship.pilotName}</span>
          {step.isHic
            ? isIn
              ? <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-cyan-900/60 text-cyan-300">ENTANGLERS</span>
              : <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-orange-900/50 text-orange-300">MWD HOT</span>
            : <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${step.isHot ? 'bg-orange-900/50 text-orange-300' : 'bg-slate-700 text-slate-400'}`}>
                {step.isHot ? 'HOT' : 'COLD'}
              </span>
          }
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
            {step.isHic
              ? isIn
                ? 'into hole (Mass Entanglers active — near zero mass)'
                : 'home (MWD hot — 300M)'
              : isIn ? 'into hole' : 'home'
            }
          </span>
        </div>
        {/* Reason sub-label — shown for all switched steps */}
        {step.switched && step.reason && (
          <div className={`text-xs mt-0.5 italic ${
            step.switchReason === 'strand-risk'   ? 'text-blue-400/70' :
            step.switchReason === 'collapse-risk' ? 'text-amber-400/70' :
            'text-slate-500'
          }`}>
            {step.reason}
          </div>
        )}
      </div>

      {/* Mass */}
      <div className="text-right shrink-0">
        <div className="text-slate-200 text-sm font-mono">
          {step.showVariance ? '~' : ''}{formatMass(step.massThisJump)}
          {step.showVariance && <span className="text-xs text-slate-500 ml-0.5">±10%</span>}
        </div>
        <div className={`text-xs font-mono ${step.runningTotal >= step._target ? 'text-red-400' : 'text-slate-600'}`}>
          {formatMass(step.runningTotal)}
        </div>
      </div>
    </div>
  );
}

function HoldBackRow({ item }) {
  const names = (item.sittingOut ?? []).map(s => `${s.pilotName} (${s.shipClass})`).join(' · ');
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-blue-950/20 border-y border-blue-600/30">
      <span className="text-slate-400 text-xs font-mono w-5 text-center shrink-0 mt-0.5">—</span>
      <span className="text-blue-400 text-base shrink-0 mt-0.5">⏸</span>
      <div className="flex-1 min-w-0">
        <div className="text-blue-300 text-sm font-semibold">Hold Back — subset pass</div>
        <div className="text-slate-400 text-xs mt-0.5 leading-relaxed">{item.reason}</div>
        {names && (
          <div className="text-slate-500 text-xs mt-1">Sitting out: {names}</div>
        )}
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

function StandingByRow({ item }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/40 border-y border-slate-700/30">
      <span className="text-slate-600 text-xs font-mono w-5 text-center shrink-0">—</span>
      <span className="text-slate-600 text-base shrink-0">⏳</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-sm font-medium">{item.ship.pilotName}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-500 font-bold">STANDBY</span>
        </div>
        <div className="text-slate-600 text-xs mt-0.5">
          {item.ship.shipClass}{item.ship.shipName ? ` — ${item.ship.shipName}` : ''}
        </div>
        {item.reason && (
          <div className="text-slate-700 text-xs mt-0.5 italic">{item.reason}</div>
        )}
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

const STATE_TRANSITION_CFG = {
  reduced: {
    icon: '🟡',
    label: 'Wormhole Expected Reduced',
    description: 'Visually smaller — approx. 50% mass consumed',
    cls: 'bg-amber-950/20 border-amber-500/30 text-amber-300',
    descCls: 'text-amber-400/60',
  },
  critical: {
    icon: '🔴',
    label: 'Wormhole Expected Critical',
    description: 'Flashing — approx. 90% mass consumed',
    cls: 'bg-red-950/20 border-red-500/30 text-red-300',
    descCls: 'text-red-400/60',
  },
};

function StateTransitionRow({ transition }) {
  const cfg = STATE_TRANSITION_CFG[transition];
  if (!cfg) return null;
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-y ${cfg.cls}`}>
      <span className="text-xs font-mono w-5 text-center shrink-0">—</span>
      <span className="text-base shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${cfg.cls.split(' ').pop()}`}>{cfg.label}</div>
        <div className={`text-xs mt-0.5 ${cfg.descCls}`}>
          {cfg.description} · actual timing may vary ±10%
        </div>
      </div>
    </div>
  );
}

/**
 * Compute where mass state transitions occur in the plan.
 * Returns a Map of item.id → transition name ('reduced'|'critical') to show BEFORE that item.
 *
 * Thresholds:
 *   Fresh → Reduced:  runningTotal crosses 50% of totalMass
 *   Reduced → Critical: runningTotal crosses 90% of totalMass
 *
 * Accounts for initialMassState — if already reduced, skip the reduced marker.
 */
function computeStateTransitions(items, totalMass, initialMassState) {
  const markers = new Map();
  const reducedThreshold  = Math.round(totalMass * 0.5);
  const criticalThreshold = Math.round(totalMass * 0.9);

  let needsReduced  = initialMassState === 'fresh';
  let needsCritical = initialMassState !== 'critical';

  // Track previous step's runningTotal
  let prevRunning = 0;
  // Find the first step to get the starting runningTotal (before any jumps)
  for (const item of items) {
    if (item.type === 'step') {
      prevRunning = item.runningTotal - item.massThisJump;
      break;
    }
  }

  for (const item of items) {
    if (item.type !== 'step') continue;

    if (needsReduced && prevRunning < reducedThreshold && item.runningTotal >= reducedThreshold) {
      markers.set(item.id, 'reduced');
      needsReduced = false;
    } else if (needsCritical && prevRunning < criticalThreshold && item.runningTotal >= criticalThreshold) {
      markers.set(item.id, 'critical');
      needsCritical = false;
    }

    prevRunning = item.runningTotal;
  }

  return markers;
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
  const canReachGoal = plan.canReachGoal;

  const validation = validatePlan(plan, wormhole);
  const planIsBlocked = !validation.valid;

  const initialMassState = plan.initialMassState ?? 'fresh';
  const stateTransitions = computeStateTransitions(annotated, wormhole.totalMass, initialMassState);

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
            {initialMassState !== 'fresh' && (
              <span className={initialMassState === 'critical' ? 'text-red-400 ml-1' : 'text-amber-400 ml-1'}>
                · Starting {INITIAL_MASS_STATES[initialMassState].label}
              </span>
            )}
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
          {stateTransitions.size > 0 && (
            <div className="mt-2 text-slate-600 text-xs leading-relaxed">
              State markers below show where the wormhole is expected to change visually. These are approximations — actual mass is never known exactly (±10% variance on each jump).
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
              const transition = stateTransitions.get(item.id);
              const rows = [];
              if (transition) {
                rows.push(<StateTransitionRow key={`trans-${item.id}`} transition={transition} />);
              }
              if (item.type === 'step') {
                const idx = stepIndex++;
                rows.push(<StepRow key={item.id} step={item} index={idx} goal={goal} />);
              } else if (item.type === 'hold-back') {
                rows.push(<HoldBackRow        key={item.id} item={item} />);
              } else if (item.type === 'assessment') {
                rows.push(<AssessmentRow      key={item.id} item={item} />);
              } else if (item.type === 'doorstop-marker') {
                rows.push(<DoorstopMarkerRow  key={item.id} item={item} />);
              } else if (item.type === 'outcome') {
                rows.push(<OutcomeRow         key={item.id} item={item} />);
              } else if (item.type === 'standing-by') {
                rows.push(<StandingByRow      key={item.id} item={item} />);
              }
              return rows;
            })}
          </div>
        </div>

        {/* Safety validation panel — shown when plan has risks */}
        {validation.warnings.length > 0 && (
          <div className="rounded-2xl border border-red-500/50 bg-red-950/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-red-500/30 flex items-center gap-2">
              <span className="text-red-400 text-base">🚨</span>
              <span className="text-red-300 text-sm font-bold uppercase tracking-wide">Safety Warning — No Pilot Left Behind</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {validation.warnings.map((w, i) => (
                <div key={i} className="text-red-200 text-xs leading-relaxed">{w}</div>
              ))}
            </div>
            {validation.recommendation && (
              <div className="px-4 py-3 border-t border-red-500/20 bg-red-950/10">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Recommended Fixes</div>
                {validation.recommendation.split('\n').map((line, i) => (
                  <div key={i} className="text-slate-300 text-xs leading-relaxed mb-1">{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Optional feedback — shown before starting the roll */}
        <FeedbackForm context="rolling-plan" wormholeType={wormhole.type} />

        {/* Start button — hidden (not just disabled) when plan is unsafe */}
        {planIsBlocked || !canReachGoal ? (
          <div className="w-full py-4 rounded-xl text-center text-sm font-semibold text-slate-600 bg-slate-800 border border-slate-700 cursor-not-allowed select-none">
            {!canReachGoal
              ? '⚠ Cannot reach goal — add more ships'
              : '🚫 Plan blocked — fix safety warnings above before starting'
            }
          </div>
        ) : (
          <button
            onClick={() => onStart(plan.items)}
            disabled={annotated.length === 0}
            className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors text-lg"
          >
            Start {goalCfg.shortLabel} Run →
          </button>
        )}
      </div>
    </div>
  );
}
