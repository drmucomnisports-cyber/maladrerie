import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, PlusCircle, Trash, Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { API_URL } from '../config';
import ReservationForm from '../components/ReservationForm';

const CHAMBRES_NAMES = {
  1: "Chambre 1",
  2: "Chambre 2",
  3: "Chambre 3",
  4: "Chambre 4",
  5: "Chambre 5",
  6: "Chambre 6"
};

const Admin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('adminToken') || null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Nouveaux états
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [paymentLinkData, setPaymentLinkData] = useState(null);
  const [adminFeedback, setAdminFeedback] = useState(null);

  const showFeedback = (msg, type = 'success') => {
    setAdminFeedback({ msg, type });
  };

  // Finances & Missions
  const [finances, setFinances] = useState(null);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [currentReservationForMission, setCurrentReservationForMission] = useState(null);
  const [missionChecks, setMissionChecks] = useState({
    'Préparation petit-déjeuner': { checked: false, montant: 30 },
    'Draps et ménage': { checked: false, montant: 70 },
    'Remise des clés': { checked: false, montant: 30 },
    'Astreinte de nuit sur place': { checked: false, montant: 200 },
    'Astreinte de nuit à domicile': { checked: false, montant: 100 },
    'Déplacement astreinte': { checked: false, montant: 100 }
  });
  const [missionIntervenantId, setMissionIntervenantId] = useState('');
  const [isAssigningMissions, setIsAssigningMissions] = useState(false);

  const [activeTab, setActiveTab] = useState('reservations');
  const [clients, setClients] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [intervenantSearch, setIntervenantSearch] = useState('');

  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);

  const [showIntervenantModal, setShowIntervenantModal] = useState(false);
  const [currentIntervenant, setCurrentIntervenant] = useState(null);
  const [intervenantForm, setIntervenantForm] = useState({ nom: '', prenom: '', email: '', telephone: '', password: '', disponibilites: [] });
  const [isSavingIntervenant, setIsSavingIntervenant] = useState(false);

  // Codes Promo
  const [promoCodes, setPromoCodes] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoForm, setPromoForm] = useState({ code: '', description: '', type: 'pourcentage', valeur: '', dateExpiration: '', usageMax: '' });

  // Captation partielle caution
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureReservationId, setCaptureReservationId] = useState(null);

  const [adminForm, setAdminForm] = useState({ email: '', password: '', nom: '' });
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [captureMontant, setCaptureMontant] = useState('');
  const [adminUser, setAdminUser] = useState(null);

  // Profil admin
  const [profileForm, setProfileForm] = useState({ nom: '', prenom: '', email: '', telephone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Paiement manuel
  const [showManualPaymentModal, setShowManualPaymentModal] = useState(false);
  const [manualPaymentRes, setManualPaymentRes] = useState(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({ montant: '', mode: 'ESPECES', typePaiement: 'ACOMPTE' });

  useEffect(() => {
    if (token) {
      fetchReservations();
      fetchIntervenants();
      fetchFinances();
      fetchPromoCodes();
      fetchAdminAccounts();
      fetchAdminMe();
    }
  }, [token]);

  useEffect(() => {
    const clientMap = new Map();
    reservations.forEach(r => {
      if (r.client) {
        // Use email or id as unique identifier
        const key = r.client.email !== 'N/A' ? r.client.email : r.client.id;
        if (!clientMap.has(key)) {
          clientMap.set(key, { ...r.client, reservations: [r] });
        } else {
          clientMap.get(key).reservations.push(r);
        }
      }
    });
    setClients(Array.from(clientMap.values()));
  }, [reservations]);

  const fetchAdminMe = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data);
        // Pré-remplir le formulaire de profil
        const parts = (data.nom || '').split(' ');
        setProfileForm({
          prenom: parts.length > 1 ? parts[0] : '',
          nom: parts.length > 1 ? parts.slice(1).join(' ') : (data.nom || ''),
          email: data.email || '',
          telephone: data.telephone || ''
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(profileForm)
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data);
        showFeedback('Profil mis à jour avec succès.');
      } else {
        const errData = await res.json();
        showFeedback(errData.error || 'Erreur lors de la mise à jour.', 'error');
      }
    } catch (err) {
      console.error(err);
      showFeedback('Erreur réseau.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fetchIntervenants = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/intervenants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIntervenants(Array.isArray(data) ? data : []);
      } else {
        setIntervenants([]);
      }
    } catch (err) {
      console.error(err);
      setIntervenants([]);
    }
  };

  const saveIntervenant = async (e) => {
    e.preventDefault();
    setIsSavingIntervenant(true);
    try {
      const url = currentIntervenant
        ? `${API_URL}/api/admin/intervenants/${currentIntervenant.id}`
        : `${API_URL}/api/admin/intervenants`;
      const method = currentIntervenant ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(intervenantForm)
      });
      if (res.ok) {
        setShowIntervenantModal(false);
        setCurrentIntervenant(null);
        fetchIntervenants();
        showFeedback("Intervenant enregistré avec succès.");
      } else {
        showFeedback("Erreur lors de l'enregistrement de l'intervenant.", "error");
      }
    } catch (err) {
      console.error(err);
      showFeedback("Erreur réseau ou serveur inaccessible.", "error");
    } finally {
      setIsSavingIntervenant(false);
    }
  };

  const deleteIntervenant = async (id) => {
    if (!window.confirm("Supprimer cet intervenant ?")) return;
    try {
      await fetch(`${API_URL}/api/admin/intervenants/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchIntervenants();
    } catch (err) {
      console.error(err);
    }
  };

  const editIntervenant = (interv) => {
    setCurrentIntervenant(interv);
    setIntervenantForm({
      nom: interv.nom,
      prenom: interv.prenom,
      email: interv.email,
      telephone: interv.telephone,
      password: '', // On ne pré-remplit pas le mot de passe
      disponibilites: interv.disponibilites || []
    });
    setShowIntervenantModal(true);
  };

  const addDisponibilite = () => {
    setIntervenantForm({
      ...intervenantForm,
      disponibilites: [...intervenantForm.disponibilites, { dateDebut: '', dateFin: '' }]
    });
  };

  const removeDisponibilite = (index) => {
    const newDispo = [...intervenantForm.disponibilites];
    newDispo.splice(index, 1);
    setIntervenantForm({ ...intervenantForm, disponibilites: newDispo });
  };

  const updateDisponibilite = (index, field, value) => {
    const newDispo = [...intervenantForm.disponibilites];
    newDispo[index][field] = value;
    setIntervenantForm({ ...intervenantForm, disponibilites: newDispo });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        localStorage.setItem('adminToken', data.token);
      } else {
        setError('Mot de passe incorrect');
      }
    } catch (err) {
      setError('Erreur de connexion');
    }
    setLoading(false);
  };
  // Codes Promo
  const fetchPromoCodes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/promo-codes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPromoCodes(data);
      }
    } catch (err) {
      console.error("Erreur promo codes:", err);
    }
  };

  const createPromoCode = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/admin/promo-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(promoForm)
      });
      if (res.ok) {
        showFeedback('Code promo créé avec succès');
        setShowPromoModal(false);
        setPromoForm({ code: '', description: '', type: 'pourcentage', valeur: '', dateExpiration: '', usageMax: '' });
        fetchPromoCodes();
      } else {
        const err = await res.json();
        showFeedback(err.error || 'Erreur', 'error');
      }
    } catch (err) {
      showFeedback('Erreur réseau', 'error');
    }
  };

  const deletePromoCode = async (id) => {
    if (!window.confirm('Supprimer ce code promo ?')) return;
    try {
      await fetch(`${API_URL}/api/admin/promo-codes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchPromoCodes();
    } catch (err) {
      showFeedback('Erreur', 'error');
    }
  };

  const fetchAdminAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setAdminAccounts(await res.json());
    } catch (err) { console.error(err); }
  };

  const saveAdminAccount = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(adminForm)
      });
      if (res.ok) {
        setShowAdminModal(false);
        setAdminForm({ email: '', password: '', nom: '' });
        fetchAdminAccounts();
        showFeedback("Compte administrateur créé.");
      } else {
        showFeedback("Erreur lors de la création de l'admin.", "error");
      }
    } catch (err) { console.error(err); }
  };

  const deleteAdminAccount = async (id) => {
    if (!window.confirm("Supprimer cet administrateur ?")) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAdminAccounts();
        showFeedback("Compte supprimé.");
      }
    } catch (err) { console.error(err); }
  };

  const togglePromoCode = async (id, actif) => {
    try {
      await fetch(`${API_URL}/api/admin/promo-codes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ actif: !actif })
      });
      fetchPromoCodes();
    } catch (err) {
      showFeedback('Erreur', 'error');
    }
  };

  // Captation partielle de la caution
  const captureCaution = async () => {
    if (!captureReservationId || !captureMontant) return;
    try {
      const res = await fetch(`${API_URL}/api/reservations/${captureReservationId}/capture-caution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ montant: parseFloat(captureMontant) })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback(data.message);
        setShowCaptureModal(false);
        setCaptureReservationId(null);
        setCaptureMontant('');
        fetchReservations();
      } else {
        showFeedback(data.error || 'Erreur', 'error');
      }
    } catch (err) {
      showFeedback('Erreur réseau', 'error');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('adminToken');
    setReservations([]);
    navigate('/login');
  };

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setReservations(Array.isArray(data) ? data : []);
      } else {
        console.error('Erreur de statut API:', res.status);
        setReservations([]);
      }
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des réservations');
      setReservations([]);
    }
    setLoading(false);
  };

  const fetchFinances = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/finances`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFinances(data);
      }
    } catch (err) {
      console.error("Erreur finances:", err);
    }
  };

  const addMissions = async (e) => {
    e.preventDefault();
    if (!currentReservationForMission || !missionIntervenantId) return;

    const selectedMissions = Object.entries(missionChecks)
      .filter(([_, v]) => v.checked)
      .map(([typeMission, v]) => ({ typeMission, montant: v.montant }));

    if (selectedMissions.length === 0) {
      showFeedback('Veuillez sélectionner au moins une mission.', 'error');
      return;
    }

    setIsAssigningMissions(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${currentReservationForMission.id}/missions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ intervenantId: missionIntervenantId, missions: selectedMissions })
      });

      if (res.ok) {
        const data = await res.json();
        setShowMissionModal(false);
        fetchReservations();
        fetchFinances();
        showFeedback(`${selectedMissions.length} mission(s) assignée(s) et notification envoyée.`);
        // Reset
        setMissionChecks({
          'Préparation petit-déjeuner': { checked: false, montant: 30 },
          'Draps et ménage': { checked: false, montant: 70 },
          'Remise des clés': { checked: false, montant: 30 },
          'Astreinte de nuit sur place': { checked: false, montant: 200 },
          'Astreinte de nuit à domicile': { checked: false, montant: 100 },
          'Déplacement astreinte': { checked: false, montant: 100 }
        });
        setMissionIntervenantId('');
      } else {
        const errData = await res.json();
        showFeedback(errData.error || "Erreur lors de l'ajout des missions", 'error');
      }
    } catch (err) {
      showFeedback("Erreur réseau", 'error');
    } finally {
      setIsAssigningMissions(false);
    }
  };

  const notifyIntervenant = async (reservationId, intervenantId) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${reservationId}/notify-intervenant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ intervenantId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      showFeedback('Intervenant notifié avec succès !');
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const deleteMission = async (missionId) => {
    if (!window.confirm("Supprimer cette mission ?")) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/missions/${missionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchReservations();
        fetchFinances();
      } else {
        alert("Erreur lors de la suppression");
      }
    } catch (err) {
      alert("Erreur réseau");
    }
  };

  const updateStatut = async (id, newStatut) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ statut: newStatut })
      });
      if (res.ok) {
        fetchReservations();
      } else {
        alert('Erreur lors de la mise à jour');
      }
    } catch (err) {
      alert('Erreur réseau');
    }
  };

  const updateIntervenant = async (reservationId, intervenantId) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${reservationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ intervenantId: intervenantId ? parseInt(intervenantId) : null })
      });
      if (res.ok) {
        fetchReservations();
      } else {
        alert('Erreur lors de l\'assignation');
      }
    } catch (err) {
      alert('Erreur réseau');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setDeleteModalId(null);
        fetchReservations();
      } else {
        alert('Erreur lors de la suppression');
      }
    } catch (err) {
      alert('Erreur réseau');
    }
  };

  const triggerPaymentAction = async (id, actionType) => {
    try {
      const res = await fetch(`${API_URL}/api/reservations/${id}/${actionType}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const contentType = res.headers.get("content-type");
      if (res.ok) {
        const data = await res.json();
        setAdminFeedback({ type: 'success', msg: actionType === 'cancel-caution' ? data.message : `${data.message}. Le lien a été envoyé au client.` });
        if (data.url) setPaymentLinkData({ link: data.url, id, action: actionType });
        fetchReservations();
      } else {
        if (contentType && contentType.includes("application/json")) {
          const errData = await res.json();
          setAdminFeedback({ type: 'error', msg: errData.error || `Erreur lors de la génération (${actionType})` });
        } else {
          const errText = await res.text();
          console.error('Server error response:', errText);
          setAdminFeedback({ type: 'error', msg: `Erreur serveur: ${res.status} ${res.statusText}` });
        }
      }
    } catch (err) {
      setAdminFeedback({ type: 'error', message: 'Erreur réseau ou serveur inaccessible' });
    }
  };

  const handleAction = async (action, id) => {
    // Action 'accept' or 'reject' triggers the backend email logic
    try {
      const res = await fetch(`${API_URL}/api/reservations/${id}/${action}`);
      if (res.ok) {
        alert(action === 'accept' ? 'Réservation acceptée et e-mail envoyé.' : 'Réservation refusée et e-mail envoyé.');
        fetchReservations();
      } else {
        alert('Erreur lors de l\'action');
      }
    } catch (err) {
      alert('Erreur réseau');
    }
  };

  useEffect(() => {
    console.log('Admin Component Mounted. Token:', token ? 'Present' : 'Missing');
    if (!token) {
      console.log('No token found, redirecting to /login');
      navigate('/login');
    }
  }, [token, navigate]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-muc-blue mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">Vérification de l'authentification...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans p-4 md:p-8">
      <div className="w-full max-w-[96%] mx-auto relative">
        <div className="bg-[#F8F8F8] pb-8 border-b border-slate-200 shadow-sm mb-8">
          <div className="w-full">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-black text-muc-blue tracking-tight uppercase">Dashboard</h1>
                <p className="text-sm font-medium text-slate-500">Gestion des réservations - La Maladrerie</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-2 bg-muc-blue text-white font-bold rounded-lg hover:bg-muc-blue/90 transition-colors shadow-md"
                >
                  + Ajouter une réservation
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('adminToken');
                    window.location.reload();
                  }}
                  className="px-6 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            </div>



            <div className="flex gap-4">
              <button onClick={() => setActiveTab('reservations')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'reservations' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Réservations</button>
              <button onClick={() => setActiveTab('devis')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'devis' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Devis</button>
              <button onClick={() => setActiveTab('clients')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'clients' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Clients</button>
              <button onClick={() => setActiveTab('intervenants')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'intervenants' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Intervenants</button>
              <button onClick={() => setActiveTab('finances')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'finances' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Finances</button>
              <button onClick={() => setActiveTab('promos')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'promos' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Promos</button>
              <button onClick={() => setActiveTab('accounts')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'accounts' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Comptes</button>
              <button onClick={() => setActiveTab('profil')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'profil' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Mon Profil</button>
            </div>
          </div>
        </div>

        {activeTab === 'reservations' && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Client</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Dates</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Prestations</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Restauration</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Tarif</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Statut</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Validé par</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Date de création</th>
                    <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.filter(res => !res.statut?.includes('DEVIS')).map((res) => (
                    <tr key={res.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{res.client?.nom || 'Client inconnu'}</div>
                        <div className="text-xs text-slate-500">{res.client?.email || '-'}</div>
                        <div className="text-xs text-slate-500">{res.client?.telephone || '-'}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-700">Du {new Date(res.dateDebut).toLocaleDateString('fr-FR')}</div>
                        <div className="text-sm font-medium text-slate-700">Au {new Date(res.dateFin).toLocaleDateString('fr-FR')}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-bold text-muc-blue">
                          {res.chambres?.map(id => CHAMBRES_NAMES[id] || `Ch. ${id}`).join(', ')}
                        </div>
                        {res.salles && (
                          <div className="text-sm font-bold text-indigo-600 mt-1 flex flex-col">
                            {res.salles.salle15 && <span>💼 Salle 15 pl.</span>}
                            {res.salles.salle12 && <span>💼 Salle 12 pl.</span>}
                          </div>
                        )}
                        <div className="text-xs font-bold text-slate-700 mt-1">
                          👥 {res.occupants ? res.occupants.length : 0} occupant(s)
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1.5 flex gap-1 flex-wrap font-bold">
                          {res.options?.litsFaits && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🛏️ Lits</span>}
                          {res.options?.lingeFourni && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧴 Linge</span>}
                          {res.options?.menage && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧹 Ménage</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wider font-bold">
                          {(() => {
                            const hasPtitDej = res.repasGlobal?.PETIT_DEJEUNER || (res.repas && Object.values(res.repas).some(r => r.PETIT_DEJEUNER && Object.keys(r.PETIT_DEJEUNER).length > 0));
                            const hasDej = res.repasGlobal?.DEJEUNER || (res.repas && Object.values(res.repas).some(r => r.DEJEUNER && Object.keys(r.DEJEUNER).length > 0));
                            const hasDiner = res.repasGlobal?.DINER || (res.repas && Object.values(res.repas).some(r => r.DINER && Object.keys(r.DINER).length > 0));
                            
                            if (!hasPtitDej && !hasDej && !hasDiner) {
                              return <span className="text-slate-400 normal-case italic font-medium">Aucune</span>;
                            }
                            
                            return (
                              <>
                                {hasPtitDej && <span className="text-orange-600">🥐 Petit-déj</span>}
                                {hasDej && <span className="text-green-600">🍲 Déjeuner</span>}
                                {hasDiner && <span className="text-blue-600">🍝 Dîner</span>}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-black text-slate-800">{res.prixTotal ? `${res.prixTotal.toFixed(2)} €` : 'N/A'}</div>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 font-bold uppercase">Acompte (30%)</span>
                            {res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE' ? (
                              <span className="text-green-600 font-bold">✓ Payé</span>
                            ) : (
                              <span className="text-amber-600 font-bold">En attente</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 font-bold uppercase">Solde (70%)</span>
                            {res.statutPaiement === 'PAYE' ? (
                              <span className="text-green-600 font-bold">✓ Payé</span>
                            ) : (
                              <span className="text-amber-600 font-bold">En attente</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                            <span className="text-slate-500 font-bold uppercase">Caution</span>
                            {res.statutCaution === 'DEPOSEE' ? (
                              <span className="text-green-600 font-bold">✓ Déposée</span>
                            ) : (
                              <span className="text-amber-600 font-bold">En attente</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-2">
                          <select
                            value={res.statut}
                            onChange={(e) => updateStatut(res.id, e.target.value)}
                            className={`w-full text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg outline-none border-2 cursor-pointer ${res.statut === 'EN_ATTENTE' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                res.statut === 'RESERVE' ? 'border-muc-blue/20 bg-muc-blue/10 text-muc-blue' :
                                  res.statut === 'REFUSEE' ? 'border-red-200 bg-red-50 text-red-700' : ''
                              }`}
                          >
                            <option value="EN_ATTENTE">En attente</option>
                            <option value="RESERVE">Réservé</option>
                            <option value="REFUSEE">Refusé</option>
                          </select>
                          <button
                            onClick={() => {
                              setCurrentReservationForMission(res);
                              const needsDraps = res.options?.litsFaits || res.options?.lingeFourni || res.options?.menage;
                              const needsPetitDej = res.repasGlobal?.PETIT_DEJEUNER || (res.repas && Object.values(res.repas).some(r => r.PETIT_DEJEUNER && Object.keys(r.PETIT_DEJEUNER).length > 0));
                              
                              setMissionChecks({
                                'Préparation petit-déjeuner': { checked: !!needsPetitDej, montant: 30, isRecommended: !!needsPetitDej },
                                'Draps et ménage': { checked: !!needsDraps, montant: 70, isRecommended: !!needsDraps },
                                'Remise des clés': { checked: false, montant: 30 },
                                'Astreinte de nuit sur place': { checked: false, montant: 200 },
                                'Astreinte de nuit à domicile': { checked: false, montant: 50 },
                                'Déplacement astreinte': { checked: false, montant: 30 }
                              });
                              setShowMissionModal(true);
                            }}
                            className="w-full text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-lg outline-none border border-slate-200 bg-white text-slate-600 hover:border-muc-blue hover:text-muc-blue transition-colors flex justify-between items-center"
                          >
                            <span>Missions</span>
                            <span className="bg-slate-100 px-1.5 rounded-full text-slate-500">{res.missions ? res.missions.length : 0}</span>
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-bold text-slate-600">{res.validePar || '-'}</div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="text-xs font-bold text-slate-600">{new Date(res.createdAt).toLocaleDateString('fr-FR')}</div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2 flex-wrap max-w-[200px] ml-auto">
                          {res.statut === 'EN_ATTENTE' && (
                            <>
                              <button onClick={() => handleAction('accept', res.id)} className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded hover:bg-green-600 transition-colors">Accepter</button>
                              <button onClick={() => handleAction('reject', res.id)} className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded hover:bg-red-600 transition-colors">Refuser</button>
                            </>
                          )}
                          {res.statut === 'RESERVE' && (
                            <div className="flex gap-2 w-full justify-end flex-wrap">
                              {res.statutPaiement !== 'PAYE' && (
                                <button onClick={() => triggerPaymentAction(res.id, 'solde')} className="px-3 py-1.5 bg-muc-blue/10 text-muc-blue text-xs font-bold rounded hover:bg-muc-blue hover:text-white transition-colors" title="Demander le solde">
                                  Demander Solde
                                </button>
                              )}
                              {res.statutCaution !== 'DEPOSEE' && res.statutCaution !== 'RESTITUEE' && (
                                <button onClick={() => triggerPaymentAction(res.id, 'caution')} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded hover:bg-amber-600 hover:text-white transition-colors" title="Demander la caution">
                                  Demander Caution
                                </button>
                              )}
                              {res.statutCaution === 'DEPOSEE' && (
                                <>
                                  <button onClick={() => triggerPaymentAction(res.id, 'cancel-caution')} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded hover:bg-red-600 hover:text-white transition-colors" title="Annuler la caution">
                                    Annuler Caution
                                  </button>
                                  <button onClick={() => { setCaptureReservationId(res.id); setShowCaptureModal(true); }} className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-bold rounded hover:bg-purple-600 hover:text-white transition-colors" title="Retenir un montant partiel">
                                    Retenir montant
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <button onClick={() => { setManualPaymentRes(res); setShowManualPaymentModal(true); }} className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded hover:bg-green-600 hover:text-white transition-colors w-full" title="Enregistrer un paiement manuel">
                            Enregistrer Paiement
                          </button>
                          <button onClick={() => setDeleteModalId(res.id)} className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded hover:bg-red-500 hover:text-white transition-colors w-full mt-2">Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && !loading && (
                    <tr>
                      <td colSpan="9" className="p-16 text-center text-slate-500 font-medium">Aucune réservation trouvée</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'devis' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="w-full md:w-1/2 relative">
                <input
                  type="text"
                  placeholder="Rechercher un devis (Nom, Email)..."
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-muc-blue focus:ring-0 transition-all font-medium text-slate-600"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              </div>
              <button
                onClick={() => navigate('/planning?mode=devis')}
                className="w-full md:w-auto bg-muc-blue text-white px-8 py-4 rounded-xl font-black uppercase tracking-wider hover:bg-muc-blue/90 hover:scale-105 transition-all shadow-xl flex items-center justify-center gap-3"
              >
                <PlusCircle size={24} />
                Nouveau Devis
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Prospect</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Dates</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Chambres</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Tarif</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Expire le</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Statut</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Date de création</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.filter((res) => {
                      const matchesSearch = !clientSearch ||
                        (res.client?.nom?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                          res.client?.email?.toLowerCase().includes(clientSearch.toLowerCase()));

                      return res.statut?.includes('DEVIS') && matchesSearch;
                    }).map((res) => (
                      <tr key={res.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{res.client?.nom || 'Client inconnu'}</div>
                          <div className="text-xs text-slate-500">{res.client?.email || '-'}</div>
                          <div className="text-xs text-slate-500">{res.client?.telephone || '-'}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Calendar size={14} className="text-muc-blue" />
                            Du {new Date(res.dateDebut).toLocaleDateString()}
                          </div>
                          <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Calendar size={14} className="text-muc-blue" />
                            Au {new Date(res.dateFin).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {res.chambres?.map(id => (
                              <span key={id} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded uppercase">
                                {CHAMBRES_NAMES[id] || `Ch. ${id}`}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-black text-muc-blue">{res.prixTotal}€</div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
                              <Clock size={14} className="text-slate-400" />
                              {res.expireLe ? new Date(res.expireLe).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {res.expireLe ? new Date(res.expireLe).toLocaleTimeString() : ''}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${res.statut === 'DEVIS_EN_ATTENTE' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>
                            {res.statut === 'DEVIS_EN_ATTENTE' ? 'En attente' : 'Expiré'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="text-xs font-bold text-slate-600">{new Date(res.createdAt).toLocaleDateString('fr-FR')}</div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            {res.statut === 'DEVIS_EN_ATTENTE' && (
                              <button
                                onClick={async () => {
                                  if (window.confirm('Confirmer la transformation du devis en réservation ?')) {
                                    try {
                                      const response = await fetch(`${API_URL}/api/admin/reservations/${res.id}/convert-devis`, {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${token}`
                                        },
                                        body: JSON.stringify({ adminEmail: localStorage.getItem('adminEmail') })
                                      });
                                      if (response.ok) {
                                        showFeedback('Devis converti avec succès !');
                                        fetchReservations();
                                      } else {
                                        const data = await response.json();
                                        alert(`Erreur: ${data.error}`);
                                      }
                                    } catch (error) {
                                      console.error('Erreur conversion devis:', error);
                                    }
                                  }
                                }}
                                className="px-3 py-1.5 bg-muc-blue text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
                              >
                                <CheckCircle size={14} />
                                Valider
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteModalId(res.id)}
                              className="p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"
                            >
                              <Trash size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {reservations.filter(res => res.statut.includes('DEVIS')).length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-slate-500 font-medium">Aucun devis trouvé</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (() => {
          const filteredClients = clients.filter(c =>
            (c.nom || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
            (c.email || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
            (c.telephone || '').includes(clientSearch)
          );
          return (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6">
              <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Liste des Clients</h2>
                <input
                  type="text"
                  placeholder="Rechercher un client..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="px-4 py-2 border-2 border-slate-100 rounded-xl focus:border-muc-yellow outline-none text-sm w-full md:w-64"
                />
              </div>
              <div className="flex flex-col gap-3">
                {filteredClients.map((client, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:shadow-md transition-shadow flex justify-between items-center" onClick={() => { setSelectedClient(client); setShowClientModal(true); }}>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">{client.nom}</h3>
                      <div className="flex gap-4 mt-1 text-sm text-slate-500">
                        <span>{client.email}</span>
                        <span>{client.telephone}</span>
                      </div>
                    </div>
                    <div className="shrink-0 px-3 py-1 bg-muc-blue/10 text-muc-blue text-xs font-bold rounded-lg uppercase tracking-wider">
                      {client.reservations.length} réservation(s)
                    </div>
                  </div>
                ))}
                {filteredClients.length === 0 && <p className="text-slate-500 font-medium p-4 text-center">Aucun client trouvé.</p>}
              </div>
            </div>
          );
        })()}

        {activeTab === 'intervenants' && (() => {
          const filteredIntervenants = intervenants.filter(i =>
            (i.nom || '').toLowerCase().includes(intervenantSearch.toLowerCase()) ||
            (i.prenom || '').toLowerCase().includes(intervenantSearch.toLowerCase()) ||
            (i.email || '').toLowerCase().includes(intervenantSearch.toLowerCase())
          );
          return (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6">
              <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Gestion des Intervenants</h2>
                <div className="flex gap-4 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="Rechercher un intervenant..."
                    value={intervenantSearch}
                    onChange={e => setIntervenantSearch(e.target.value)}
                    className="px-4 py-2 border-2 border-slate-100 rounded-xl focus:border-muc-yellow outline-none text-sm w-full md:w-64"
                  />
                  <button
                    onClick={() => {
                      setCurrentIntervenant(null);
                      setIntervenantForm({ nom: '', prenom: '', email: '', telephone: '', disponibilites: [] });
                      setShowIntervenantModal(true);
                    }}
                    className="bg-muc-yellow text-muc-blue px-4 py-2 rounded-lg font-black text-sm uppercase shrink-0"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {filteredIntervenants.map((interv) => (
                  <div key={interv.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <h3 className="font-bold text-slate-800 text-lg">{interv.prenom} {interv.nom}</h3>
                        <span className="text-sm text-slate-500">{interv.email}</span>
                        <span className="text-sm text-slate-500">{interv.telephone}</span>
                      </div>

                      <div className="mt-2">
                        {interv.disponibilites && interv.disponibilites.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {interv.disponibilites.map(dispo => (
                              <span key={dispo.id} className="text-[11px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                Du <span className="font-semibold">{new Date(dispo.dateDebut).toLocaleDateString('fr-FR')}</span> au <span className="font-semibold">{new Date(dispo.dateFin).toLocaleDateString('fr-FR')}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">Aucune disponibilité</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <button onClick={() => editIntervenant(interv)} className="text-muc-blue bg-muc-blue/10 px-3 py-1.5 rounded-md hover:bg-muc-blue hover:text-white transition-colors text-xs font-bold uppercase">Modifier</button>
                      <button onClick={() => deleteIntervenant(interv.id)} className="text-red-500 bg-red-100 px-3 py-1.5 rounded-md hover:bg-red-500 hover:text-white transition-colors text-xs font-bold uppercase">Supprimer</button>
                    </div>
                  </div>
                ))}
                {filteredIntervenants.length === 0 && <p className="text-slate-500 font-medium p-4 text-center">Aucun intervenant trouvé.</p>}
              </div>
            </div>
          );
        })()}
      </div>

      {showClientModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-muc-blue uppercase tracking-tight">Fiche Client</h2>
              <button onClick={() => setShowClientModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-2">Informations</h3>
                <p className="text-sm text-slate-600"><strong>Nom:</strong> {selectedClient.nom}</p>
                <p className="text-sm text-slate-600"><strong>Email:</strong> {selectedClient.email}</p>
                <p className="text-sm text-slate-600"><strong>Téléphone:</strong> {selectedClient.telephone}</p>
                {selectedClient.adressePostale && <p className="text-sm text-slate-600"><strong>Adresse:</strong> {selectedClient.adressePostale}</p>}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 mb-3">Historique des Réservations</h3>
                <div className="space-y-3">
                  {selectedClient.reservations.map(res => (
                    <div key={res.id} className="border border-slate-100 p-4 rounded-lg bg-white shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-muc-blue">Du {new Date(res.dateDebut).toLocaleDateString('fr-FR')} au {new Date(res.dateFin).toLocaleDateString('fr-FR')}</span>
                        <span className="text-xs px-2 py-1 bg-slate-100 rounded-md uppercase font-bold text-slate-600">{res.statut}</span>
                      </div>
                      <p className="text-xs text-slate-500">Chambres : {res.chambres.join(', ')}</p>
                      <p className="text-xs text-slate-500">Prix Total : {res.prixTotal ? `${res.prixTotal} €` : 'N/A'}</p>
                      {res.occupants && res.occupants.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-50">
                          <p className="text-xs font-bold text-slate-700 mb-1">Occupants:</p>
                          <ul className="text-xs text-slate-500 list-disc list-inside">
                            {res.occupants.map(o => (
                              <li key={o.id}>{o.prenom} {o.nom} {o.estAdulte ? '(Adulte)' : `(Enfant, ${o.age} ans)`}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showIntervenantModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-muc-blue uppercase tracking-tight">{currentIntervenant ? 'Modifier Intervenant' : 'Ajouter Intervenant'}</h2>
              <button onClick={() => setShowIntervenantModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
            </div>
            <form onSubmit={saveIntervenant} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nom</label>
                <input required type="text" value={intervenantForm.nom} onChange={e => setIntervenantForm({ ...intervenantForm, nom: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Prénom</label>
                <input required type="text" value={intervenantForm.prenom} onChange={e => setIntervenantForm({ ...intervenantForm, prenom: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                <input required type="email" value={intervenantForm.email} onChange={e => setIntervenantForm({ ...intervenantForm, email: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Téléphone</label>
                <input required type="text" value={intervenantForm.telephone} onChange={e => setIntervenantForm({ ...intervenantForm, telephone: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Mot de passe (Laisser vide pour ne pas changer)</label>
                <input type="password" value={intervenantForm.password} onChange={e => setIntervenantForm({ ...intervenantForm, password: e.target.value })} className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue" placeholder="••••••••" />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2 mt-2">
                  <label className="block text-sm font-bold text-slate-700">Disponibilités</label>
                  <button type="button" onClick={addDisponibilite} className="text-xs bg-muc-blue/10 text-muc-blue px-2 py-1 rounded font-bold uppercase hover:bg-muc-blue hover:text-white transition-colors">+ Ajouter une période</button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {intervenantForm.disponibilites.map((dispo, index) => (
                    <div key={index} className="flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Début</label>
                        <input type="date" required value={dispo.dateDebut ? new Date(dispo.dateDebut).toISOString().split('T')[0] : ''} onChange={e => updateDisponibilite(index, 'dateDebut', e.target.value)} className="w-full text-sm p-1 border rounded outline-none focus:border-muc-blue" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Fin</label>
                        <input type="date" required value={dispo.dateFin ? new Date(dispo.dateFin).toISOString().split('T')[0] : ''} onChange={e => updateDisponibilite(index, 'dateFin', e.target.value)} className="w-full text-sm p-1 border rounded outline-none focus:border-muc-blue" />
                      </div>
                      <button type="button" onClick={() => removeDisponibilite(index)} className="mt-4 text-red-500 hover:text-red-700 font-bold px-2 text-xl">&times;</button>
                    </div>
                  ))}
                  {intervenantForm.disponibilites.length === 0 && <p className="text-xs text-slate-400 italic">Aucune disponibilité renseignée.</p>}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" disabled={isSavingIntervenant} onClick={() => setShowIntervenantModal(false)} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50">Annuler</button>
                <button type="submit" disabled={isSavingIntervenant} className="px-4 py-2 bg-muc-blue text-white font-bold rounded-lg hover:bg-blue-800 disabled:opacity-70 flex items-center gap-2">
                  {isSavingIntervenant && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {isSavingIntervenant ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'finances' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <h3 className="text-slate-500 font-black uppercase tracking-widest text-xs mb-2">Chiffre d'Affaires Encaissé</h3>
              <p className="text-4xl font-black text-green-500">{finances?.caEnquaisse ? finances.caEnquaisse.toFixed(2) : '0.00'} €</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <h3 className="text-slate-500 font-black uppercase tracking-widest text-xs mb-2">Reste à Encaisser</h3>
              <p className="text-4xl font-black text-amber-500">{finances?.resteAEncaisser ? finances.resteAEncaisser.toFixed(2) : '0.00'} €</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <h3 className="text-slate-500 font-black uppercase tracking-widest text-xs mb-2">Rémunération Totale (Missions)</h3>
              <p className="text-4xl font-black text-muc-blue">{finances?.remunerationTotale ? finances.remunerationTotale.toFixed(2) : '0.00'} €</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-black text-slate-800 uppercase tracking-widest">Prochains Paiements Attendus</h3>
              </div>
              <div className="p-4 overflow-y-auto max-h-80 space-y-3">
                {finances?.prochainsPaiements?.length > 0 ? finances.prochainsPaiements.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase">{p.typeAttendu}</span>
                      <p className="text-sm font-bold text-slate-800">Résa #{p.reservationId} (Du {new Date(p.dateDebut).toLocaleDateString('fr-FR')})</p>
                    </div>
                    <span className="text-lg font-black text-muc-blue">{p.montant ? p.montant.toFixed(2) : '0.00'} €</span>
                  </div>
                )) : <p className="text-sm text-slate-500 italic p-4 text-center">Aucun paiement en attente.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-black text-slate-800 uppercase tracking-widest">Rémunération par Intervenant</h3>
              </div>
              <div className="p-4 overflow-y-auto max-h-80 space-y-3">
                {finances?.remunerationParIntervenant && Object.keys(finances.remunerationParIntervenant).length > 0 ? (
                  Object.entries(finances.remunerationParIntervenant).map(([nom, montant], idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg bg-slate-50">
                      <span className="text-sm font-bold text-slate-800">{nom}</span>
                      <span className="text-lg font-black text-muc-blue">{montant.toFixed(2)} €</span>
                    </div>
                  ))
                ) : <p className="text-sm text-slate-500 italic p-4 text-center">Aucune rémunération calculée.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'promos' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Gestion des Codes Promotionnels</h2>
            <div className="flex gap-3">
              <a
                href="https://dashboard.stripe.com/coupons"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-black transition-all shadow-md flex items-center gap-2 text-sm"
              >
                <span>💳 Gérer sur Stripe</span>
              </a>
              <button onClick={() => setShowPromoModal(true)} className="bg-muc-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md text-sm">+ Créer un code interne</button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Code</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Description</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Réduction</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Utilisations</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Statut</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promoCodes.map(promo => (
                  <tr key={promo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-black text-muc-blue uppercase">{promo.code}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{promo.description || '-'}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {promo.type === 'pourcentage' ? `${promo.valeur}%` : `${promo.valeur} €`}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {promo.usageActuel} / {promo.usageMax || '∞'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => togglePromoCode(promo.id, promo.actif)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${promo.actif ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
                      >
                        {promo.actif ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deletePromoCode(promo.id)} className="text-red-400 hover:text-red-600 p-2">&times; Supprimer</button>
                    </td>
                  </tr>
                ))}
                {promoCodes.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 italic">Aucun code promo configuré.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Gestion des Comptes Administrateurs</h2>
            <button onClick={() => setShowAdminModal(true)} className="bg-muc-blue text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md">+ Nouvel Admin</button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Nom</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Email</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest">Créé le</th>
                  <th className="px-6 py-4 text-xs font-black uppercase text-slate-500 tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adminAccounts.map(acc => (
                  <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{acc.nom || 'Sans nom'}</td>
                    <td className="px-6 py-4 text-slate-600">{acc.email}</td>
                    <td className="px-6 py-4 text-slate-500">{new Date(acc.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => deleteAdminAccount(acc.id)} className="text-red-500 hover:text-red-700 font-bold uppercase text-xs tracking-widest">Supprimer</button>
                    </td>
                  </tr>
                ))}
                {adminAccounts.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500 italic">Aucun compte admin supplémentaire.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-600"><strong>Note :</strong> Le compte principal configuré sur Railway (SuperAdmin) n'apparaît pas ici mais reste toujours actif.</p>
          </div>
        </div>
      )}

      {showPromoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 p-6">
            <h3 className="text-lg font-black text-muc-blue uppercase tracking-tight mb-6">Nouveau Code Promo</h3>
            <form onSubmit={createPromoCode} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Code (ex: ETE2024)</label>
                <input required type="text" value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none uppercase font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Type</label>
                  <select value={promoForm.type} onChange={e => setPromoForm({ ...promoForm, type: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold">
                    <option value="pourcentage">Pourcentage (%)</option>
                    <option value="fixe">Montant Fixe (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Valeur</label>
                  <input required type="number" value={promoForm.valeur} onChange={e => setPromoForm({ ...promoForm, valeur: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Description (optionnel)</label>
                <input type="text" value={promoForm.description} onChange={e => setPromoForm({ ...promoForm, description: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Expiration</label>
                  <input type="date" value={promoForm.dateExpiration} onChange={e => setPromoForm({ ...promoForm, dateExpiration: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Usage Max</label>
                  <input type="number" placeholder="Illimité" value={promoForm.usageMax} onChange={e => setPromoForm({ ...promoForm, usageMax: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPromoModal(false)} className="flex-1 py-3 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Annuler</button>
                <button type="submit" className="flex-1 py-3 font-bold text-white bg-muc-blue hover:bg-blue-800 rounded-xl transition-all shadow-md">Créer le code</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100 p-6">
            <h3 className="text-lg font-black text-muc-blue uppercase tracking-tight mb-6">Nouvel Administrateur</h3>
            <form onSubmit={saveAdminAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Nom (Affichage)</label>
                <input required type="text" value={adminForm.nom} onChange={e => setAdminForm({ ...adminForm, nom: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" placeholder="Ex: Jean Dupont" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Email (Identifiant)</label>
                <input required type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" placeholder="admin@exemple.com" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Mot de passe</label>
                <input required type="password" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" placeholder="••••••••" />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAdminModal(false)} className="flex-1 px-6 py-3 border-2 border-slate-100 text-slate-500 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all">Annuler</button>
                <button type="submit" className="flex-1 px-6 py-3 bg-muc-blue text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-800 transition-all shadow-lg shadow-blue-200">Créer le compte</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCaptureModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6">
            <h3 className="text-lg font-black text-muc-blue uppercase tracking-tight mb-4">Retenir sur caution</h3>
            <p className="text-sm text-slate-500 mb-6">Indiquez le montant à prélever sur l'empreinte bancaire (ex: 50 € pour frais de ménage). Le reste de la caution sera libéré.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">Montant à prélever (€)</label>
                <input
                  type="number"
                  step="0.01"
                  max="500"
                  value={captureMontant}
                  onChange={e => setCaptureMontant(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-muc-blue font-black text-xl text-center"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCaptureModal(false)} className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Annuler</button>
                <button onClick={captureCaution} className="flex-1 py-3 text-sm font-bold text-white bg-muc-blue hover:bg-blue-800 rounded-xl transition-all shadow-md">Confirmer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMissionModal && currentReservationForMission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-muc-blue uppercase tracking-tight">Gérer les Missions</h2>
              <button onClick={() => setShowMissionModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
            </div>

            <div className="mb-6">
              <h3 className="font-bold text-slate-700 mb-2">Missions actuelles</h3>
              <div className="space-y-2">
                {currentReservationForMission.missions && currentReservationForMission.missions.length > 0 ? (
                  currentReservationForMission.missions.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <p className="text-sm font-bold">{m.typeMission} - <span className="text-muc-blue">{m.montant} €</span></p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-500">Intervenant: {m.intervenant.prenom} {m.intervenant.nom}</p>
                          <button onClick={() => notifyIntervenant(currentReservationForMission.id, m.intervenant.id)} className="text-[10px] bg-muc-blue/10 text-muc-blue px-2 py-0.5 rounded font-bold uppercase hover:bg-muc-blue hover:text-white transition-colors" title="Notifier par e-mail">Notifier</button>
                        </div>
                      </div>
                      <button onClick={() => deleteMission(m.id)} className="text-red-500 hover:text-red-700 px-2 font-bold">&times;</button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm italic text-slate-500">Aucune mission assignée.</p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-bold text-slate-700 mb-4">Assigner des missions</h3>
              <form onSubmit={addMissions} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Intervenant</label>
                  <select
                    required
                    value={missionIntervenantId}
                    onChange={e => setMissionIntervenantId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:border-muc-blue text-sm"
                  >
                    <option value="">Sélectionner un intervenant</option>
                    {intervenants.filter(i => {
                      if (!currentReservationForMission) return true;
                      const rDebut = new Date(currentReservationForMission.dateDebut);
                      const rFin = new Date(currentReservationForMission.dateFin);
                      const isAvailable = i.disponibilites?.some(d => {
                        const dDebut = new Date(d.dateDebut);
                        const dFin = new Date(d.dateFin);
                        return rDebut < dFin && rFin > dDebut;
                      });
                      return isAvailable;
                    }).map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">Types de missions</label>
                  <div className="space-y-3">
                    {Object.entries(missionChecks).map(([type, val]) => (
                      <label key={type} className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        val.checked 
                          ? 'border-muc-blue bg-muc-blue/5' 
                          : val.isRecommended 
                            ? 'border-amber-400 bg-amber-50 shadow-[0_0_15px_rgba(251,191,36,0.2)]' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={val.checked}
                              onChange={e => setMissionChecks(prev => ({
                                ...prev,
                                [type]: { ...prev[type], checked: e.target.checked }
                              }))}
                              className="w-5 h-5 rounded accent-[#004B93]"
                            />
                            <span className={`text-sm font-semibold ${val.checked ? 'text-muc-blue' : val.isRecommended ? 'text-amber-700' : 'text-slate-700'}`}>
                              {type === 'Draps et ménage' && '🛏️ '}
                              {type === 'Remise des clés' && '🔑 '}
                              {type === 'Astreinte de nuit sur place' && '🏠 '}
                              {type === 'Astreinte de nuit à domicile' && '📞 '}
                              {type === 'Déplacement astreinte' && '🚗 '}
                              {type}
                            </span>
                          </div>
                          {val.isRecommended && !val.checked && (
                            <span className="text-[10px] text-amber-600 font-black ml-8 mt-1 uppercase tracking-wider block">Suggéré selon la réservation</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={val.montant}
                            onChange={e => setMissionChecks(prev => ({
                              ...prev,
                              [type]: { ...prev[type], montant: parseFloat(e.target.value) || 0 }
                            }))}
                            className="w-20 text-right px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:border-muc-blue"
                          />
                          <span className="text-sm font-bold text-slate-500">€</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {Object.values(missionChecks).some(v => v.checked) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <span className="text-sm font-bold text-green-700">
                      Total : {Object.values(missionChecks).filter(v => v.checked).reduce((sum, v) => sum + v.montant, 0).toFixed(2)} €
                    </span>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isAssigningMissions || !Object.values(missionChecks).some(v => v.checked)}
                    className="px-6 py-2.5 bg-muc-blue text-white font-bold rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAssigningMissions && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    {isAssigningMissions ? 'Assignation en cours...' : 'Assigner et notifier'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-xl font-black text-muc-blue tracking-tight uppercase">Ajouter une réservation</h2>
                <p className="text-xs text-slate-500 mt-1">Saisie complète et blocage du planning</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl px-2">&times;</button>
            </div>
            <div className="p-6">
              <ReservationForm
                events={reservations.map(r => ({ start: r.dateDebut, end: r.dateFin, chambres: r.chambres }))}
                isAdmin={true}
                onCreated={() => { setShowAddModal(false); fetchReservations(); }}
              />
            </div>
          </div>
        </div>
      )}

      {deleteModalId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-100 p-6 text-center">
            <h3 className="text-lg font-black text-slate-800 mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-slate-500 mb-6">Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action est irréversible.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteModalId(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Annuler</button>
              <button onClick={() => handleDelete(deleteModalId)} className="px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-md">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {paymentLinkData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800">Lien de Paiement Stripe</h3>
              <button onClick={() => setPaymentLinkData(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              Le lien de paiement a été généré avec succès. Vous pouvez le copier et l'envoyer au client.
            </p>

            <div className="flex items-center gap-2 mb-6">
              <input
                type="text"
                readOnly
                value={paymentLinkData.link}
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(paymentLinkData.link);
                  alert('Lien copié dans le presse-papiers !');
                }}
                className="px-4 py-2 bg-muc-blue text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Copier
              </button>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setPaymentLinkData(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modale Paiement Manuel */}
      {showManualPaymentModal && manualPaymentRes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-muc-blue p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tight">Enregistrer un paiement</h3>
              <p className="text-sm opacity-90">Client : {manualPaymentRes.client?.nom || 'Inconnu'}</p>
            </div>
            <div className="p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Montant (€)</label>
                  <input
                    type="number"
                    value={manualPaymentForm.montant}
                    onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, montant: e.target.value })}
                    placeholder="Ex: 150"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-muc-blue outline-none transition-all font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Mode de paiement</label>
                  <select
                    value={manualPaymentForm.mode}
                    onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, mode: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-muc-blue outline-none transition-all font-bold"
                  >
                    <option value="ESPECES">Espèces</option>
                    <option value="CHEQUE">Chèque</option>
                    <option value="VIREMENT">Virement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Type de règlement</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'ACOMPTE' })}
                      className={`py-3 rounded-xl font-bold border-2 transition-all ${manualPaymentForm.typePaiement === 'ACOMPTE' ? 'bg-muc-blue text-white border-muc-blue' : 'bg-white text-slate-600 border-slate-100 hover:border-muc-blue/30'}`}
                    >
                      Acompte (30%)
                    </button>
                    <button
                      onClick={() => setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'TOTAL' })}
                      className={`py-3 rounded-xl font-bold border-2 transition-all ${manualPaymentForm.typePaiement === 'TOTAL' ? 'bg-muc-blue text-white border-muc-blue' : 'bg-white text-slate-600 border-slate-100 hover:border-muc-blue/30'}`}
                    >
                      Solde Total
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setShowManualPaymentModal(false)}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_URL}/api/admin/reservations/${manualPaymentRes.id}/manual-payment`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(manualPaymentForm)
                      });
                      if (res.ok) {
                        showFeedback('Paiement enregistré avec succès !');
                        setShowManualPaymentModal(false);
                        fetchReservations();
                      } else {
                        const data = await res.json();
                        alert(data.error || 'Erreur');
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="flex-1 py-4 bg-muc-blue text-white font-black uppercase tracking-wider rounded-xl hover:bg-muc-blue/90 shadow-lg shadow-muc-blue/20 transition-all"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profil' && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight mb-6 pb-4 border-b border-slate-100">Mon Profil</h2>
            <form onSubmit={saveProfile} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Prénom</label>
                  <input type="text" value={profileForm.prenom} onChange={e => setProfileForm({...profileForm, prenom: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium transition-all" placeholder="Prénom" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Nom</label>
                  <input type="text" value={profileForm.nom} onChange={e => setProfileForm({...profileForm, nom: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium transition-all" placeholder="Nom" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Email</label>
                <input type="email" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium transition-all" placeholder="email@exemple.fr" required />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Téléphone</label>
                <input type="tel" value={profileForm.telephone} onChange={e => setProfileForm({...profileForm, telephone: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium transition-all" placeholder="04 XX XX XX XX" />
              </div>
              <button type="submit" disabled={isSavingProfile} className={`w-full py-4 bg-muc-blue text-white font-black uppercase tracking-widest rounded-xl hover:bg-muc-blue/90 shadow-lg transition-all ${isSavingProfile ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSavingProfile ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </form>
          </div>
        </div>
      )}

      {adminFeedback && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 w-screen h-screen">
          <div className={`bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-100`}>
            <div className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ${adminFeedback.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
              {adminFeedback.type === 'error' ? <AlertTriangle size={36} /> : <CheckCircle size={36} />}
            </div>
            <p className={`text-lg font-bold mb-6 ${adminFeedback.type === 'error' ? 'text-red-800' : 'text-green-800'}`}>{adminFeedback.msg}</p>
            <button
              onClick={() => { setAdminFeedback(null); setActiveTab('reservations'); }}
              className="w-full py-3 bg-muc-blue text-white font-black uppercase tracking-widest rounded-xl hover:bg-muc-blue/90 transition-all shadow-lg"
            >
              D'accord
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Admin;
