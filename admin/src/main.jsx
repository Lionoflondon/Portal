import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from '@portal/admin/AdminApp.jsx';
import '@portal/admin/admin.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
