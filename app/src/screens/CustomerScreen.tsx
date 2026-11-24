import { useState } from 'react';
import { supabase } from '../lib/supabase';

export type Brand = 'talent_pest' | 'talent_foundation';
export const BRANDS: Record<Brand, string> = { talent_pest: 'Talent Pest Control', talent_foundation: 'Talent Foundation Solutions' };

export type Customer = {
  fr_customer_id: string | null;
  first_name: string; last_name: string; company: string;
  phone: string; email: string; address: string; city: string; state: string; zip: string;
};
export const emptyCustomer = (): Customer => ({
  fr_customer_id: null, first_name: '', last_name: '', company: '', phone: '', email: '',
  address: '', city: '', state: 'VA', zip: '',
});

export const customerReady = (c: Customer) => !!(c.last_name.trim() && c.address.trim() && (c.phone.trim() || c.email.trim()));

const FIELDS: [keyof Customer, string, string?][] = [
  ['first_name', 'First name'], ['last_name', 'Last name'], ['company', 'Company (optional)'],
  ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'],
  ['address', 'Street address'], ['city', 'City'], ['state', 'State'], ['zip', 'ZIP', 'numeric'],
];

export default function CustomerScreen({ brand, onBrand, customer, onChange }: {
  brand: Brand; onBrand: (b: Brand) => void; customer: Customer; onChange: (c: Customer) => void;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [results, setResults] = useState<Customer[]>([]);

  const search = async () => {
    if (!supabase) { setMsg('Search needs the app to be connected. Enter the customer below.'); return; }
    if (!navigator.onLine) { setMsg("You're offline. Enter the customer below; it will link to FieldRoutes later."); return; }
    setBusy(true); setMsg(''); setResults([]);
    const { data, error } = await supabase.functions.invoke('fr-customer-search', { body: { q } });
    setBusy(false);
    if (error) { setMsg("Couldn't search FieldRoutes right now. Enter the customer below."); return; }
    setResults(data.customers ?? []);
    if (!data.customers?.length) setMsg('No FieldRoutes match. Enter a new customer below.');
  };

  return (
    <div className="screen">
      <h2>Customer</h2>
      <div className="tabs">
        {(Object.keys(BRANDS) as Brand[]).map(b => (
          <button key={b} className={b === brand ? 'tab active' : 'tab'} onClick={() => onBrand(b)}>{BRANDS[b]}</button>
        ))}
      </div>

      <section className="card">
        <h3>Find in FieldRoutes</h3>
        <div className="row">
          <input style={{ flex: '1 1 200px' }} placeholder="Last name, phone, or street address" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && q.trim().length >= 3 && search()} />
          <button className="primary" disabled={busy || q.trim().length < 3} onClick={search}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
        {msg && <p className="muted small">{msg}</p>}
        {results.map(r => (
          <button key={r.fr_customer_id} className="result" onClick={() => { onChange(r); setResults([]); setMsg(''); }}>
            <strong>{r.first_name} {r.last_name}{r.company ? ` (${r.company})` : ''}</strong>
            <span className="muted small">{r.address}, {r.city} · {r.phone}</span>
          </button>
        ))}
      </section>

      <section className="card">
        <h3>{customer.fr_customer_id ? `FieldRoutes customer #${customer.fr_customer_id}` : 'New customer'}</h3>
        <div className="form-grid">
          {FIELDS.map(([k, label, mode]) => (
            <label key={k}>{label}
              <input value={customer[k] ?? ''} inputMode={mode === 'numeric' ? 'numeric' : undefined} type={mode === 'email' || mode === 'tel' ? mode : 'text'}
                onChange={e => onChange({ ...customer, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        {customer.fr_customer_id && (
          <button className="link" onClick={() => onChange({ ...customer, fr_customer_id: null })}>Unlink from FieldRoutes</button>
        )}
        {!customerReady(customer) && <p className="muted small">Last name, address, and a phone or email are required.</p>}
      </section>
    </div>
  );
}
