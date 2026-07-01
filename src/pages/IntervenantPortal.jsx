import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, PlusCircle, Trash, Calendar, AlertTriangle, CheckCircle, 
  Clock, Check, X, Trash2, Banknote, CreditCard, Shield, ShieldAlert, 
  Coins, Edit3, FileText, Users, Mail, User, Lock, Plus, Phone
} from 'lucide-react';
import { API_URL } from '../config';
import ReservationForm from '../components/ReservationForm';

import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'fr': fr,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const CHAMBRES_NAMES = {
  '1': 'Chambre 1',
  '2': 'Chambre 2',
  '3': 'Chambre 3',
  '4': 'Chambre 4',
  '5': 'Chambre 5',
  '6': 'Chambre 6',
  '7': 'Chambre 7',
  '8': 'Chambre 8',
  '9': 'Chambre 9',
  '10': 'Chambre 10',
  '11': 'Chambre 11',
  '12': 'Chambre 12',
  '13': 'Chambre 13',
  '14': 'Chambre 14',
  '15': 'Chambre 15',
  '16': 'Chambre 16',
  '17': 'Chambre 17',
  '18': 'Chambre 18',
  '19': 'Chambre 19',
  '20': 'Chambre 20',
};

const formatAdminName = (email) => {
  if (!email) return 'Non validé';
  if (email.includes('@')) {
    const namePart = email.split('@')[0];
    return namePart
      .split('.')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return email;
};

function IntervenantPortal() {
  const navigate = useNavigate();
  const token = localStorage.getItem('staffToken') || null;

  // Profil Intervenant
  const [intervenant, setIntervenant] = useState(null);

  // Navigation & États principaux
  const [activeTab, setActiveTab] = useState('reservations');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminFeedback, setAdminFeedback] = useState(null);

  // Filtres & Tris
  const [reservationSearch, setReservationSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  // Modales Réservations
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [editingReservation, setEditingReservation] = useState(null);

  // Paiement Manuel
  const [showManualPaymentModal, setShowManualPaymentModal] = useState(false);
  const [manualPaymentRes, setManualPaymentRes] = useState(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({ montant: '', mode: 'ESPECES', typePaiement: 'ACOMPTE' });

  // Demande de Paiement Stripe
  const [paymentMenuResId, setPaymentMenuResId] = useState(null);
  const [paymentLinkData, setPaymentLinkData] = useState(null);

  // Clients
  const [clients, setClients] = useState([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [editClientForm, setEditClientForm] = useState({ nom: '', email: '', telephone: '', adressePostale: '' });

  // Planning
  const [planningEvents, setPlanningEvents] = useState([]);
  const [loadingPlanning, setLoadingPlanning] = useState(false);

  // Profil Form
  const [profileForm, setProfileForm] = useState({ nom: '', prenom: '', email: '', telephone: '', password: '' });
  const [disponibilites, setDisponibilites] = useState([]);
  const [newDispo, setNewDispo] = useState({ dateDebut: '', dateFin: '' });

  // Facturation intervenants connectés
  const [missions, setMissions] = useState([]);
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [billingMonth, setBillingMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Redirection si token absent
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Chargement des infos de l'intervenant connecté
  useEffect(() => {
    if (token) {
      fetchIntervenantProfile();
    }
  }, [token]);

  // Chargement des données selon l'onglet actif
  useEffect(() => {
    if (token && intervenant) {
      if (activeTab === 'reservations' || activeTab === 'devis' || activeTab === 'clients') {
        fetchReservations();
      } else if (activeTab === 'planning') {
        fetchPlanningEvents();
      } else if (activeTab === 'facturation') {
        fetchMissions();
      }
    }
  }, [token, intervenant, activeTab]);

  // Extraction dynamique de la liste des clients à partir des réservations
  useEffect(() => {
    const clientMap = new Map();
    reservations.forEach(r => {
      if (r.client) {
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

  const showFeedback = (msg, type = 'success') => {
    setAdminFeedback({ type, msg });
    setTimeout(() => setAdminFeedback(null), 4000);
  };

  const handleLogout = () => {
    localStorage.removeItem('staffToken');
    navigate('/login');
  };

  const fetchIntervenantProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/intervenant/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      if (!res.ok) throw new Error("Erreur de récupération du profil");
      const data = await res.json();
      setIntervenant(data);
      setProfileForm({
        nom: data.nom || '',
        prenom: data.prenom || '',
        email: data.email || '',
        telephone: data.telephone || '',
        password: ''
      });
      setDisponibilites(data.disponibilites || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMissions = async () => {
    if (!intervenant) return;
    setLoadingMissions(true);
    try {
      const res = await fetch(`${API_URL}/api/intervenant/${intervenant.id}/missions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMissions(data);
      }
    } catch (err) {
      console.error("Erreur de récupération des missions :", err);
    } finally {
      setLoadingMissions(false);
    }
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
        setReservations([]);
      }
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des données');
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlanningEvents = async () => {
    setLoadingPlanning(true);
    try {
      const res = await fetch(`${API_URL}/api/equipe/planning`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map(evt => ({
          ...evt,
          start: new Date(evt.start),
          end: new Date(evt.end)
        }));
        setPlanningEvents(formatted);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlanning(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Réservation supprimée avec succès !');
        setDeleteModalId(null);
        fetchReservations();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (err) {
      console.error(err);
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
        showFeedback(actionType === 'cancel-caution' ? data.message : `${data.message}. Le lien a été envoyé au client.`);
        if (data.url) setPaymentLinkData({ link: data.url, id, action: actionType });
        fetchReservations();
      } else {
        if (contentType && contentType.includes("application/json")) {
          const errData = await res.json();
          showFeedback(errData.error || `Erreur lors de la génération (${actionType})`, 'error');
        } else {
          const errText = await res.text();
          console.error('Server error response:', errText);
          showFeedback(`Erreur serveur: ${res.status}`, 'error');
        }
      }
    } catch (err) {
      showFeedback('Erreur réseau ou serveur inaccessible', 'error');
    }
  };

  const handleProlongDevis = async (resDevis) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/devis/${resDevis.id}/prolong`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Validité du devis prolongée de 7 jours !');
        fetchReservations();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/intervenant/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...profileForm,
          disponibilites
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la sauvegarde du profil");
      }
      const updated = await res.json();
      setIntervenant(updated);
      setProfileForm(prev => ({ ...prev, password: '' }));
      showFeedback("Profil et disponibilités enregistrés avec succès !");
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const addDisponibilite = () => {
    if (!newDispo.dateDebut || !newDispo.dateFin) {
      showFeedback("Veuillez saisir une date de début et de fin.", "error");
      return;
    }
    const start = new Date(newDispo.dateDebut);
    const end = new Date(newDispo.dateFin);
    if (end < start) {
      showFeedback("La date de fin doit être postérieure à la date de début.", "error");
      return;
    }
    setDisponibilites([
      ...disponibilites,
      {
        dateDebut: newDispo.dateDebut,
        dateFin: newDispo.dateFin
      }
    ]);
    setNewDispo({ dateDebut: '', dateFin: '' });
  };

  const removeDisponibilite = (index) => {
    setDisponibilites(disponibilites.filter((_, i) => i !== index));
  };

  // Gestion de l'édition client
  const startEditClient = (c) => {
    setEditClientForm({
      nom: c.nom || '',
      email: c.email || '',
      telephone: c.telephone || '',
      adressePostale: c.adressePostale || ''
    });
    setIsEditingClient(true);
  };

  const saveClient = async (e) => {
    e.preventDefault();
    setIsSavingClient(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/clients/${selectedClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editClientForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedClient(updated);
        setIsEditingClient(false);
        showFeedback('Client mis à jour avec succès');
        fetchReservations();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingClient(false);
    }
  };

  if (!intervenant) {
    return (
      <div className="min-h-screen bg-slate-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-muc-blue"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans p-4 md:p-8">
      {/* Alertes de feedback */}
      {adminFeedback && (
        <div className={`fixed bottom-5 right-5 z-[9999] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border animate-bounce ${
          adminFeedback.type === 'error' 
            ? 'bg-red-50 border-red-200 text-red-700' 
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {adminFeedback.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
          <span className="text-sm font-bold">{adminFeedback.msg}</span>
        </div>
      )}

      <div className="w-full max-w-[96%] mx-auto relative">
        <div className="bg-[#F8F8F8] pb-8 border-b border-slate-200 shadow-sm mb-8">
          <div className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-black text-muc-blue tracking-tight uppercase">Espace Équipe</h1>
                <p className="text-sm font-medium text-slate-500">Portail Intervenant - Gîte de la Maladrerie (Connecté en tant que {intervenant.prenom} {intervenant.nom})</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-2 bg-muc-blue text-white font-bold rounded-lg hover:bg-muc-blue/90 transition-colors shadow-md"
                >
                  + Ajouter une réservation
                </button>
                <button
                  onClick={handleLogout}
                  className="px-6 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Déconnexion
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 whitespace-nowrap scrollbar-hide">
              <button 
                onClick={() => setActiveTab('reservations')} 
                className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all whitespace-nowrap ${
                  activeTab === 'reservations' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Réservations
              </button>
              <button 
                onClick={() => setActiveTab('devis')} 
                className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${
                  activeTab === 'devis' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Devis
              </button>
              <button 
                onClick={() => setActiveTab('clients')} 
                className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${
                  activeTab === 'clients' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Clients
              </button>
              <button 
                onClick={() => setActiveTab('planning')} 
                className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${
                  activeTab === 'planning' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Planning
              </button>
              <button 
                onClick={() => setActiveTab('profil')} 
                className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${
                  activeTab === 'profil' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Mon Profil
              </button>
              {intervenant?.statut === 'INDEPENDANT' && (
                <button 
                  onClick={() => setActiveTab('facturation')} 
                  className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${
                    activeTab === 'facturation' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Ma Facturation
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TAB 1: Réservations */}
        {activeTab === 'reservations' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="w-full relative">
                <input
                  type="text"
                  placeholder="Rechercher une réservation (Nom, Email)..."
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-muc-blue focus:ring-0 transition-all font-medium text-slate-600"
                  value={reservationSearch}
                  onChange={(e) => setReservationSearch(e.target.value)}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
              <div className="overflow-x-auto">
                <table className="text-left border-collapse table-fixed w-full" style={{ minWidth: '1100px' }}>
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th onClick={() => handleSort('client')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Client {sortConfig.key === 'client' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('dateDebut')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Dates {sortConfig.key === 'dateDebut' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('prestations')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Prestations {sortConfig.key === 'prestations' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('restauration')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Restauration {sortConfig.key === 'restauration' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('tarif')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Tarif {sortConfig.key === 'tarif' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('statut')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Statut {sortConfig.key === 'statut' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('validePar')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Validé par {sortConfig.key === 'validePar' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th onClick={() => handleSort('createdAt')} className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors select-none">
                        Création {sortConfig.key === 'createdAt' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.filter(res => !res.statut?.includes('DEVIS')).filter((res) => {
                      const search = reservationSearch?.toLowerCase() || '';
                      if (!search) return true;
                      return (
                        res.client?.nom?.toLowerCase().includes(search) ||
                        res.client?.email?.toLowerCase().includes(search)
                      );
                    }).sort((a, b) => {
                      if (sortConfig.key === 'createdAt') {
                        return sortConfig.direction === 'asc' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt);
                      }
                      if (sortConfig.key === 'dateDebut') {
                        return sortConfig.direction === 'asc' ? new Date(a.dateDebut) - new Date(b.dateDebut) : new Date(b.dateFin) - new Date(a.dateDebut);
                      }
                      return 0;
                    }).map((res) => (
                      <tr key={res.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800 truncate" title={res.client?.nom || 'Client inconnu'}>{res.client?.nom || 'Client inconnu'}</div>
                          <div className="text-xs text-slate-500 truncate" title={res.client?.email || '-'}>{res.client?.email || '-'}</div>
                          <div className="text-xs text-slate-500 truncate">{res.client?.telephone || '-'}</div>
                        </td>
                        <td className="px-2 py-3">
                          <div className="text-xs font-bold text-slate-700">{new Date(res.dateDebut).toLocaleDateString('fr-FR')}</div>
                          <div className="text-xs font-medium text-slate-500">{new Date(res.dateFin).toLocaleDateString('fr-FR')}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-bold text-muc-blue leading-tight">
                            {(res.chambres || []).map(id => CHAMBRES_NAMES[id] || `Ch. ${id}`).join(', ')}
                          </div>
                          {res.salles && (
                            <div className="text-xs font-bold text-indigo-600 mt-1 flex flex-col leading-tight">
                              {res.salles.salle15 && <span>💼 Salle 15 pl.</span>}
                              {res.salles.salle12 && <span>💼 Salle 12 pl.</span>}
                            </div>
                          )}
                          {(() => {
                            let totalAdultes = 0;
                            let totalEnfants = 0;
                            if (res.occupants && res.occupants.length > 0) {
                              totalAdultes = res.occupants.filter(o => o.estAdulte).length;
                              totalEnfants = res.occupants.filter(o => !o.estAdulte).length;
                            } else if (res.chambresDetails) {
                              Object.values(res.chambresDetails).forEach(ch => {
                                totalAdultes += parseInt(ch.adultes || 0);
                                totalEnfants += parseInt(ch.enfants || 0);
                              });
                            }
                            const total = totalAdultes + totalEnfants;
                            return (
                              <div className="text-xs font-bold text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded inline-block leading-tight">
                                👥 {total} occupant{total > 1 ? 's' : ''}
                                <span className="font-normal text-slate-500 block text-[10px]">({totalAdultes} Ad., {totalEnfants} Enf.)</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wider font-bold">
                            {(() => {
                              let totalPtitDej = 0;
                              let totalDej = 0;
                              let totalDiner = 0;
                              if (res.repas) {
                                Object.values(res.repas).forEach(r => {
                                  if (r.PETIT_DEJ) totalPtitDej += (parseInt(r.PETIT_DEJ.ADULTE) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_12) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_5) || 0);
                                  if (r.DEJEUNER) totalDej += (parseInt(r.DEJEUNER.ADULTE) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_5) || 0);
                                  if (r.DINER) totalDiner += (parseInt(r.DINER.ADULTE) || 0) + (parseInt(r.DINER.ENFANT_MOINS_12) || 0) + (parseInt(r.DINER.ENFANT_MOINS_5) || 0);
                                });
                              }
                              if (totalPtitDej === 0 && totalDej === 0 && totalDiner === 0) {
                                return <span className="text-slate-400 normal-case italic font-medium">Aucune</span>;
                              }
                              return (
                                <>
                                  {totalPtitDej > 0 && <span className="text-orange-600">🥐 {totalPtitDej} Petit-déj</span>}
                                  {totalDej > 0 && <span className="text-green-600">🍲 {totalDej} Déj</span>}
                                  {totalDiner > 0 && <span className="text-blue-600">🍝 {totalDiner} Dîn</span>}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="text-sm font-black text-slate-800 leading-tight">
                            {res.prixTotal ? `${res.prixTotal.toFixed(2)} €` : 'N/A'}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1.5 text-[10px]">
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-bold uppercase">Arrhes</span>
                              <span className={res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE' ? 'text-green-600 font-bold' : 'text-amber-600'}>
                                {res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE' ? 'Payé' : 'Attente'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-bold uppercase">Solde</span>
                              <span className={res.statutPaiement === 'PAYE' ? 'text-green-600 font-bold' : 'text-amber-600'}>
                                {res.statutPaiement === 'PAYE' ? 'Payé' : 'Attente'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {/* Affichage simple du statut sans validation modifiable par select */}
                          <span className={`px-2.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider inline-block ${
                            res.statut === 'EN_ATTENTE' ? 'bg-amber-100 text-amber-800' :
                            res.statut === 'RESERVE' ? 'bg-indigo-100 text-indigo-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {res.statut === 'EN_ATTENTE' ? 'À valider admin' : res.statut === 'RESERVE' ? 'Confirmé' : 'Refusé'}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-bold text-slate-600">
                          {formatAdminName(res.validePar)}
                        </td>
                        <td className="px-2 py-3 text-xs text-slate-500">
                          {new Date(res.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {/* Aucun bouton Accepter/Refuser n'est rendu pour l'intervenant */}
                            {res.statut === 'RESERVE' && (
                              <>
                                {res.statutPaiement !== 'PAYE' && (
                                  <button onClick={() => setPaymentMenuResId(res.id)} className="p-2 bg-blue-50 text-muc-blue rounded-lg hover:bg-muc-blue hover:text-white transition-colors" title="Demander un paiement">
                                    <CreditCard size={18} />
                                  </button>
                                )}
                                {res.statutCaution !== 'DEPOSEE' && res.statutCaution !== 'RESTITUEE' && (
                                  <button onClick={() => triggerPaymentAction(res.id, 'caution')} className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-500 hover:text-white transition-colors" title="Demander la caution">
                                    <Shield size={18} />
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={() => {
                                setManualPaymentRes(res);
                                const isAcomptePaid = res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE';
                                setManualPaymentForm({
                                  montant: (isAcomptePaid ? (res.montantSolde || Math.round((res.prixTotal || 0) * 0.7 * 100) / 100) : (res.montantAcompte || Math.round((res.prixTotal || 0) * 0.3 * 100) / 100)).toString(),
                                  mode: 'ESPECES',
                                  typePaiement: isAcomptePaid ? 'SOLDE' : 'ACOMPTE'
                                });
                                setShowManualPaymentModal(true);
                              }}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors"
                              title="Paiement manuel"
                            >
                              <Banknote size={18} />
                            </button>
                            {(res.statut === 'RESERVE' || res.statut === 'TERMINE') && (
                              <button
                                onClick={() => window.open(`${API_URL}/api/admin/reservations/${res.id}/facture-pdf?token=${token}`, '_blank')}
                                className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
                                title="Facture PDF"
                              >
                                <FileText size={18} />
                              </button>
                            )}
                            <button onClick={() => setEditingReservation(res)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors" title="Modifier">
                              <Edit3 size={18} />
                            </button>
                            <button onClick={() => setDeleteModalId(res.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Supprimer">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Devis */}
        {activeTab === 'devis' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="w-full md:w-1/2 relative">
                <input
                  type="text"
                  placeholder="Rechercher un devis..."
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-muc-blue focus:ring-0 transition-all font-medium text-slate-600"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Prospect</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Dates</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Prestations</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Restauration</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Tarif</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Expire le</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Statut</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Création</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.filter(res => res.statut?.includes('DEVIS')).filter((res) => {
                      const matchesSearch = !clientSearch ||
                        (res.client?.nom?.toLowerCase().includes(clientSearch.toLowerCase()) ||
                          res.client?.email?.toLowerCase().includes(clientSearch.toLowerCase()));
                      return matchesSearch;
                    }).map((res) => (
                      <tr key={res.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{res.client?.nom || 'Client inconnu'}</div>
                          <div className="text-xs text-slate-500">{res.client?.email || '-'}</div>
                        </td>
                        <td className="p-4 text-xs">
                          <div>Du {new Date(res.dateDebut).toLocaleDateString()}</div>
                          <div>Au {new Date(res.dateFin).toLocaleDateString()}</div>
                        </td>
                        <td className="p-4 text-xs font-bold text-muc-blue">
                          {(res.chambres || []).map(id => CHAMBRES_NAMES[id] || `Ch. ${id}`).join(', ')}
                        </td>
                        <td className="p-4 text-xs text-slate-600">
                          Restauration demandée
                        </td>
                        <td className="p-4 font-black text-slate-800">
                          {res.prixTotal}€
                        </td>
                        <td className="p-4 text-xs">
                          {res.expireLe ? new Date(res.expireLe).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            res.statut === 'DEVIS_EN_ATTENTE' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {res.statut === 'DEVIS_EN_ATTENTE' ? 'En attente' : 'Expiré'}
                          </span>
                        </td>
                        <td className="p-4 text-right text-xs text-slate-500">
                          {new Date(res.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleProlongDevis(res)}
                              className="p-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded transition-colors"
                              title="Prolonger validité (7j)"
                            >
                              <Clock size={16} />
                            </button>
                            <button
                              onClick={() => window.open(`${API_URL}/api/admin/devis/${res.id}/pdf?token=${token}`, '_blank')}
                              className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded transition-colors"
                              title="PDF Devis"
                            >
                              <FileText size={16} />
                            </button>
                            {/* Pas de bouton de transformation/validation en réservation */}
                            <button onClick={() => setEditingReservation(res)} className="p-1.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded transition-colors" title="Modifier">
                              <Edit3 size={16} />
                            </button>
                            <button onClick={() => setDeleteModalId(res.id)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-red-500 hover:text-white rounded transition-colors" title="Supprimer">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Clients */}
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
                  <div 
                    key={idx} 
                    className="bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:shadow-md transition-shadow flex justify-between items-center" 
                    onClick={() => { setSelectedClient(client); setShowClientModal(true); }}
                  >
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

        {/* TAB 4: Planning */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Planning Équipe & Missions</h2>
                  <p className="text-xs text-slate-500 mt-1">Consultez les séjours et les interventions programmées.</p>
                </div>
                <button 
                  onClick={fetchPlanningEvents}
                  disabled={loadingPlanning}
                  className="px-4 py-2 bg-muc-blue text-white rounded-lg hover:bg-muc-blue/90 transition-all text-sm font-bold flex items-center gap-2 shadow-sm"
                >
                  {loadingPlanning ? "Chargement..." : "Rafraîchir"}
                </button>
              </div>

              {loadingPlanning ? (
                <div className="flex justify-center items-center h-96">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-muc-blue"></div>
                </div>
              ) : (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <BigCalendar
                    localizer={localizer}
                    events={planningEvents}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 600 }}
                    messages={{
                      next: "Suivant",
                      previous: "Précédent",
                      today: "Aujourd'hui",
                      month: "Mois",
                      week: "Semaine",
                      day: "Jour",
                      agenda: "Agenda",
                      date: "Date",
                      time: "Heure",
                      event: "Événement",
                      noEventsInRange: "Rien sur cette période",
                    }}
                    culture="fr"
                    eventPropGetter={(event) => {
                      let style = {
                        backgroundColor: '#3b82f6',
                        borderRadius: '8px',
                        opacity: 0.9,
                        color: 'white',
                        border: 'none',
                        display: 'block',
                        padding: '4px 8px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        cursor: 'pointer'
                      };
                      if (event.type === 'dispo') {
                        style.backgroundColor = '#10b981';
                      } else if (event.type === 'reservation') {
                        style.backgroundColor = '#4f46e5';
                      } else if (event.type === 'mission') {
                        style.backgroundColor = '#f59e0b';
                      }
                      return { style };
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: Profil */}
        {activeTab === 'profil' && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6 space-y-6">
            <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Mon Profil & Disponibilités</h2>
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">1. Mes Informations</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Prénom</label>
                    <input 
                      type="text" 
                      value={profileForm.prenom} 
                      onChange={e => setProfileForm({...profileForm, prenom: e.target.value})} 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-muc-blue text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
                    <input 
                      type="text" 
                      value={profileForm.nom} 
                      onChange={e => setProfileForm({...profileForm, nom: e.target.value})} 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-muc-blue text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                    <input 
                      type="email" 
                      value={profileForm.email} 
                      onChange={e => setProfileForm({...profileForm, email: e.target.value})} 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-muc-blue text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Téléphone</label>
                    <input 
                      type="tel" 
                      value={profileForm.telephone} 
                      onChange={e => setProfileForm({...profileForm, telephone: e.target.value})} 
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-muc-blue text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Changer le mot de passe (laissez vide si inchangé)</label>
                  <input 
                    type="password" 
                    value={profileForm.password} 
                    onChange={e => setProfileForm({...profileForm, password: e.target.value})} 
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-muc-blue text-sm"
                    placeholder="Nouveau mot de passe"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">2. Mes Disponibilités</h3>
                <div className="bg-slate-50 p-4 border border-slate-100 rounded-2xl flex flex-col sm:flex-row items-end gap-4">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Date début</label>
                    <input 
                      type="date" 
                      value={newDispo.dateDebut}
                      onChange={e => setNewDispo({...newDispo, dateDebut: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm"
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Date fin</label>
                    <input 
                      type="date" 
                      value={newDispo.dateFin}
                      onChange={e => setNewDispo({...newDispo, dateFin: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={addDisponibilite}
                    className="w-full sm:w-auto px-5 py-3 bg-muc-blue text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-muc-blue/10 shrink-0"
                  >
                    <Plus size={16} /> Ajouter
                  </button>
                </div>

                {disponibilites.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {disponibilites.map((d, index) => (
                      <div key={index} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
                        <span className="text-sm text-slate-700 flex items-center gap-2 font-semibold">
                          Du {new Date(d.dateDebut).toLocaleDateString('fr-FR')} au {new Date(d.dateFin).toLocaleDateString('fr-FR')}
                        </span>
                        <button 
                          type="button"
                          onClick={() => removeDisponibilite(index)}
                          className="text-slate-400 hover:text-red-500 p-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Aucune date de disponibilité enregistrée.</p>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end">
                <button 
                  type="submit"
                  className="px-6 py-3 bg-muc-blue text-white font-black uppercase tracking-wider rounded-xl transition-all text-xs shadow-md shadow-muc-blue/15 cursor-pointer"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* MODALE: Nouveau/Modifier Réservation */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-black text-muc-blue tracking-tight uppercase">Ajouter une réservation</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl px-2">&times;</button>
            </div>
            <div className="p-6">
              <ReservationForm
                events={reservations.map(r => ({ id: r.id, start: r.dateDebut, end: r.dateFin, chambres: r.chambres }))}
                isAdmin={true}
                onCreated={() => { setShowAddModal(false); fetchReservations(); }}
              />
            </div>
          </div>
        </div>
      )}

      {editingReservation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-xl font-black text-muc-blue tracking-tight uppercase">
                  {editingReservation.statut?.includes('DEVIS') ? 'Modifier le devis' : 'Modifier la réservation'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">Édition de l'ID #{editingReservation.id}</p>
              </div>
              <button onClick={() => setEditingReservation(null)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl px-2">&times;</button>
            </div>
            <div className="p-6">
              <ReservationForm
                events={reservations.map(r => ({ id: r.id, start: r.dateDebut, end: r.dateFin, chambres: r.chambres }))}
                isAdmin={true}
                isDevis={editingReservation.statut?.includes('DEVIS')}
                existingReservation={editingReservation}
                onCreated={() => { setEditingReservation(null); fetchReservations(); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODALE: Suppression */}
      {deleteModalId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-100 p-6 text-center">
            <h3 className="text-lg font-black text-slate-800 mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-slate-500 mb-6">Êtes-vous sûr de vouloir supprimer cet élément ?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteModalId(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Annuler</button>
              <button onClick={() => handleDelete(deleteModalId)} className="px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-md">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE: Paiement Manuel */}
      {showManualPaymentModal && manualPaymentRes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-muc-blue p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tight">Paiement Manuel</h3>
              <p className="text-sm opacity-95">Client : {manualPaymentRes.client?.nom}</p>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Montant (€)</label>
                <input
                  type="number"
                  value={manualPaymentForm.montant}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, montant: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Mode</label>
                <select
                  value={manualPaymentForm.mode}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, mode: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold"
                >
                  <option value="ESPECES">Espèces</option>
                  <option value="CHEQUE">Chèque</option>
                  <option value="VIREMENT">Virement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'ACOMPTE', montant: (manualPaymentRes.montantAcompte || Math.round((manualPaymentRes.prixTotal || 0) * 0.3 * 100) / 100).toString() })}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${manualPaymentForm.typePaiement === 'ACOMPTE' ? 'bg-muc-blue border-muc-blue text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                  >
                    Acompte
                  </button>
                  <button 
                    onClick={() => setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'SOLDE', montant: (manualPaymentRes.montantSolde || Math.round((manualPaymentRes.prixTotal || 0) * 0.7 * 100) / 100).toString() })}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${manualPaymentForm.typePaiement === 'SOLDE' ? 'bg-muc-blue border-muc-blue text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                  >
                    Solde
                  </button>
                  <button 
                    onClick={() => setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'TOTAL', montant: (manualPaymentRes.prixTotal || 0).toString() })}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${manualPaymentForm.typePaiement === 'TOTAL' ? 'bg-muc-blue border-muc-blue text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                  >
                    Total
                  </button>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowManualPaymentModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all">Annuler</button>
                <button 
                  onClick={async () => {
                    const res = await fetch(`${API_URL}/api/admin/reservations/${manualPaymentRes.id}/manual-payment`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify(manualPaymentForm)
                    });
                    if (res.ok) {
                      showFeedback('Paiement enregistré !');
                      setShowManualPaymentModal(false);
                      fetchReservations();
                    }
                  }}
                  className="flex-1 py-3 bg-muc-blue text-white font-black uppercase tracking-wider rounded-xl hover:bg-muc-blue/95 transition-all shadow-md"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE: Menu Stripe */}
      {paymentMenuResId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setPaymentMenuResId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="bg-muc-blue p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Demander un paiement</h3>
              <button onClick={() => setPaymentMenuResId(null)} className="text-white/70 hover:text-white font-bold text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-3">
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'acompte'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-muc-yellow/15 border-2 border-slate-100 hover:border-muc-yellow rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-muc-yellow flex items-center justify-center text-slate-500 group-hover:text-white transition-colors"><CreditCard size={20} /></div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Les arrhes (30%)</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien d'acompte</span>
                </div>
              </button>
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'solde'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-muc-blue/15 border-2 border-slate-100 hover:border-muc-blue rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-muc-blue flex items-center justify-center text-slate-500 group-hover:text-white transition-colors"><CreditCard size={20} /></div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Le solde</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien du solde</span>
                </div>
              </button>
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'totalite'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-emerald-500/15 border-2 border-slate-100 hover:border-emerald-500 rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-emerald-500 flex items-center justify-center text-slate-500 group-hover:text-white transition-colors"><CreditCard size={20} /></div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">La totalité (100%)</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien total</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'facturation' && intervenant?.statut === 'INDEPENDANT' && (() => {
        const [year, month] = billingMonth.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);
        
        const filteredMissions = missions.filter(m => {
          const mDate = m.date ? new Date(m.date) : (m.reservation?.dateDebut ? new Date(m.reservation.dateDebut) : null);
          if (!mDate) return false;
          return mDate >= monthStart && mDate <= monthEnd;
        });
        
        const totalMois = filteredMissions.reduce((sum, m) => sum + (m.montant || 0), 0);
        const monthStartLoc = new Date(year, month - 1, 1);
        const monthName = monthStartLoc.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        
        const monthsOptions = [
          { value: 1, label: 'Janvier' },
          { value: 2, label: 'Février' },
          { value: 3, label: 'Mars' },
          { value: 4, label: 'Avril' },
          { value: 5, label: 'Mai' },
          { value: 6, label: 'Juin' },
          { value: 7, label: 'Juillet' },
          { value: 8, label: 'Août' },
          { value: 9, label: 'Septembre' },
          { value: 10, label: 'Octobre' },
          { value: 11, label: 'Novembre' },
          { value: 12, label: 'Décembre' }
        ];
        
        const currentYear = new Date().getFullYear();
        const yearsOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

        return (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Suivi de ma Facturation</h2>
                <p className="text-slate-400 text-xs mt-1">Consultez et calculez vos honoraires pour chaque mois de prestation.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={month}
                  onChange={(e) => {
                    setBillingMonth(`${year}-${String(e.target.value).padStart(2, '0')}`);
                  }}
                  className="flex-1 sm:w-40 bg-slate-50 p-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-muc-blue text-sm bg-white"
                >
                  {monthsOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select
                  value={year}
                  onChange={(e) => {
                    setBillingMonth(`${e.target.value}-${String(month).padStart(2, '0')}`);
                  }}
                  className="w-24 bg-slate-50 p-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-muc-blue text-sm bg-white"
                >
                  {yearsOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {loadingMissions ? (
              <div className="p-12 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-muc-blue border-t-transparent rounded-full mb-4"></div>
                <p className="text-slate-500 font-medium text-sm">Chargement de votre facturation...</p>
              </div>
            ) : filteredMissions.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-slate-500 font-bold text-sm">Aucune prestation enregistrée pour {monthName}.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-400 uppercase tracking-widest">
                          <th className="p-4">Date</th>
                          <th className="p-4">Prestation effectuée</th>
                          <th className="p-4">Référence Séjour</th>
                          <th className="p-4 text-center">Statut Mission</th>
                          <th className="p-4 text-right">Rémunération</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMissions.map((m, idx) => {
                          const mDate = m.date ? new Date(m.date) : (m.reservation?.dateDebut ? new Date(m.reservation.dateDebut) : null);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 text-slate-600 font-medium">
                                {mDate ? mDate.toLocaleDateString('fr-FR') : '—'}
                              </td>
                              <td className="p-4 font-bold text-slate-800">
                                {m.typeMission}
                              </td>
                              <td className="p-4 text-slate-500 font-medium">
                                {m.reservation?.numeroDevis || `Résa #${m.reservationId}`}
                              </td>
                              <td className="p-4 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                  m.statut === 'ACCEPTEE' 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : m.statut === 'REFUSEE' 
                                      ? 'bg-rose-100 text-rose-800' 
                                      : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {m.statut === 'ACCEPTEE' ? 'Validé' : m.statut === 'REFUSEE' ? 'Refusé' : 'En attente'}
                                </span>
                              </td>
                              <td className="p-4 text-right font-black text-slate-800">
                                {(m.montant || 0).toFixed(2)} €
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-amber-800 uppercase text-xs tracking-wider block">Total de mes honoraires</span>
                    <span className="text-slate-400 text-[10px] mt-0.5 block">Sur la base des prestations validées ou en attente pour {monthName}.</span>
                  </div>
                  <span className="font-black text-amber-900 text-2xl whitespace-nowrap">{totalMois.toFixed(2)} €</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {paymentLinkData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800">Lien Stripe généré</h3>
              <button onClick={() => setPaymentLinkData(null)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Vous pouvez copier le lien ci-dessous et le transmettre directement au client :</p>
            <div className="flex items-center gap-2 mb-6">
              <input type="text" readOnly value={paymentLinkData.link} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none" />
              <button 
                onClick={() => { navigator.clipboard.writeText(paymentLinkData.link); alert('Copié !'); }}
                className="px-4 py-3 bg-muc-blue text-white text-sm font-bold rounded-lg hover:bg-blue-800 transition-colors"
              >
                Copier
              </button>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setPaymentLinkData(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE: Fiche Client */}
      {showClientModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh] border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-muc-blue uppercase tracking-tight">Fiche Client</h2>
              <button onClick={() => setShowClientModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-slate-800">Coordonnées</h3>
                  {!isEditingClient && (
                    <button onClick={() => startEditClient(selectedClient)} className="px-3 py-1 bg-muc-blue text-white rounded-md text-xs font-bold hover:bg-blue-800 transition-colors">
                      ✏️ Modifier
                    </button>
                  )}
                </div>
                {isEditingClient ? (
                  <form onSubmit={saveClient} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Nom complet</label>
                      <input required type="text" value={editClientForm.nom} onChange={e => setEditClientForm({ ...editClientForm, nom: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                      <input required type="email" value={editClientForm.email} onChange={e => setEditClientForm({ ...editClientForm, email: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Téléphone</label>
                      <input required type="text" value={editClientForm.telephone} onChange={e => setEditClientForm({ ...editClientForm, telephone: e.target.value })} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Adresse</label>
                      <textarea value={editClientForm.adressePostale} onChange={e => setEditClientForm({ ...editClientForm, adressePostale: e.target.value })} rows="2" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm resize-none" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setIsEditingClient(false)} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-md text-xs font-bold">Annuler</button>
                      <button type="submit" disabled={isSavingClient} className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-bold hover:bg-green-700">{isSavingClient ? 'Enregistrement...' : 'Enregistrer'}</button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-slate-600"><strong>Nom:</strong> {selectedClient.nom}</p>
                    <p className="text-sm text-slate-600"><strong>Email:</strong> {selectedClient.email}</p>
                    <p className="text-sm text-slate-600"><strong>Téléphone:</strong> {selectedClient.telephone}</p>
                    <p className="text-sm text-slate-600"><strong>Adresse:</strong> {selectedClient.adressePostale || 'Non renseignée'}</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-bold text-slate-800 mb-3">Historique des Séjours</h3>
                <div className="space-y-4">
                  {selectedClient.reservations.map(res => (
                    <div key={res.id} className="border border-slate-100 p-4 rounded-xl bg-white shadow-sm flex justify-between items-center">
                      <div>
                        <span className="text-sm font-bold text-muc-blue">Réf: {res.numeroDevis || `Résa #${res.id}`}</span>
                        <div className="text-xs text-slate-500 mt-1">Du {new Date(res.dateDebut).toLocaleDateString()} au {new Date(res.dateFin).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-2">
                        {res.numeroDevis && (
                          <button onClick={() => window.open(`${API_URL}/api/admin/devis/${res.id}/pdf?token=${token}`, '_blank')} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-bold">Devis PDF</button>
                        )}
                        {(res.statut === 'RESERVE' || res.statut === 'TERMINE') && (
                          <button onClick={() => window.open(`${API_URL}/api/admin/reservations/${res.id}/facture-pdf?token=${token}`, '_blank')} className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-bold">Facture PDF</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IntervenantPortal;
