// Client entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { Providers } from './app/providers';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppUpdateNotice } from './app/AppUpdateNotice';
import './app/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <Providers>
          <App />
        </Providers>
        <AppUpdateNotice />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
