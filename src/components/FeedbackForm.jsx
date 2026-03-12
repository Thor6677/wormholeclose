import { useState } from 'react';

const FEEDBACK_TYPES = [
  { value: 'bug',        label: 'Bug Report',  icon: '🐛' },
  { value: 'suggestion', label: 'Suggestion',  icon: '💡' },
  { value: 'question',   label: 'Question',    icon: '❓' },
  { value: 'other',      label: 'Other',       icon: '📝' },
];

function loadFeedback() {
  try {
    return JSON.parse(localStorage.getItem('wh-feedback') ?? '[]');
  } catch {
    return [];
  }
}

function saveFeedback(entry) {
  const existing = loadFeedback();
  existing.push(entry);
  localStorage.setItem('wh-feedback', JSON.stringify(existing));
}

/**
 * FeedbackForm — optional collapsible feedback panel.
 *
 * Props:
 *   context        — 'rolling-plan' | 'post-execution'  (stored with entry)
 *   wormholeType   — e.g. 'C4' (stored with entry, optional)
 *   defaultOpen    — whether to start expanded (default false)
 */
export default function FeedbackForm({ context, wormholeType, defaultOpen = false }) {
  const [open,      setOpen]      = useState(defaultOpen);
  const [type,      setType]      = useState('bug');
  const [message,   setMessage]   = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState('');

  function handleSubmit() {
    if (!message.trim()) {
      setError('Please describe the issue before submitting.');
      return;
    }
    setError('');

    const entry = {
      id:            `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp:     new Date().toISOString(),
      context,
      wormholeType:  wormholeType ?? null,
      type,
      message:       message.trim(),
    };

    saveFeedback(entry);
    setSubmitted(true);
  }

  function handleReset() {
    setType('bug');
    setMessage('');
    setSubmitted(false);
    setError('');
    setOpen(false);
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <span className="text-sm font-medium text-slate-300">Submit Feedback</span>
          <span className="text-xs text-slate-500">optional</span>
        </div>
        <span className={`text-slate-500 text-sm transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-slate-700 px-4 pb-4 pt-3 space-y-3">
          {submitted ? (
            <div className="text-center py-3 space-y-2">
              <div className="text-2xl">✅</div>
              <div className="text-emerald-400 text-sm font-semibold">Feedback submitted — thank you!</div>
              <div className="text-slate-500 text-xs">
                Saved locally. Use the export button in settings to share with the developer.
              </div>
              <button
                onClick={handleReset}
                className="mt-2 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
              >
                Submit another
              </button>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div className="flex gap-2 flex-wrap">
                {FEEDBACK_TYPES.map(ft => (
                  <button
                    key={ft.value}
                    onClick={() => setType(ft.value)}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                      type === ft.value
                        ? 'bg-cyan-900/50 border-cyan-500/60 text-cyan-300'
                        : 'bg-slate-700/50 border-slate-600/40 text-slate-400 hover:text-slate-200 hover:border-slate-500',
                    ].join(' ')}
                  >
                    <span>{ft.icon}</span>
                    <span>{ft.label}</span>
                  </button>
                ))}
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setError(''); }}
                placeholder={
                  type === 'bug'        ? 'Describe what happened and what you expected...' :
                  type === 'suggestion' ? 'Describe your idea or improvement...' :
                  type === 'question'   ? 'What would you like to know?' :
                                         'Your feedback...'
                }
                rows={3}
                className="w-full bg-slate-900/60 border border-slate-600/50 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/60 transition-colors"
              />

              {error && (
                <div className="text-red-400 text-xs">{error}</div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 transition-colors"
              >
                Submit Feedback
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Export all stored feedback as a formatted JSON string (for pasting to Claude).
 * Used by the dev to review submissions.
 */
export function exportFeedback() {
  return JSON.stringify(loadFeedback(), null, 2);
}

/**
 * Clear all stored feedback (use after reviewing).
 */
export function clearFeedback() {
  localStorage.removeItem('wh-feedback');
}
