import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installConsoleCapture } from './lib/consoleCapture';
import { installInputModality } from './lib/inputModality';

// Capture recent console output so the Send Feedback flow can
// attach it to bug reports without asking users for screenshots.
installConsoleCapture();

// The house focus ring shows for keyboard navigation only (plan item 20):
// installed before anything renders, so its window listeners run first.
installInputModality();

// Auth is handled per-route via AuthGuard, not globally.
// Landing and Auth pages are public; Dashboard/Editor/Profile
// redirect to /auth if no session exists.
document.getElementById('prerendered-content')?.remove();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
