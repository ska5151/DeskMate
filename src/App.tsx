import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainWindow from './pages/MainWindow';
import OverlayWindow from './pages/OverlayWindow';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/main" element={<MainWindow />} />
        <Route path="/overlay" element={<OverlayWindow />} />
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </HashRouter>
  );
}
