import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthBootstrap } from './components/AuthBootstrap';
import './index.css';

// AuthBootstrap is wired in main.tsx (not App.tsx) so App stays
// testable in isolation without needing Supabase env vars at module load.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthBootstrap>
      <App />
    </AuthBootstrap>
  </React.StrictMode>,
);
