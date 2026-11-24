import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CustomerSign from './screens/CustomerSign.tsx'

// "Review and sign" links from the customer email open the customer page; everything else is the rep app.
const signToken = new URLSearchParams(window.location.search).get('sign')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {signToken ? <CustomerSign token={signToken} /> : <App />}
  </StrictMode>,
)
