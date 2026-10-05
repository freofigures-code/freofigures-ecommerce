import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import B2BProduct from './B2BProduct.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><B2BProduct /></StrictMode>);
