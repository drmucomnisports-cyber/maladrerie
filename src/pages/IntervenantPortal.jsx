import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { 
  Search, Calendar as CalendarIcon, User, LogOut, CheckCircle, 
  X, Eye, Phone, Mail, Plus, Trash2, Lock, ClipboardList, 
  Users, CalendarRange, Clock, AlertTriangle, AlertCircle
} from 'lucide-react';
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

function IntervenantPortal() {
  const navigate = useNavigate();
  const token = localStorage.getItem('staffToken');

  // Navigation & UI states
  const [activeTab, setActiveTab] = useState('missions');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Data states
  const [intervenant, setIntervenant] = useState(null);
  const [missions, setMissions] = useState([]);
  const [planningEvents, setPlanningEvents] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [devis, setDevis] = useState([]);
  const [clients, setClients] = useState([]);

  // Search & Filter states
  const [searchRes, setSearchRes] = useState('');
  const [searchDevis, setSearchDevis] = useState('');
  const [searchClients, setSearchClients] = useState('');

  // Selected Detail Modals
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  // Profile Form States
  const [profileForm, setProfileForm] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    password: ''
  });
  const [disponibilites, setDisponibilites] = useState([]);
  const [newDispo, setNewDispo] = useState({
    dateDebut: '',
    dateFin: ''
  });

  // Redirect to login if token is missing
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Load basic intervenant profile first
  useEffect(() => {
    if (token) {
      fetchIntervenantProfile();
    }
  }, [token]);

  // Fetch tab-specific data when active tab changes
  useEffect(() => {
    if (token && intervenant) {
      if (activeTab === 'missions') {
        fetchMissions();
      } else if (activeTab === 'agenda') {
        fetchPlanningEvents();
      } else if (activeTab === 'reservations') {
        fetchReservationsAndDevis();
      } else if (activeTab === 'clients') {
        fetchReservationsAndDevis(); // Needed to extract client list dynamically
      }
    }
  }, [token, intervenant, activeTab]);

  // Extract client list dynamically from reservations
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

  const showFeedbackMsg = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
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
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/intervenant/${intervenant.id}/missions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Erreur de récupération des missions");
      const data = await res.json();
      setMissions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlanningEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/equipe/planning`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Erreur de récupération de l'agenda");
      const data = await res.json();
      const formatted = data.map(evt => ({
        ...evt,
        start: new Date(evt.start),
        end: new Date(evt.end)
      }));
      setPlanningEvents(formatted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchReservationsAndDevis = async () => {
    setLoading(true);
    try {
      // Fetch confirmed bookings
      const resRes = await fetch(`${API_URL}/api/admin/reservations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resRes.ok) {
        const data = await resRes.json();
        setReservations(data);
      }

      // Fetch pending quotes (devis)
      const resDevis = await fetch(`${API_URL}/api/admin/devis`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resDevis.ok) {
        const data = await resDevis.json();
        setDevis(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMissionStatus = async (missionId, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/intervenant/missions/${missionId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ statut: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur de mise à jour");
      }
      showFeedbackMsg(`Mission ${newStatus === 'ACCEPTEE' ? 'acceptée' : 'déclinée'} avec succès !`);
      fetchMissions();
    } catch (err) {
      showFeedbackMsg(err.message, 'error');
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
      showFeedbackMsg("Profil et disponibilités enregistrés avec succès !");
    } catch (err) {
      showFeedbackMsg(err.message, 'error');
    }
  };

  const addDisponibilite = () => {
    if (!newDispo.dateDebut || !newDispo.dateFin) {
      showFeedbackMsg("Veuillez saisir une date de début et de fin.", "error");
      return;
    }
    const start = new Date(newDispo.dateDebut);
    const end = new Date(newDispo.dateFin);
    if (end < start) {
      showFeedbackMsg("La date de fin doit être postérieure à la date de début.", "error");
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

  const handleLogout = () => {
    localStorage.removeItem('staffToken');
    navigate('/login');
  };

  if (!intervenant) {
    return (
      <div className="min-h-screen bg-slate-900 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  // Filtered reservations and quotes
  const filteredReservations = reservations.filter(r => 
    r.client?.nom?.toLowerCase().includes(searchRes.toLowerCase()) ||
    (r.id && r.id.toString() === searchRes)
  );

  const filteredDevis = devis.filter(d => 
    d.client?.nom?.toLowerCase().includes(searchDevis.toLowerCase()) ||
    d.numeroDevis?.toLowerCase().includes(searchDevis.toLowerCase())
  );

  const filteredClients = clients.filter(c => 
    c.nom?.toLowerCase().includes(searchClients.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchClients.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Banner / Navbar */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 py-4 px-6 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-md shadow-indigo-600/20">
            M
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">Portail Intervenant</h1>
            <p className="text-xs text-slate-400">Gîte de la Maladrerie</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-bold text-white">{intervenant.prenom} {intervenant.nom}</span>
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Équipe Maladrerie</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2.5 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 rounded-xl transition-all border border-slate-700 hover:border-rose-900 flex items-center justify-center cursor-pointer"
            title="Se déconnecter"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-6">
        
        {/* Sidebar Nav */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col gap-1.5 shadow-xl">
            <button 
              onClick={() => setActiveTab('missions')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === 'missions' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <ClipboardList size={18} />
              Mes Missions
              {missions.filter(m => m.statut === 'EN_ATTENTE').length > 0 && (
                <span className="ml-auto bg-amber-500 text-slate-950 font-black text-xs h-5 px-1.5 rounded-full flex items-center justify-center min-w-5 animate-pulse">
                  {missions.filter(m => m.statut === 'EN_ATTENTE').length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('agenda')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === 'agenda' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <CalendarRange size={18} />
              Agenda Équipe
            </button>

            <button 
              onClick={() => setActiveTab('reservations')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === 'reservations' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <CalendarIcon size={18} />
              Réservations & Devis
            </button>

            <button 
              onClick={() => setActiveTab('clients')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === 'clients' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <Users size={18} />
              Espace Client
            </button>

            <button 
              onClick={() => setActiveTab('profil')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === 'profil' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <User size={18} />
              Mon Profil
            </button>
          </div>
        </aside>

        {/* Tab Content Display Area */}
        <section className="flex-1 min-w-0">
          
          {/* Feedbacks Alerts */}
          {feedback && (
            <div className={`mb-4 rounded-xl p-4 border flex items-center gap-3 shadow-md ${
              feedback.type === 'error' 
                ? 'bg-rose-950/40 border-rose-900 text-rose-300' 
                : 'bg-emerald-950/40 border-emerald-900 text-emerald-300'
            }`}>
              {feedback.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
              <span className="text-sm font-semibold">{feedback.msg}</span>
            </div>
          )}

          {/* TAB 1: Mes Missions */}
          {activeTab === 'missions' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Mes Missions assignées</h2>
                <p className="text-xs text-slate-400 mt-1">Consultez et validez les missions d'accueil, ménage ou intervention qui vous sont confiées.</p>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : missions.length > 0 ? (
                <div className="grid gap-4">
                  {missions.map(m => (
                    <div 
                      key={m.id} 
                      className={`p-5 rounded-xl border transition-all ${
                        m.statut === 'ACCEPTEE' 
                          ? 'bg-emerald-950/20 border-emerald-900/60' 
                          : m.statut === 'REFUSEE' 
                          ? 'bg-rose-950/10 border-rose-900/40 opacity-70' 
                          : 'bg-slate-800/40 border-slate-700/60'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-3">
                            <span className="text-base font-black text-white">{m.typeMission}</span>
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              m.statut === 'ACCEPTEE' 
                                ? 'bg-emerald-900/60 text-emerald-300' 
                                : m.statut === 'REFUSEE' 
                                ? 'bg-rose-900/60 text-rose-300' 
                                : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {m.statut === 'ACCEPTEE' ? 'Validée' : m.statut === 'REFUSEE' ? 'Déclinée' : 'À valider'}
                            </span>
                          </div>

                          <p className="text-sm text-slate-300 flex items-center gap-2">
                            <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                            <span>Séjour du {new Date(m.reservation.dateDebut).toLocaleDateString('fr-FR')} au {new Date(m.reservation.dateFin).toLocaleDateString('fr-FR')}</span>
                          </p>

                          <p className="text-xs text-slate-400">
                            Client lié : <span className="font-bold text-slate-300">{m.reservation.client?.nom || 'Client'}</span>
                          </p>
                        </div>

                        <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-3 min-w-[120px]">
                          <div>
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Rémunération</span>
                            <span className="text-lg font-black text-white">{m.montant.toFixed(2)} €</span>
                          </div>

                          {m.statut === 'EN_ATTENTE' && (
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleUpdateMissionStatus(m.id, 'REFUSEE')}
                                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-900 rounded-lg text-xs font-bold text-rose-300 transition-colors cursor-pointer"
                              >
                                Décliner
                              </button>
                              <button 
                                onClick={() => handleUpdateMissionStatus(m.id, 'ACCEPTEE')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-bold text-white transition-colors cursor-pointer"
                              >
                                Accepter
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 border border-dashed border-slate-800 rounded-xl text-center">
                  <p className="text-slate-400 text-sm">Vous n'avez pas de missions planifiées pour l'instant.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Agenda Équipe */}
          {activeTab === 'agenda' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Agenda de l'Équipe</h2>
                  <p className="text-xs text-slate-400 mt-1">Calendrier interactif regroupant les nuitées du gîte, vos disponibilités et les missions.</p>
                </div>
                <button 
                  onClick={fetchPlanningEvents}
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  {loading ? "Chargement..." : "Actualiser"}
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center items-center h-96">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
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
                      noEventsInRange: "Rien de planifié sur cette période",
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
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        cursor: 'pointer'
                      };

                      if (event.type === 'dispo') {
                        style.backgroundColor = '#10b981';
                      } else if (event.type === 'reservation') {
                        style.backgroundColor = '#4f46e5';
                        if (event.statut === 'EN_ATTENTE') {
                          style.backgroundColor = '#8b5cf6';
                        }
                      } else if (event.type === 'mission') {
                        if (event.statut === 'ACCEPTEE') {
                          style.backgroundColor = '#0d9488';
                        } else if (event.statut === 'REFUSEE') {
                          style.backgroundColor = '#e11d48';
                        } else {
                          style.backgroundColor = '#f59e0b';
                          style.border = '1px dashed #d97706';
                        }
                      }
                      return { style };
                    }}
                    onSelectEvent={(event) => setSelectedEvent(event)}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Réservations & Devis */}
          {activeTab === 'reservations' && (
            <div className="space-y-6">
              
              {/* Reservations Grid */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Réservations validées</h2>
                    <p className="text-xs text-slate-400 mt-1">Historique et séjours confirmés.</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <input 
                      type="text" 
                      placeholder="Rechercher un client ou ID..." 
                      value={searchRes}
                      onChange={e => setSearchRes(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <Search className="absolute right-3 top-2.5 text-slate-600" size={16} />
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                ) : filteredReservations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-xs bg-slate-950/40">
                          <th className="p-4">ID</th>
                          <th className="p-4">Client</th>
                          <th className="p-4">Période</th>
                          <th className="p-4">Statut</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredReservations.map(r => (
                          <tr key={r.id} className="hover:bg-slate-800/20 transition-colors">
                            <td className="p-4 font-mono font-bold text-slate-400">#{r.id}</td>
                            <td className="p-4 font-bold text-white">{r.client?.nom}</td>
                            <td className="p-4 text-slate-300">
                              {new Date(r.dateDebut).toLocaleDateString('fr-FR')} au {new Date(r.dateFin).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="p-4">
                              <span className="bg-indigo-950/60 text-indigo-300 border border-indigo-900 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
                                Confirmé
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => setSelectedReservation(r)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye size={12} />
                                Détails
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-6 text-slate-500 text-sm">Aucune réservation trouvée.</p>
                )}
              </div>

              {/* Devis Grid */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Devis en attente</h2>
                    <p className="text-xs text-slate-400 mt-1">Options et estimations envoyées aux clients.</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <input 
                      type="text" 
                      placeholder="Rechercher par client ou Devis..." 
                      value={searchDevis}
                      onChange={e => setSearchDevis(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <Search className="absolute right-3 top-2.5 text-slate-600" size={16} />
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                ) : filteredDevis.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-xs bg-slate-950/40">
                          <th className="p-4">N° Devis</th>
                          <th className="p-4">Client</th>
                          <th className="p-4">Période</th>
                          <th className="p-4">Statut</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredDevis.map(d => (
                          <tr key={d.id} className="hover:bg-slate-800/20 transition-colors">
                            <td className="p-4 font-mono font-bold text-slate-400">{d.numeroDevis || 'N/A'}</td>
                            <td className="p-4 font-bold text-white">{d.client?.nom}</td>
                            <td className="p-4 text-slate-300">
                              {new Date(d.dateDebut).toLocaleDateString('fr-FR')} au {new Date(d.dateFin).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="p-4">
                              <span className="bg-amber-950/60 text-amber-300 border border-amber-900/60 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
                                En attente
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => setSelectedReservation(d)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye size={12} />
                                Détails
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-6 text-slate-500 text-sm">Aucun devis trouvé.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Espace Client */}
          {activeTab === 'clients' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Fiches Clients</h2>
                  <p className="text-xs text-slate-400 mt-1">Consultez l'historique et la vie des clients du Gîte.</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <input 
                    type="text" 
                    placeholder="Filtrer par nom, email..." 
                    value={searchClients}
                    onChange={e => setSearchClients(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <Search className="absolute right-3 top-2.5 text-slate-600" size={16} />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : filteredClients.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredClients.map(c => (
                    <div 
                      key={c.id} 
                      className="bg-slate-950 border border-slate-800 p-5 rounded-2xl shadow-md hover:border-slate-700 hover:shadow-xl transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-black text-base text-white">{c.nom}</h3>
                          <p className="text-xs text-slate-500 font-medium">Fiche Client #{c.id}</p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs text-slate-300 flex items-center gap-2 truncate">
                            <Mail size={12} className="text-slate-500 shrink-0" />
                            <span>{c.email !== 'N/A' ? c.email : 'Non fourni'}</span>
                          </p>
                          <p className="text-xs text-slate-300 flex items-center gap-2">
                            <Phone size={12} className="text-slate-500 shrink-0" />
                            <span>{c.telephone || 'Non fourni'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-800/80 pt-3 flex justify-between items-center">
                        <span className="text-[11px] bg-indigo-950/40 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-900/60">
                          {c.reservations?.length || 0} séjours
                        </span>
                        <button 
                          onClick={() => setSelectedClient(c)}
                          className="text-xs text-white hover:text-indigo-400 font-black uppercase tracking-wide flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={14} />
                          Consulter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-12 text-slate-500 text-sm">Aucun client trouvé.</p>
              )}
            </div>
          )}

          {/* TAB 5: Mon Profil */}
          {activeTab === 'profil' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">Mon Profil & Disponibilités</h2>
                
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Personal info form */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800">1. Informations personnelles</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Prénom</label>
                        <input 
                          type="text" 
                          value={profileForm.prenom} 
                          onChange={e => setProfileForm({...profileForm, prenom: e.target.value})} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Nom</label>
                        <input 
                          type="text" 
                          value={profileForm.nom} 
                          onChange={e => setProfileForm({...profileForm, nom: e.target.value})} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Adresse email</label>
                        <input 
                          type="email" 
                          value={profileForm.email} 
                          onChange={e => setProfileForm({...profileForm, email: e.target.value})} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Téléphone</label>
                        <input 
                          type="tel" 
                          value={profileForm.telephone} 
                          onChange={e => setProfileForm({...profileForm, telephone: e.target.value})} 
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Lock size={12} className="text-slate-500" />
                        <span>Changer le mot de passe (Laissez vide pour conserver l'actuel)</span>
                      </label>
                      <input 
                        type="password" 
                        value={profileForm.password} 
                        onChange={e => setProfileForm({...profileForm, password: e.target.value})} 
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        placeholder="Nouveau mot de passe"
                        minLength={6}
                      />
                    </div>
                  </div>

                  {/* Availabilities Picker */}
                  <div className="space-y-4 pt-6 border-t border-slate-800">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800">2. Mes Disponibilités</h3>
                    
                    {/* Add Availability inputs */}
                    <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-end gap-4">
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Date début</label>
                        <input 
                          type="date" 
                          value={newDispo.dateDebut}
                          onChange={e => setNewDispo({...newDispo, dateDebut: e.target.value})}
                          className="w-full bg-slate-900 border border-slate-855 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Date fin</label>
                        <input 
                          type="date" 
                          value={newDispo.dateFin}
                          onChange={e => setNewDispo({...newDispo, dateFin: e.target.value})}
                          className="w-full bg-slate-900 border border-slate-855 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <button 
                        type="button"
                        onClick={addDisponibilite}
                        className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10 shrink-0"
                      >
                        <Plus size={16} />
                        Ajouter
                      </button>
                    </div>

                    {/* Availabilities list */}
                    {disponibilites.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {disponibilites.map((d, index) => (
                          <div 
                            key={index} 
                            className="bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 flex justify-between items-center shadow-sm"
                          >
                            <span className="text-sm text-slate-200 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"></span>
                              Du {new Date(d.dateDebut).toLocaleDateString('fr-FR')} au {new Date(d.dateFin).toLocaleDateString('fr-FR')}
                            </span>
                            <button 
                              type="button"
                              onClick={() => removeDisponibilite(index)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Aucune date de disponibilité saisie.</p>
                    )}
                  </div>

                  <div className="pt-6 border-t border-slate-800 flex justify-end">
                    <button 
                      type="submit"
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider rounded-xl transition-all text-xs shadow-md shadow-indigo-600/15 cursor-pointer"
                    >
                      Enregistrer les modifications
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-950 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        © 2026 Gîte de la Maladrerie - Portail Intervenant connecté en lecture seule administrative.
      </footer>

      {/* ========================================================================= */}
      {/* MODAL 1: Details Agenda Event */}
      {/* ========================================================================= */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-indigo-600 text-white p-6 flex justify-between items-center border-b border-indigo-700">
              <h3 className="font-black text-base uppercase tracking-tight flex items-center gap-2">
                {selectedEvent.type === 'reservation' && '🗓️ Détails Réservation'}
                {selectedEvent.type === 'mission' && '📌 Détails Mission'}
                {selectedEvent.type === 'dispo' && '✅ Disponibilité'}
              </h3>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-sm">
              <div>
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Titre</h4>
                <p className="font-bold text-slate-100 mt-1">{selectedEvent.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Début</h4>
                  <p className="font-bold text-slate-200 mt-1">
                    {new Date(selectedEvent.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Fin</h4>
                  <p className="font-bold text-slate-200 mt-1">
                    {new Date(selectedEvent.end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {selectedEvent.type === 'mission' && selectedEvent.mission && (
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Intervenant assigné</h4>
                    <p className="font-bold text-slate-100 mt-1">
                      {selectedEvent.mission.intervenantName}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Rémunération</h4>
                      <p className="font-black text-indigo-400 mt-1">
                        {selectedEvent.mission.montant.toFixed(2)} €
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Statut Mission</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase mt-1 ${
                        selectedEvent.mission.statut === 'ACCEPTEE' 
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-900' 
                          : selectedEvent.mission.statut === 'REFUSEE' 
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-900' 
                          : 'bg-amber-950/80 text-amber-300 border border-amber-900/60'
                      }`}>
                        {selectedEvent.mission.statut === 'ACCEPTEE' ? 'Validé' : selectedEvent.mission.statut === 'REFUSEE' ? 'Refusé' : 'En attente'}
                      </span>
                    </div>
                  </div>

                  {selectedEvent.reservation && (
                    <div className="border-t border-slate-800 pt-3 space-y-1">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Séjour & Client lié</h4>
                      <p className="text-xs text-slate-300">
                        Client : <span className="font-bold">{selectedEvent.reservation.clientNom}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Réservation #{selectedEvent.reservation.id} ({selectedEvent.reservation.statut === 'RESERVE' ? 'Confirmée' : 'Option'})
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.type === 'reservation' && (
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Client principal</h4>
                      <p className="font-bold text-slate-100 mt-1">{selectedEvent.clientNom}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Statut Réservation</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase mt-1 ${
                        selectedEvent.statut === 'RESERVE' ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-900' : 'bg-purple-950/80 text-purple-300 border border-purple-900'
                      }`}>
                        {selectedEvent.statut === 'RESERVE' ? 'Confirmée' : 'Option'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Responsable principal</h4>
                    <p className="text-slate-300 mt-1">{selectedEvent.intervenantName}</p>
                  </div>
                </div>
              )}

              {selectedEvent.type === 'dispo' && (
                <div className="border-t border-slate-800 pt-4">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Intervenant</h4>
                  <p className="font-bold text-slate-100 mt-1">{selectedEvent.intervenantName}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-950 px-6 py-4 flex justify-end border-t border-slate-850">
              <button 
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-colors text-sm cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Read-Only Reservation details */}
      {/* ========================================================================= */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-950 p-6 flex justify-between items-center border-b border-slate-850">
              <div>
                <h3 className="font-black text-lg text-white uppercase tracking-tight">
                  {selectedReservation.numeroDevis ? `Devis ${selectedReservation.numeroDevis}` : `Réservation #${selectedReservation.id}`}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Vue en lecture seule</p>
              </div>
              <button 
                onClick={() => setSelectedReservation(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 text-sm overflow-y-auto max-h-[70vh]">
              {/* Clients Section */}
              <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-xl space-y-2">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider">Client</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-bold">Nom / Raison Sociale</span>
                    <span className="font-bold text-white text-sm">{selectedReservation.client?.nom || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-bold">Téléphone</span>
                    <span className="text-slate-300 text-sm">{selectedReservation.client?.telephone || 'Non renseigné'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-bold">Email</span>
                  <span className="text-slate-300 text-sm truncate block">{selectedReservation.client?.email !== 'N/A' ? selectedReservation.client?.email : 'Non renseigné'}</span>
                </div>
              </div>

              {/* Dates & Rooms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Date Arrivée</h4>
                  <p className="font-semibold text-slate-200 mt-1">
                    {new Date(selectedReservation.dateDebut).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Date Départ</h4>
                  <p className="font-semibold text-slate-200 mt-1">
                    {new Date(selectedReservation.dateFin).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              {/* Chambers and Salles */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Chambres louées</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    {selectedReservation.chambres && selectedReservation.chambres.length > 0 
                      ? selectedReservation.chambres.map(c => `Ch. ${c}`).join(', ') 
                      : 'Aucune'}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Salles de réunion</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    {selectedReservation.salles && selectedReservation.salles.length > 0 
                      ? selectedReservation.salles.map(s => `Salle ${s}`).join(', ') 
                      : 'Aucune'}
                  </p>
                </div>
              </div>

              {/* Occupants count */}
              <div>
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Nombre d'occupants</h4>
                <p className="text-xs text-slate-300">
                  {selectedReservation.occupantsCount || 'Non spécifié'} Voyageurs
                </p>
              </div>

              {/* Options & Price recap */}
              <div className="border-t border-slate-800 pt-4 grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Total TTC</h4>
                  <p className="font-black text-lg text-white mt-1">{(selectedReservation.prixTotal || 0).toFixed(2)} €</p>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Statut Financier</h4>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-black uppercase mt-1.5 ${
                    selectedReservation.statutPaiement === 'PAYE' 
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-900' 
                      : selectedReservation.statutPaiement === 'ACOMPTE_PAYE' 
                      ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-900'
                      : 'bg-rose-950/80 text-rose-300 border border-rose-900'
                  }`}>
                    {selectedReservation.statutPaiement === 'PAYE' ? 'Réglé' : selectedReservation.statutPaiement === 'ACOMPTE_PAYE' ? 'Acompte Payé' : 'Non payé'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-950 px-6 py-4 flex justify-end border-t border-slate-850">
              <button 
                onClick={() => setSelectedReservation(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-colors text-sm cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Client Details & History Timeline (Read-Only) */}
      {/* ========================================================================= */}
      {selectedClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-950 p-6 flex justify-between items-center border-b border-slate-850">
              <div>
                <h3 className="font-black text-lg text-white uppercase tracking-tight">
                  Historique Client : {selectedClient.nom}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Vue en lecture seule • ID #{selectedClient.id}</p>
              </div>
              <button 
                onClick={() => setSelectedClient(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 text-sm overflow-y-auto max-h-[70vh]">
              {/* Client Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Email</h4>
                  <p className="font-bold text-slate-200 mt-1 truncate">{selectedClient.email !== 'N/A' ? selectedClient.email : 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Téléphone</h4>
                  <p className="font-bold text-slate-200 mt-1">{selectedClient.telephone || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Adresse Postale</h4>
                  <p className="font-semibold text-slate-300 mt-1">{selectedClient.adressePostale || 'Non fournie'}</p>
                </div>
              </div>

              {/* Timeline list of bookings */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider">Historique de vie (Séjours)</h4>
                
                {selectedClient.reservations && selectedClient.reservations.length > 0 ? (
                  <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {selectedClient.reservations.map(r => (
                      <div key={r.id} className="relative pl-8 space-y-1">
                        {/* Dot indicator */}
                        <span className={`absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                          r.statut === 'RESERVE' ? 'bg-indigo-500' : 'bg-amber-500'
                        }`}></span>

                        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-black text-xs text-white">
                              {r.numeroDevis ? `Devis ${r.numeroDevis}` : `Réservation #${r.id}`}
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                              r.statut === 'RESERVE' ? 'bg-indigo-950 text-indigo-300' : 'bg-amber-950 text-amber-300'
                            }`}>
                              {r.statut === 'RESERVE' ? 'Confirmé' : 'Devis'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300">
                            Séjour du {new Date(r.dateDebut).toLocaleDateString('fr-FR')} au {new Date(r.dateFin).toLocaleDateString('fr-FR')}
                          </p>

                          <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                            <span>Total : <strong className="text-slate-300">{(r.prixTotal || 0).toFixed(2)} €</strong></span>
                            <span>Moyen de paiement : <strong className="text-slate-400">{r.moyenPaiement || 'Stripe (CB)'}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Aucun historique de réservation.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-950 px-6 py-4 flex justify-end border-t border-slate-855">
              <button 
                onClick={() => setSelectedClient(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-colors text-sm cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IntervenantPortal;
