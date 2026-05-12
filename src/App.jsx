import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Planning from './pages/Planning';
import Admin from './pages/Admin';
import PlanningIntervenants from './pages/PlanningIntervenants';

import IntervenantPortal from './pages/IntervenantPortal';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/planning-equipe" element={<PlanningIntervenants />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/portail-intervenant" element={<IntervenantPortal />} />
      </Routes>
    </Router>
  );
}

export default App;
