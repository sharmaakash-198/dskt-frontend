import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReadinessPage } from './status/ReadinessPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <ReadinessPage />
  </StrictMode>,
);
