import { useState } from 'react';
import { SHIP_CLASSES, GOALS, formatMass } from '../rollingEngine.js';

const CLASS_LIST = Object.keys(SHIP_CLASSES);
let _shipId = 1;
function newId() { return `ship-${_shipId++}`; }

function blankForm(cls = 'Battleship') {
  return {
    pilotName: '',
    shipName:  '',
    shipClass: cls,
    hotMass:   SHIP_CLASSES[cls].hotMass,
    coldMass:  SHIP_CLASSES[cls].coldMass,
  };
}

export default function FleetSetup({ wormhole, fleet, setFleet, goal, onGoalChange, onGenerate, onBack }) {
  const [form,   setForm]   = useState(blankForm());
  const [editId, setEditId] = useState(null);
  const [error,  setError]  = useState('');

  function handleClassChange(cls) {
    setForm(f => ({
      ...f,
      shipClass: cls,
      hotMass:   SHIP_CLASSES[cls].hotMass,
      coldMass:  SHIP_CLASSES[cls].coldMass,
    }));
  }

  function handleMassInput(field, raw) {
    // User enters M-kg value; store as file units (multiply by 1000)
    const m = parseFloat(raw) || 0;
    setForm(f => ({ ...f, [field]: Math.round(m * 1000) }));
  }

  function handleAddOrUpdate() {
    if (!form.pilotName.trim()) { setError('Pilot name is required.'); return; }
    setError('');
    if (editId) {
      setFleet(fl => fl.map(s => s.id === editId ? { ...form, id: editId } : s));
      setEditId(null);
    } else {
      setFleet(fl => [...fl, { ...form, id: newId() }]);
    }
    setForm(blankForm(form.shipClass));
  }

  function handleEdit(ship) {
    setEditId(ship.id);
    setForm({
      pilotName: ship.pilotName,
      shipName:  ship.shipName,
      shipClass: ship.shipClass,
      hotMass:   ship.hotMass,
      coldMass:  ship.coldMass,
    });
    setError('');
  }

  function handleCancel() {
    setEditId(null);
    setForm(blankForm());
    setError('');
  }

  function handleRemove(id) {
    setFleet(fl => fl.filter(s => s.id !== id));
    if (editId === id) handleCancel();
  }

  const coldOver = form.coldMass > wormhole.maxIndividualMass;
  const hotOver  = form.hotMass  > wormhole.maxIndividualMass;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-8">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-100 text-xl leading-none p-1">
          ←
        </button>
        <div>
          <h2 className="text-lg font-bold text-cyan-400">{wormhole.type} — Fleet Setup</h2>
          <p className="text-slate-500 text-xs">
            Per-jump limit: {formatMass(wormhole.maxIndividualMass)} · Max mass: {formatMass(wormhole.totalMass)}
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">

        {/* Add / Edit form */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {editId ? 'Edit Ship' : 'Add Ship'}
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Pilot name *"
              value={form.pilotName}
              onChange={e => setForm(f => ({ ...f, pilotName: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              placeholder="Ship name (optional)"
              value={form.shipName}
              onChange={e => setForm(f => ({ ...f, shipName: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <select
              value={form.shipClass}
              onChange={e => handleClassChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {CLASS_LIST.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>

            {/* Mass inputs — shown in M-kg */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Hot mass (M kg)</label>
                <input
                  type="number"
                  min="0"
                  value={Math.round(form.hotMass / 1000)}
                  onChange={e => handleMassInput('hotMass', e.target.value)}
                  className={`w-full bg-slate-900 border rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none ${hotOver ? 'border-amber-500' : 'border-slate-700 focus:border-cyan-500'}`}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Cold mass (M kg)</label>
                <input
                  type="number"
                  min="0"
                  value={Math.round(form.coldMass / 1000)}
                  onChange={e => handleMassInput('coldMass', e.target.value)}
                  className={`w-full bg-slate-900 border rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none ${coldOver ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'}`}
                />
              </div>
            </div>

            {/* Per-ship warnings */}
            {coldOver && (
              <div className="text-red-400 text-xs flex items-center gap-1">
                ✕ Cold mass exceeds jump limit — cannot use this wormhole
              </div>
            )}
            {!coldOver && hotOver && (
              <div className="text-amber-400 text-xs flex items-center gap-1">
                ⚠ Hot mass exceeds jump limit — will jump cold on inbound
              </div>
            )}
            {error && <div className="text-red-400 text-xs">{error}</div>}

            <div className="flex gap-2">
              <button
                onClick={handleAddOrUpdate}
                className="flex-1 py-2.5 rounded-xl font-semibold bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 transition-colors"
              >
                {editId ? 'Update' : '+ Add Ship'}
              </button>
              {editId && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl text-slate-400 border border-slate-700 hover:text-slate-100 hover:border-slate-500 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Roster */}
        {fleet.length > 0 && (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Fleet Roster
              </h3>
              <span className="text-xs text-slate-500">{fleet.length} ship{fleet.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-slate-700/60">
              {fleet.map(ship => {
                const isOver = ship.coldMass > wormhole.maxIndividualMass;
                return (
                  <div
                    key={ship.id}
                    className={`flex items-center gap-2 px-4 py-3 ${isOver ? 'bg-red-950/20' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-100 font-medium truncate">{ship.pilotName}</span>
                        {isOver && (
                          <span className="text-xs text-red-400 shrink-0">✕ can't fit</span>
                        )}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">
                        {ship.shipClass}
                        {ship.shipName ? ` — ${ship.shipName}` : ''}
                        <span className="ml-2 text-slate-600">
                          {formatMass(ship.hotMass)}H / {formatMass(ship.coldMass)}C
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEdit(ship)}
                      className="text-slate-500 hover:text-cyan-400 p-1.5 transition-colors"
                      aria-label="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleRemove(ship.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 transition-colors"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Goal selector */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Rolling Goal
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {Object.entries(GOALS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => onGoalChange(key)}
                className={`py-2.5 px-2 rounded-xl text-sm font-semibold transition-colors text-center ${
                  goal === key
                    ? 'bg-cyan-500 text-slate-900'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
              >
                {config.shortLabel}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{GOALS[goal].description}</p>
        </div>

        {/* Generate */}
        <button
          onClick={onGenerate}
          disabled={fleet.length === 0}
          className="w-full py-4 rounded-xl font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors text-lg"
        >
          Generate Rolling Plan →
        </button>
      </div>
    </div>
  );
}
