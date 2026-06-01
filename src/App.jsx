import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Planning from './pages/Planning';
import Admin from './pages/Admin';
import PlanningIntervenants from './pages/PlanningIntervenants';
import IntervenantPortal from './pages/IntervenantPortal';
import Login from './pages/Login';
import MentionsLegales from './pages/MentionsLegales';
import PolitiqueConfidentialite from './pages/PolitiqueConfidentialite';
import CGV from './pages/CGV';
import DevisValidate from './pages/DevisValidate';
import PaymentSuccess from './pages/PaymentSuccess';
import OccupantsCollect from './pages/OccupantsCollect';
import ReservationModify from './pages/ReservationModify';
import ReservationPay from './pages/ReservationPay';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/planning-equipe" element={<PlanningIntervenants />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/portail-intervenant" element={<IntervenantPortal />} />
        <Route path="/mentions-legales" element={<MentionsLegales />} />
        <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
        <Route path="/cgv" element={<CGV />} />
        <Route path="/admin-login" element={<Login />} />
        <Route path="/devis/validate" element={<DevisValidate />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment" element={<ReservationPay />} />
        <Route path="/reservation/occupants" element={<OccupantsCollect />} />
        <Route path="/reservation/modify" element={<ReservationModify />} />
      </Routes>
    </Router>
  );
}



export default App;
