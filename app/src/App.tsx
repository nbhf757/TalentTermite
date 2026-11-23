import DrawingScreen from './screens/DrawingScreen';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Talent</span>
        <span className="sub">Inspection &amp; Proposal</span>
      </header>
      <main>
        <DrawingScreen />
      </main>
    </div>
  );
}
