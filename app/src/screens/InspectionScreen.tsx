import { useState } from 'react';
import { isNegative, notesMissing, optionsFor, progress, SECTIONS, isAnswered, type Answers, type Point } from '../lib/inspection';

function PointRow({ p, answers, set }: { p: Point; answers: Answers; set: (k: string, v: string, note?: string) => void }) {
  const a = answers[p.key];
  const opts = optionsFor(p);
  const [showNote, setShowNote] = useState(!!a?.note);
  const negative = isNegative(p.key, a);
  const needNote = negative && !(a?.note ?? '').trim();
  return (
    <div className={`point${isAnswered(p, a) ? ' done' : ''}${negative ? ' negative' : ''}`}>
      <div className="point-label">{p.label}</div>
      <div className="point-answer">
        {opts ? opts.map(o => (
          <button key={o} className={a?.value === o ? 'opt active' : 'opt'} onClick={() => set(p.key, o, a?.note)}>{o}</button>
        )) : (
          <>
            <input inputMode="decimal" placeholder={p.type === 'inches' ? 'inches' : '%'} value={a?.value === 'N/A' ? '' : a?.value ?? ''}
              onChange={e => set(p.key, e.target.value, a?.note)} />
            {p.type === 'percent_or_na' && (
              <button className={a?.value === 'N/A' ? 'opt active' : 'opt'} onClick={() => set(p.key, 'N/A', a?.note)}>N/A</button>
            )}
          </>
        )}
        {!negative && <button className="opt note-btn" onClick={() => setShowNote(!showNote)} title="Add note">✎</button>}
      </div>
      {(showNote || negative) && (
        <textarea rows={negative ? 2 : 1} className={`point-note${needNote ? ' required' : ''}`} aria-required={negative}
          placeholder={negative ? 'Required: what you found, where, and how bad' : 'Note'}
          value={a?.note ?? ''} onChange={e => set(p.key, a?.value ?? '', e.target.value)} />
      )}
    </div>
  );
}

export default function InspectionScreen({ answers, onChange, comments, onComments }: {
  answers: Answers; onChange: (a: Answers) => void; comments: string; onComments: (c: string) => void;
}) {
  const prog = progress(answers);
  const set = (k: string, value: string, note?: string) => onChange({ ...answers, [k]: { value, note } });
  const missing = notesMissing(answers);
  return (
    <div className="screen">
      <h2>27-point inspection</h2>
      <p className="small muted">Take five wood moisture readings in the crawl space: front right, front left, rear right, rear left, and center.</p>
      <p className={prog.complete ? '' : 'warn'}>{prog.done} of {prog.total} points answered</p>
      {missing.length > 0 && <p className="small warn-text">{missing.length} finding{missing.length === 1 ? ' needs a note' : 's need notes'} (marked in orange).</p>}
      {SECTIONS.map(s => (
        <section key={s.key} className="insp-section">
          <h3>{s.title}</h3>
          {s.points.map(p => <PointRow key={p.key} p={p} answers={answers} set={set} />)}
        </section>
      ))}
      <label className="block">Other comments (optional)
        <textarea rows={3} value={comments} onChange={e => onComments(e.target.value)} placeholder="Anything else the customer should know" />
      </label>
    </div>
  );
}
