import { useEffect, useMemo, useState } from 'react';
import DrawingScreen, { newSection } from './screens/DrawingScreen';
import InspectionScreen from './screens/InspectionScreen';
import WorkScreen, { emptyWork, type Work } from './screens/WorkScreen';
import CustomerScreen, { emptyCustomer, type Brand, type Customer } from './screens/CustomerScreen';
import ProposalScreen, { emptySignoff, type Signoff } from './screens/ProposalScreen';
import { totals, type Section } from './lib/footprint';
import type { Answers } from './lib/inspection';
import { bundledBook, loadPriceBook, type PriceBook } from './lib/priceBook';
import { suggest } from './lib/suggestions';
import { clearDraft, loadDraft, saveDraft } from './lib/draft';
import { supabase } from './lib/supabase';
import SignIn, { useSession } from './components/SignIn';
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
  const [showSignIn, setShowSignIn] = useState(false);
  const session = useSession();

  useEffect(() => {
    saveDraft<Draft>({ step, sections, answers, comments, work, brand, customer, signoff });
  }, [step, sections, answers, comments, work, brand, customer, signoff]);

  const startNew = () => {
    if (!window.confirm('Start a new proposal? The current one will be cleared from this device.')) return;
    const d = freshDraft(); clearDraft();
    setStep(d.step); setSections(d.sections); setAnswers(d.answers); setComments(d.comments);
    setWork(d.work); setBrand(d.brand); setCustomer(d.customer); setSignoff(d.signoff);
  };
  const [book, setBook] = useState<PriceBook>(bundledBook);

  useEffect(() => { loadPriceBook().then(setBook); }, [session]); // reload live prices after sign-in
  const sum = useMemo(() => totals(sections), [sections]);
  const suggestions = useMemo(() => suggest(answers), [answers]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Talent</span>
        <span className="sub">Inspection &amp; Proposal</span>
        <span className="top-actions">
          <button className="top-btn" onClick={startNew}>New</button>
          {supabase && (session
            ? <button className="top-btn" title={session.user.email} onClick={() => supabase!.auth.signOut()}>Sign out</button>
            : <button className="top-btn" onClick={() => setShowSignIn(true)}>Sign in</button>)}
        </span>
      </header>
      {showSignIn && !session && <div style={{ padding: '12px 16px 0' }}><SignIn onDone={() => setShowSignIn(false)} /></div>}
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
          <ProposalScreen brand={brand} customer={customer} book={book} totals={sum} work={work} suggestions={suggestions}
            comments={comments} signoff={signoff} onSignoff={setSignoff} />
        )}
      </main>
    </div>
  );
}
