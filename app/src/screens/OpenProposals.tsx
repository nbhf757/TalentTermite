import { useEffect, useState } from 'react';
import { ageDays, loadOpenProposals, markLost, STALE_DAYS, summarize, type OpenRow } from '../lib/openProposals';
import { money as $ } from '../lib/proposalDoc';

/** Saved, unsigned proposals, oldest first. Reopen one to get it signed, or mark it lost. */
export default function OpenProposals({ onOpen, onClose }: { onOpen: (r: OpenRow) => void; onClose: () => void }) {
  const [rows, setRows] = useState<OpenRow[] | null>(null);
  const [err, setErr] = useState('');
  const [losing, setLosing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = () => { setErr(''); loadOpenProposals().then(setRows).catch(e => setErr((e as Error).message)); };
  useEffect(load, []);

  const lose = async (id: string) => {
    try { await markLost(id, reason); setLosing(null); setReason(''); load(); }
    catch (e) { setErr((e as Error).message); }
  };

  const s = rows ? summarize(rows) : null;
  return (
    <div className="screen">
      <div className="row-between">
        <h2>Open proposals</h2>
        <button onClick={onClose}>Back</button>
      </div>
      {err && <p className="warn small">{navigator.onLine ? err : "You're offline. Open proposals load when you have signal."}</p>}
      {!rows && !err && <p className="muted">Loading…</p>}
      {s && (
        <p className="small">
          {s.count} open, {$(s.value)} total.{' '}
          {s.stale > 0 ? <strong className="warn-text">{s.stale} open more than {STALE_DAYS} days.</strong> : `None open more than ${STALE_DAYS} days.`}
        </p>
      )}
      {s && s.count === 0 && <p className="muted">No open proposals. Proposals saved with "Save, not signed yet" show up here.</p>}
      {s?.rows.map(r => {
        const age = ageDays(r.sent_at);
        return (
          <section key={r.id} className={`card open-row${age > STALE_DAYS ? ' stale' : ''}`}>
            <div className="row-between">
              <strong>#{r.number} {r.customer}</strong>
              <span>{$(r.total)}</span>
            </div>
            <div className="small muted">{r.address}</div>
            <div className="small">
              {r.rep && <>{r.rep} · </>}
              <span className={age > STALE_DAYS ? 'warn-text' : ''}>{age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} open`}</span>
            </div>
            <div className="chips">
              <button disabled={!r.app_draft} title={r.app_draft ? '' : 'Saved before reopening was available'} onClick={() => onOpen(r)}>
                Open to sign
              </button>
              <button onClick={() => { setLosing(losing === r.id ? null : r.id); setReason(''); }}>Mark lost</button>
            </div>
            {losing === r.id && (
              <div className="lost-box">
                <input placeholder="Why? (price, went with someone else, no answer…)" value={reason} onChange={e => setReason(e.target.value)} />
                <button className="primary" onClick={() => lose(r.id)}>Confirm lost</button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
