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
import './App.css';

const STEPS = ['Customer', 'Drawing', 'Inspection', 'Work', 'Proposal'] as const;
type Step = (typeof STEPS)[number];

export default function App() {
  const [step, setStep] = useState<Step>('Customer');
  const [sections, setSections] = useState<Section[]>(() => [newSection(1)]);
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState('');
  const [work, setWork] = useState<Work>(emptyWork);
  const [brand, setBrand] = useState<Brand>('talent_foundation');
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [signoff, setSignoff] = useState<Signoff>(emptySignoff);
  const [book, setBook] = useState<PriceBook>(bundledBook);

  useEffect(() => { loadPriceBook().then(setBook); }, []);
  const sum = useMemo(() => totals(sections), [sections]);
  const suggestions = useMemo(() => suggest(answers), [answers]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Talent</span>
        <span className="sub">Inspection &amp; Proposal</span>
      </header>
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
