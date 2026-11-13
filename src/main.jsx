import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import OnlineCatalog from './OnlineCatalog.jsx';
import StaffLogin from './StaffLogin.jsx';
import './styles.css';
import './camera.css';
import './inventory.css';
import './storefront.css';
import './login.css';
import 'leaflet/dist/leaflet.css';
import './orders.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
document.title = pathname === '/login' ? 'Ingresar al sistema | Los Osman'
  : pathname === '/sistema' ? 'Sistema interno | Los Osman'
    : 'Catálogo online | Los Osman';
const page = pathname === '/sistema' ? <App />
  : pathname === '/login' ? <StaffLogin />
    : <OnlineCatalog />;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>{page}</React.StrictMode>,
);
