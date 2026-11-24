import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DrawingScreen, { newSection } from './screens/DrawingScreen';
import InspectionScreen from './screens/InspectionScreen';
import WorkScreen, { emptyWork, type Work } from './screens/WorkScreen';
import CustomerScreen, { emptyCustomer, type Brand, type Customer } from './screens/CustomerScreen';
import ProposalScreen, { emptySignoff, type Signoff } from './screens/ProposalScreen';
import { totals, type Section } from './lib/footprint';
import type { Answers } from './lib/inspection';
import { emptyBook, loadPriceBook, type PriceBook } from './lib/priceBook';
import { suggest } from './lib/suggestions';
import { clearDraft, loadDraft, saveDraft } from './lib/draft';
import { supabase } from './lib/supabase';
import SignIn, { ALLOWED_DOMAIN, isAllowedEmail, useSession } from './components/SignIn';
import { buildSubmission, submitProposal } from './lib/submit';
import PriceEditor from './screens/PriceEditor';
import OpenProposals from './screens/OpenProposals';
import MaterialsEditor from './screens/MaterialsEditor';
import type { OpenRow } from './lib/openProposals';
import './App.css';

const STEPS = ['Customer', 'Drawing', 'Inspection', 'Work', 'Proposal'] as const;
type Step = (typeof STEPS)[number];

type Draft = {
  step: Step; sections: Section[]; answers: Answers; comments: string; work: Work;
  brand: Brand; customer: Customer; signoff: Signoff;
};
const freshDraft = (): Draft => ({
  step: 'Customer', sections: [newSection(1)], answers: {}, comments: '', work: emptyWork(),
  brand: 'talent_foundation', customer: emptyCustomer(), signoff: emptySignoff(),
});

