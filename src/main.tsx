// RENDERER ENTRY — plain React, nothing Electron-specific.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

// StrictMode runs effects twice in development (mount → unmount → mount).
// That's on purpose: it exposes subscriptions that never clean up, which in
// Electron means IPC listeners piling up. Our hooks return cleanup functions.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
