import { useEffect, useMemo, useState } from 'react';
import DrawingScreen, { newSection } from './screens/DrawingScreen';
import InspectionScreen from './screens/InspectionScreen';
import WorkScreen, { emptyWork, type Work } from './screens/WorkScreen';
import { totals, type Section } from './lib/footprint';
import type { Answers } from './lib/inspection';
import { bundledBook, loadPriceBook, type PriceBook } from './lib/priceBook';
import { suggest } from './lib/suggestions';
import './App.css';

const STEPS = ['Drawing', 'Inspection', 'Work'] as const;
type Step = (typeof STEPS)[number];

export default function App() {
  const [step, setStep] = useState<Step>('Drawing');
  const [sections, setSections] = useState<Section[]>(() => [newSection(1)]);
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState('');
  const [work, setWork] = useState<Work>(emptyWork);
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
        {step === 'Drawing' && <DrawingScreen sections={sections} setSections={setSections} />}
        {step === 'Inspection' && (
          <InspectionScreen answers={answers} onChange={setAnswers} comments={comments} onComments={setComments} />
        )}
        {step === 'Work' && (
          <WorkScreen book={book} totals={sum} suggestions={suggestions} work={work} onChange={setWork} />
        )}
      </main>
    </div>
  );
}
