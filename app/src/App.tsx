import { useState } from 'react';
import DrawingScreen from './screens/DrawingScreen';
import InspectionScreen from './screens/InspectionScreen';
import type { Answers } from './lib/inspection';
import './App.css';

const STEPS = ['Drawing', 'Inspection'] as const;
type Step = (typeof STEPS)[number];

export default function App() {
  const [step, setStep] = useState<Step>('Drawing');
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState('');
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
        {/* Drawing keeps its own state for now; kept mounted so switching steps doesn't lose it. */}
        <div hidden={step !== 'Drawing'}><DrawingScreen /></div>
        {step === 'Inspection' && (
          <InspectionScreen answers={answers} onChange={setAnswers} comments={comments} onComments={setComments} />
        )}
      </main>
    </div>
  );
}
