import { useState, useRef, useEffect } from 'react';
import { wormholes } from '../../data/wormholes.js';
import { formatMass } from '../rollingEngine.js';

const rollable = wormholes.filter(w => w.totalMass !== null && w.maxIndividualMass !== null);

export default function WormholeSelect({ onSelect }) {
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [open,     setOpen]     = useState(false);
  const inputRef = useRef(null);

  const filtered = rollable.filter(w => {
    const q = search.toLowerCase();
    return (
      w.type.toLowerCase().includes(q) ||
      (w.from || '').toLowerCase().includes(q) ||
      (w.to   || '').toLowerCase().includes(q)
    );
  }).slice(0, 40);

  function pick(wh) {
    setSelected(wh);
    setSearch(wh.type);
    setOpen(false);
  }

  function handleInput(e) {
    setSearch(e.target.value);
    setSelected(null);
    setOpen(true);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e) {
      if (!inputRef.current?.closest('.wh-select-root')?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Logo / heading */}
        <div className="mb-8 text-center">
          <div className="text-cyan-400 font-mono text-xs tracking-widest mb-2 uppercase">EVE Online</div>
          <h1 className="text-4xl font-bold text-slate-100 tracking-tight">WH Roller</h1>
          <p className="text-slate-500 mt-2 text-sm">Step-by-step wormhole collapse assistant</p>
        </div>

        {/* Search */}
        <div className="wh-select-root relative mb-4">
          <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2">
            Wormhole Type
          </label>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={handleInput}
            onFocus={() => setOpen(true)}
            placeholder="Search type, origin, destination…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
          />

          {open && filtered.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto">
              {filtered.map(wh => (
                <button
                  key={wh.type}
                  onMouseDown={() => pick(wh)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-slate-700/50 last:border-0 flex items-baseline gap-3 transition-colors"
                >
                  <span className="font-mono font-bold text-cyan-400 w-12 shrink-0">{wh.type}</span>
                  <span className="text-slate-400 text-sm truncate">
                    {wh.from || '?'} → {wh.to}
                  </span>
                  <span className="ml-auto text-slate-500 text-xs shrink-0">
                    {formatMass(wh.totalMass)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected WH details */}
        {selected && (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl font-mono font-bold text-cyan-400">{selected.type}</span>
              {selected.massRegeneration > 0 && (
                <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-full">
                  Regenerates
                </span>
              )}
            </div>
            <div className="text-slate-400 text-sm mb-4">
              {selected.from || 'Unknown'} → {selected.to || 'Unknown'}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Max Total Mass</div>
                <div className="text-2xl font-bold text-slate-100">{formatMass(selected.totalMass)}</div>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Per-Jump Limit</div>
                <div className="text-2xl font-bold text-slate-100">{formatMass(selected.maxIndividualMass)}</div>
              </div>
            </div>

            {selected.massRegeneration > 0 && (
              <div className="mt-3 text-amber-400 text-xs flex items-center gap-1">
                ⚠ Mass regeneration: {formatMass(selected.massRegeneration)} over time — roll promptly.
              </div>
            )}
            {selected.maxStableTime && (
              <div className="mt-2 text-slate-500 text-xs">
                Max stable time: {selected.maxStableTime}h
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors text-lg"
        >
          Next: Set Up Fleet →
        </button>
      </div>
    </div>
  );
}
