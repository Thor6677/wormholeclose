export default function MassProgressBar({ current, total, showLabel = true }) {
  const raw  = total > 0 ? (current / total) * 100 : 0;
  const pct  = Math.max(0, raw);
  const fill = Math.min(pct, 100);

  const color =
    pct < 60  ? 'bg-emerald-500' :
    pct < 80  ? 'bg-amber-400'   :
    pct < 100 ? 'bg-orange-500'  :
                'bg-red-500';

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-400">
          <span>Mass consumed</span>
          <span className={pct >= 100 ? 'text-red-400 font-semibold' : ''}>{Math.round(pct)}%</span>
        </div>
      )}
      <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}
