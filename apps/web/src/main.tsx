import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error("Le point de montage d'Alfred est introuvable.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