export default function App() {
  const [init] = useState<Draft>(() => ({ ...freshDraft(), ...(loadDraft<Draft>() ?? {}) }));
  const [step, setStep] = useState<Step>(init.step);
  const [sections, setSections] = useState<Section[]>(init.sections);
  const [answers, setAnswers] = useState<Answers>(init.answers);
  const [comments, setComments] = useState(init.comments);
  const [work, setWork] = useState<Work>(init.work);
  const [brand, setBrand] = useState<Brand>(init.brand);
  const [customer, setCustomer] = useState<Customer>(init.customer);
  const [signoff, setSignoff] = useState<Signoff>(init.signoff);
  const session = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingPrices, setEditingPrices] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [editingMaterials, setEditingMaterials] = useState(false);
  useEffect(() => {
    if (!session || !supabase) { setIsAdmin(false); return; }
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(data?.role === 'admin'));
  }, [session]);

  useEffect(() => {
    saveDraft<Draft>({ step, sections, answers, comments, work, brand, customer, signoff });
  }, [step, sections, answers, comments, work, brand, customer, signoff]);

  const unsent = (signoff.signedAt && signoff.save?.status !== 'saved') || (!signoff.signedAt && signoff.unsigned?.status !== 'saved' && work.lines.length > 0);
  const load = (d: Draft) => {
    setStep(d.step); setSections(d.sections); setAnswers(d.answers); setComments(d.comments);
    setWork(d.work); setBrand(d.brand); setCustomer(d.customer); setSignoff(d.signoff);
  };
  const startNew = () => {
    if (!window.confirm(unsent
      ? 'This proposal has NOT been saved to the office. Clearing it loses it. Start a new proposal anyway? (Use "Save, not signed yet" on the Proposal step to keep it.)'
      : 'Start a new proposal? The current one will be cleared from this device.')) return;
    clearDraft(); load(freshDraft());
  };
  // Reopen a saved, unsigned proposal so the customer can sign it. Saving or signing updates the same proposal.
  const reopen = (r: OpenRow) => {
    if (unsent && !window.confirm('The proposal on this device has NOT been saved to the office. Opening another one replaces it. Continue?')) return;
    const d = r.app_draft as Partial<Draft>;
    load({
      ...freshDraft(), ...d, step: 'Proposal',
      signoff: { ...emptySignoff(), clientRef: r.client_ref ?? undefined, unsigned: { status: 'saved', number: r.number, at: r.updated_at ?? r.sent_at ?? '' } },
    });
    setShowOpen(false);
  };
  const [book, setBook] = useState<PriceBook>(emptyBook);

  useEffect(() => { if (session) loadPriceBook().then(setBook); }, [session]); // reload live prices after sign-in
  const sum = useMemo(() => totals(sections), [sections]);
  const suggestions = useMemo(() => suggest(answers), [answers]);

  // Send a signed proposal to the office; retried on sign-in, coming back online, and "Try now".
  const sending = useRef(false);
  const trySend = useCallback(async () => {
    const so = signoff;
    if (!so.signedAt || !so.customerSig || !so.repSig || !so.clientRef || so.save?.status === 'saved' || sending.current) return;
    sending.current = true;
    setSignoff({ ...so, save: { status: 'sending' } });
    try {
      const payload = buildSubmission({
        brand, customer, book, totals: sum, work, suggestions, comments, method: so.method,
        clientRef: so.clientRef, sections, answers, customerSig: so.customerSig, repSig: so.repSig, signedAt: so.signedAt,
      });
      const r = await submitProposal(payload);
      setSignoff({ ...so, save: { status: 'saved', number: r.number, emailed: r.emailed, emailNote: r.email_note, frNote: r.fr?.note, frTasks: r.fr?.task_ids?.length, frDoc: !!r.fr?.document_id } });
    } catch (e) {
      setSignoff({ ...so, save: { status: 'waiting', note: (e as Error).message } });
    } finally { sending.current = false; }
  }, [signoff, brand, customer, book, sum, work, suggestions, comments, sections, answers]);

  const saveUnsigned = useCallback(async (emailToSign = false) => {
    const so = { ...signoff, clientRef: signoff.clientRef ?? crypto.randomUUID() };
    setSignoff({ ...so, unsigned: { status: 'sending', email: emailToSign } });
    try {
      const r = await submitProposal({ ...buildSubmission({
        brand, customer, book, totals: sum, work, suggestions, comments, method: so.method,
        clientRef: so.clientRef, sections, answers, customerSig: null, repSig: null, signedAt: null,
      }), email_to_sign: emailToSign });
      setSignoff({ ...so, unsigned: { status: 'saved', number: r.number, at: new Date().toISOString(), frNote: r.fr?.note, frDoc: !!r.fr?.document_id,
        emailedTo: r.sign_emailed ? customer.email : undefined, emailNote: emailToSign ? r.sign_note : undefined } });
    } catch (e) {
      setSignoff({ ...so, unsigned: { status: 'error', note: (e as Error).message } });
    }
  }, [signoff, brand, customer, book, sum, work, suggestions, comments, sections, answers]);

  const waiting = !!signoff.signedAt && signoff.save?.status !== 'saved' && signoff.save?.status !== 'sending';
  useEffect(() => { if (waiting && session) trySend(); }, [waiting, session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => { if (waiting) trySend(); };
    window.addEventListener('online', on); return () => window.removeEventListener('online', on);
  }, [waiting, trySend]);

  if (session === undefined) return <div className="app" />; // checking the saved login
  if (!session || !isAllowedEmail(session.user.email)) return (
    <div className="app">
      <header className="topbar"><span className="brand">Talent</span><span className="sub">Inspection &amp; Proposal</span></header>
      <div style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
        {session && <p className="warn small">Only {ALLOWED_DOMAIN} accounts can use this app. <button className="link" onClick={() => supabase!.auth.signOut()}>Sign out</button></p>}
        <SignIn />
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Talent</span>
        <span className="sub">Inspection &amp; Proposal</span>
        <span className="top-actions">
          <button className="top-btn" onClick={startNew}>New</button>
          <button className="top-btn" onClick={() => { setEditingPrices(false); setEditingMaterials(false); setShowOpen(!showOpen); }}>Open</button>
          {isAdmin && <button className="top-btn" onClick={() => { setShowOpen(false); setEditingMaterials(false); setEditingPrices(true); }}>Prices</button>}
          <button className="top-btn" title={session.user.email} onClick={() => supabase!.auth.signOut()}>Sign out</button>
        </span>
      </header>
      {showOpen ? <main><OpenProposals onOpen={reopen} onClose={() => setShowOpen(false)} /></main>
      : editingMaterials ? <main><MaterialsEditor onClose={() => setEditingMaterials(false)} /></main>
      : editingPrices ? <main><PriceEditor onClose={() => { setEditingPrices(false); loadPriceBook().then(setBook); }}
          onMaterials={() => { setEditingPrices(false); setEditingMaterials(true); }} /></main> : <>
      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={s === step ? 'step active' : 'step'} onClick={() => setStep(s)}>{i + 1}. {s}</button>
        ))}
      </nav>
      <main>
        {step === 'Customer' && <CustomerScreen brand={brand} onBrand={setBrand} customer={customer} onChange={setCustomer} />}
        {step === 'Drawing' && <DrawingScreen sections={sections} setSections={setSections} />}
        {step === 'Inspection' && (
          <InspectionScreen answers={answers} onChange={setAnswers} comments={comments} onComments={setComments} />
        )}
        {step === 'Work' && (
          <WorkScreen book={book} totals={sum} suggestions={suggestions} work={work} onChange={setWork} />
        )}
        {step === 'Proposal' && (
          <ProposalScreen brand={brand} customer={customer} book={book} totals={sum} work={work} suggestions={suggestions} answers={answers}
            comments={comments} signoff={signoff} onSignoff={setSignoff} onRetry={trySend} onSaveUnsigned={saveUnsigned} />
        )}
      </main>
      </>}
    </div>
  );
}
