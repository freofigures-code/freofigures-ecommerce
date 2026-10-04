import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import B2BAccount from './B2BAccount.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><B2BAccount /></StrictMode>,
);
