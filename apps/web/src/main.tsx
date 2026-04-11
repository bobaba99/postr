import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Auth is handled per-route via AuthGuard, not globally.
// Landing and Auth pages are public; Dashboard/Editor/Profile
// redirect to /auth if no session exists.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
