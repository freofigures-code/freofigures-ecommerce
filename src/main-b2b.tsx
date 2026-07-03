import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BApp from './BApp.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BApp />
  </StrictMode>,
);
