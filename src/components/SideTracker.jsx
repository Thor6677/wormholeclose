/**
 * SideTracker — shows which pilots are currently HOME vs IN THE HOLE.
 * Computes locations by replaying steps[0..currentStepIndex-1].
 */
export default function SideTracker({ fleet, steps, currentStepIndex }) {
  // Start everyone at home
  const loc = {};
  fleet.forEach(s => (loc[s.id] = 'home'));

  // Replay completed steps to track locations
  for (let i = 0; i < currentStepIndex && i < steps.length; i++) {
    const step = steps[i];
    if (!step?.ship) continue;
    loc[step.ship.id] = step.direction === 'in' ? 'hole' : 'home';
  }

  const home   = fleet.filter(s => loc[s.id] === 'home');
  const inHole = fleet.filter(s => loc[s.id] === 'hole');

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="bg-slate-800 rounded-xl p-3 border border-emerald-500/20">
        <div className="text-emerald-400 font-semibold uppercase text-xs tracking-wider mb-2">
          Home ({home.length})
        </div>
        <div className="space-y-1">
          {home.map(s => (
            <div key={s.id} className="text-slate-300 truncate text-xs leading-5">
              {s.pilotName}
            </div>
          ))}
          {home.length === 0 && (
            <div className="text-slate-600 italic text-xs">none</div>
          )}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-3 border border-amber-500/30">
        <div className="text-amber-400 font-semibold uppercase text-xs tracking-wider mb-2">
          In Hole ({inHole.length})
        </div>
        <div className="space-y-1">
          {inHole.map(s => (
            <div key={s.id} className="text-slate-300 truncate text-xs leading-5">
              {s.pilotName}
            </div>
          ))}
          {inHole.length === 0 && (
            <div className="text-slate-600 italic text-xs">none</div>
          )}
        </div>
      </div>
    </div>
  );
}
