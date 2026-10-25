import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { initializeGlobalTelemetryListeners } from './services/telemetry';
import './index.css';

initializeGlobalTelemetryListeners();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
