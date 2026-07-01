import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, PlusCircle, Trash, Calendar, AlertTriangle, CheckCircle, Clock, Check, X, Trash2, Banknote, CreditCard, Shield, ShieldAlert, Coins, Edit3, FileText, Users, Mail } from 'lucide-react';
import { API_URL } from '../config';
import ReservationForm from '../components/ReservationForm';
import SignaturePad from '../components/SignaturePad';

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
  1: "Chambre 1",
  2: "Chambre 2",
  3: "Chambre 3",
  4: "Chambre 4",
  5: "Chambre 5",
  6: "Chambre 6"
};

const formatAdminName = (validePar) => {
  if (!validePar) return '-';
  if (validePar.toLowerCase() === 'admin') return 'David R.';
  if (validePar.startsWith('Système')) return 'Système';
  if (validePar.includes('@')) {
    const localPart = validePar.split('@')[0];
    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2) {
      const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
      const lastNameLetter = parts[parts.length - 1].charAt(0).toUpperCase();
      return `${firstName} ${lastNameLetter}.`;
    } else if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }
  return validePar.charAt(0).toUpperCase() + validePar.slice(1);
};

const formatMealsCount = (mealsObj) => {
  if (!mealsObj || Object.keys(mealsObj).length === 0) return "Aucun";
  let petitDej = 0, dej = 0, diner = 0;
  Object.values(mealsObj).forEach(day => {
    if (day.PETIT_DEJ) petitDej += (day.PETIT_DEJ.ADULTE || 0) + (day.PETIT_DEJ.ENFANT_MOINS_12 || 0) + (day.PETIT_DEJ.ENFANT_MOINS_5 || 0);
    if (day.DEJEUNER) dej += (day.DEJEUNER.ADULTE || 0) + (day.DEJEUNER.ENFANT_MOINS_12 || 0) + (day.DEJEUNER.ENFANT_MOINS_5 || 0);
    if (day.DINER) diner += (day.DINER.ADULTE || 0) + (day.DINER.ENFANT_MOINS_12 || 0) + (day.DINER.ENFANT_MOINS_5 || 0);
  });
  const parts = [];
  if (petitDej) parts.push(`${petitDej} P-Dej`);
  if (dej) parts.push(`${dej} Dej`);
  if (diner) parts.push(`${diner} Din`);
  return parts.join(', ') || "Aucun";
};

const formatMealsDetail = (mealsObj) => {
  if (!mealsObj || Object.keys(mealsObj).length === 0) return <span className="text-slate-400 italic">Aucun repas commandé</span>;
  
  let mealsList = [];
  Object.entries(mealsObj).forEach(([dateStr, meals]) => {
    let dayMeals = [];
    const addMeal = (type, label) => {
      if (!meals[type]) return;
      const a = parseInt(meals[type].ADULTE || 0);
      const e12 = parseInt(meals[type].ENFANT_MOINS_12 || 0);
      const e5 = parseInt(meals[type].ENFANT_MOINS_5 || 0);
      if (a > 0 || e12 > 0 || e5 > 0) {
        let parts = [];
        if (a > 0) parts.push(`${a} Adulte${a > 1 ? 's' : ''}`);
        if (e12 > 0) parts.push(`${e12} Enfant${e12 > 1 ? 's' : ''} (-12)`);
        if (e5 > 0) parts.push(`${e5} Enfant${e5 > 1 ? 's' : ''} (-5)`);
        dayMeals.push(`${label} (${parts.join(', ')})`);
      }
    };
    addMeal('PETIT_DEJ', 'Petit-déjeuner');
    addMeal('DEJEUNER', 'Déjeuner');
    addMeal('DINER', 'Dîner');
    
    if (dayMeals.length > 0) {
      const d = new Date(dateStr);
      const dateLabel = isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
      mealsList.push({ dateLabel, dayMeals });
    }
  });
  
  if (mealsList.length === 0) return <span className="text-slate-400 italic">Aucun repas commandé</span>;
  
  return (
    <div className="mt-1 space-y-1.5 bg-slate-100/50 p-2.5 rounded-lg border border-slate-200/50 text-[11px] text-slate-600">
      {mealsList.map((item, idx) => (
        <div key={idx} className="flex flex-col border-b border-slate-200/40 pb-1.5 last:border-0 last:pb-0">
          <span className="font-bold text-slate-700 capitalize">{item.dateLabel} :</span>
          <ul className="list-disc list-inside pl-2 space-y-0.5 mt-0.5">
            {item.dayMeals.map((m, mIdx) => (
              <li key={mIdx} className="text-slate-600 list-none font-medium">• {m}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const calculerTotalRepasFrontend = (repas) => {
  if (!repas) return 0;
  let total = 0;
  Object.values(repas).forEach(day => {
    if (day.PETIT_DEJ) {
      total += (parseInt(day.PETIT_DEJ.ADULTE || 0) * 6);
      total += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_12 || 0) * 5);
      total += (parseInt(day.PETIT_DEJ.ENFANT_MOINS_5 || 0) * 4);
    }
    if (day.DEJEUNER) {
      total += (parseInt(day.DEJEUNER.ADULTE || 0) * 11.5);
      total += (parseInt(day.DEJEUNER.ENFANT_MOINS_12 || 0) * 9.5);
      total += (parseInt(day.DEJEUNER.ENFANT_MOINS_5 || 0) * 8);
    }
    if (day.DINER) {
      total += (parseInt(day.DINER.ADULTE || 0) * 14);
      total += (parseInt(day.DINER.ENFANT_MOINS_12 || 0) * 12);
      total += (parseInt(day.DINER.ENFANT_MOINS_5 || 0) * 10);
    }
  });
  return total;
};

const PCG_CATEGORIES = [
  { code: '6063', name: 'Produits d\'entretien & petit équipement' },
  { code: '6068', name: 'Achats alimentaires & consommables' },
  { code: '613', name: 'Loyer & locations' },
  { code: '6061', name: 'Fluides (Électricité, Eau, Gaz)' },
  { code: '611', name: 'Sous-traitance & Prestations externes' },
  { code: '615', name: 'Entretien & réparations du gîte' },
  { code: '616', name: 'Primes d\'assurances' },
  { code: '623', name: 'Publicité & Communication' },
  { code: '627', name: 'Frais bancaires & Commissions Stripe' },
  { code: '626', name: 'Télécoms (Internet, Abonnements)' },
  { code: '658', name: 'Charges diverses de gestion courante' }
];

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
  const [financeSubTab, setFinanceSubTab] = useState('recettes'); // 'recettes' or 'depenses'
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [financeModalData, setFinanceModalData] = useState({ title: '', code: '', total: 0, items: [] });
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    label: '',
    montant: '',
    categorie: 'Produits d\'entretien & petit équipement',
    comptePcg: '6063',
    description: '',
    date: new Date().toISOString().substring(0, 10)
  });
  const [editingReservation, setEditingReservation] = useState(null);
  const [currentReservationForMission, setCurrentReservationForMission] = useState(null);
  const [missionChecks, setMissionChecks] = useState({
    'Préparation petit-déjeuner': { checked: false, montant: 30 },
    'Draps et ménage': { checked: false, montant: 70 },
    'Lits faits': { checked: false, montant: 30 },
    'Linge de toilette': { checked: false, montant: 20 },
    'Ménage': { checked: false, montant: 50 },
    'Remise des clés': { checked: false, montant: 30 },
    'Astreinte de nuit sur place': { checked: false, montant: 200 },
    'Astreinte de nuit à domicile': { checked: false, montant: 100 }
  });
  const [missionIntervenantId, setMissionIntervenantId] = useState('');
  const [isAssigningMissions, setIsAssigningMissions] = useState(false);

  // Facturation
  const [reservationsFactures, setReservationsFactures] = useState([]);
  const [isLoadingFactures, setIsLoadingFactures] = useState(false);
  const [dateDebutFacture, setDateDebutFacture] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dateFinFacture, setDateFinFacture] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [factureSearch, setFactureSearch] = useState('');
  const [factureSortConfig, setFactureSortConfig] = useState({ key: 'dateDebut', direction: 'desc' });

  const [activeTab, setActiveTab] = useState('reservations');
  const [clients, setClients] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [reservationSearch, setReservationSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };
  const [intervenantSearch, setIntervenantSearch] = useState('');

  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [editClientForm, setEditClientForm] = useState({ nom: '', email: '', telephone: '', adressePostale: '' });

  const [showIntervenantModal, setShowIntervenantModal] = useState(false);
  const [currentIntervenant, setCurrentIntervenant] = useState(null);
  const [intervenantForm, setIntervenantForm] = useState({ nom: '', prenom: '', email: '', telephone: '', password: '', disponibilites: [], statut: 'SALARIE' });
  const [isSavingIntervenant, setIsSavingIntervenant] = useState(false);

  // Codes Promo
  const [promoCodes, setPromoCodes] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoForm, setPromoForm] = useState({ code: '', description: '', type: 'pourcentage', valeur: '', dateExpiration: '', usageMax: '' });

  // Captation partielle caution
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureReservationId, setCaptureReservationId] = useState(null);

  const [adminForm, setAdminForm] = useState({
    email: '',
    password: '',
    nom: '',
    telephone: '',
    notifNewReservation: true,
    notifNewDevis: true,
    notifDevisValidation: true,
    notifPaymentReceived: true,
    notifModificationRequest: true,
    notifIntervenantMissions: true
  });
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [captureMontant, setCaptureMontant] = useState('');
  const [adminUser, setAdminUser] = useState(null);

  // Planning
  const [planningEvents, setPlanningEvents] = useState([]);
  const [loadingPlanning, setLoadingPlanning] = useState(false);
  const [selectedPlanningEvent, setSelectedPlanningEvent] = useState(null);
  const [invitingId, setInvitingId] = useState(null);

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
      console.error("Erreur lors de la récupération du planning:", err);
    } finally {
      setLoadingPlanning(false);
    }
  };

  // Profil admin
  const [profileForm, setProfileForm] = useState({ 
    nom: '', 
    prenom: '', 
    email: '', 
    telephone: '',
    notifNewReservation: true,
    notifNewDevis: true,
    notifDevisValidation: true,
    notifPaymentReceived: true,
    notifModificationRequest: true,
    notifIntervenantMissions: true
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Paiement manuel
  const [showManualPaymentModal, setShowManualPaymentModal] = useState(false);
  const [paymentMenuResId, setPaymentMenuResId] = useState(null);
  const [manualPaymentRes, setManualPaymentRes] = useState(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({ montant: '', mode: 'ESPECES', typePaiement: 'ACOMPTE' });

  // Factures
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [currentInvoiceRes, setCurrentInvoiceRes] = useState(null);
  const [invoiceIncludeOccupants, setInvoiceIncludeOccupants] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);

  // Remboursement
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundRes, setRefundRes] = useState(null);
  const [refundForm, setRefundForm] = useState({ montant: '', mode: 'STRIPE', description: '' });
  const [isRefunding, setIsRefunding] = useState(false);

  // Modifications clients
  const [showModificationModal, setShowModificationModal] = useState(false);
  const [selectedProposedModification, setSelectedProposedModification] = useState(null);
  const [isValidatingProposed, setIsValidatingProposed] = useState(false);

  // Fiches de Police
  const [selectedFicheReservation, setSelectedFicheReservation] = useState(null);
  const [showFicheModal, setShowFicheModal] = useState(false);
  const [activeFicheOccupant, setActiveFicheOccupant] = useState(null);
  const [isSavingFiche, setIsSavingFiche] = useState(false);
  const [ficheForm, setFicheForm] = useState({
    nom: '',
    prenom: '',
    dateNaissance: '',
    lieuNaissance: '',
    nationalite: '',
    domicile: '',
    telephone: '',
    email: '',
    dateArrivee: '',
    dateDepart: '',
    signature: null
  });

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
    if (token && activeTab === 'planning') {
      fetchPlanningEvents();
    }
  }, [token, activeTab]);

  useEffect(() => {
    if (token && activeTab === 'factures') {
      fetchReservationsFactures();
    }
  }, [token, activeTab, dateDebutFacture, dateFinFacture]);

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

  useEffect(() => {
    if (!showClientModal) {
      setIsEditingClient(false);
    }
  }, [showClientModal]);

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
          telephone: data.telephone || '',
          notifNewReservation: data.notifNewReservation ?? true,
          notifNewDevis: data.notifNewDevis ?? true,
          notifDevisValidation: data.notifDevisValidation ?? true,
          notifPaymentReceived: data.notifPaymentReceived ?? true,
          notifModificationRequest: data.notifModificationRequest ?? true,
          notifIntervenantMissions: data.notifIntervenantMissions ?? true
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

  const inviteIntervenant = async (interv) => {
    setInvitingId(interv.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/intervenants/${interv.id}/invite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback(`Invitation envoyée par email à ${interv.prenom} ${interv.nom}.`);
      } else {
        const data = await res.json();
        showFeedback(data.error || "Erreur lors de l'envoi de l'invitation.", "error");
      }
    } catch (err) {
      console.error(err);
      showFeedback("Erreur réseau lors de l'envoi de l'invitation.", "error");
    } finally {
      setInvitingId(null);
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
      disponibilites: interv.disponibilites || [],
      statut: interv.statut || 'SALARIE'
    });
    setShowIntervenantModal(true);
  };

  const startEditClient = (client) => {
    setEditClientForm({
      nom: client.nom || '',
      email: client.email || '',
      telephone: client.telephone || '',
      adressePostale: client.adressePostale || ''
    });
    setIsEditingClient(true);
  };

  const saveClient = async (e) => {
    if (e) e.preventDefault();
    setIsSavingClient(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/clients/${selectedClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editClientForm)
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedClient(prev => ({ ...prev, ...updated }));
        setIsEditingClient(false);
        showFeedback("Informations client mises à jour avec succès.");
        fetchReservations();
      } else {
        showFeedback("Erreur lors de la mise à jour des informations client.", "error");
      }
    } catch (err) {
      console.error(err);
      showFeedback("Erreur réseau ou serveur inaccessible.", "error");
    } finally {
      setIsSavingClient(false);
    }
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

  const openNewAdminModal = () => {
    setEditingAdmin(null);
    setAdminForm({
      email: '',
      password: '',
      nom: '',
      telephone: '',
      notifNewReservation: true,
      notifNewDevis: true,
      notifDevisValidation: true,
      notifPaymentReceived: true,
      notifModificationRequest: true,
      notifIntervenantMissions: true
    });
    setShowAdminModal(true);
  };

  const editAdminAccount = (acc) => {
    setEditingAdmin(acc);
    setAdminForm({
      email: acc.email || '',
      password: '',
      nom: acc.nom || '',
      telephone: acc.telephone || '',
      notifNewReservation: acc.notifNewReservation ?? true,
      notifNewDevis: acc.notifNewDevis ?? true,
      notifDevisValidation: acc.notifDevisValidation ?? true,
      notifPaymentReceived: acc.notifPaymentReceived ?? true,
      notifModificationRequest: acc.notifModificationRequest ?? true,
      notifIntervenantMissions: acc.notifIntervenantMissions ?? true
    });
    setShowAdminModal(true);
  };

  const saveAdminAccount = async (e) => {
    e.preventDefault();
    try {
      const url = editingAdmin 
        ? `${API_URL}/api/admin/accounts/${editingAdmin.id}`
        : `${API_URL}/api/admin/accounts`;
      const method = editingAdmin ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(adminForm)
      });
      if (res.ok) {
        setShowAdminModal(false);
        setAdminForm({
          email: '',
          password: '',
          nom: '',
          telephone: '',
          notifNewReservation: true,
          notifNewDevis: true,
          notifDevisValidation: true,
          notifPaymentReceived: true,
          notifModificationRequest: true,
          notifIntervenantMissions: true
        });
        setEditingAdmin(null);
        fetchAdminAccounts();
        showFeedback(editingAdmin ? "Compte administrateur modifié." : "Compte administrateur créé.");
      } else {
        const errData = await res.json();
        showFeedback(errData.error || "Erreur lors de l'enregistrement.", "error");
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

  const openInvoiceModal = (res) => {
    setCurrentInvoiceRes(res);
    setInvoiceIncludeOccupants(false);
    setShowInvoiceModal(true);
  };

  const handleDownloadInvoice = () => {
    window.open(`${API_URL}/api/admin/reservations/${currentInvoiceRes.id}/facture-pdf?token=${token}&includeOccupants=${invoiceIncludeOccupants}`, '_blank');
    setShowInvoiceModal(false);
  };

  const handleSendInvoice = async () => {
    setIsSendingInvoice(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/reservations/${currentInvoiceRes.id}/send-facture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ includeOccupants: invoiceIncludeOccupants })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de l\'envoi');
      showFeedback('Facture envoyée avec succès par e-mail.', 'success');
      setShowInvoiceModal(false);
    } catch (err) {
      showFeedback(err.message, 'error');
    } finally {
      setIsSendingInvoice(false);
    }
  };

  const printFichePolice = (reservation, fiche) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert("Veuillez autoriser les fenêtres contextuelles (popups) pour imprimer.");
      return;
    }
    const dateArriveeStr = new Date(fiche.dateArrivee).toLocaleDateString('fr-FR');
    const dateDepartStr = new Date(fiche.dateDepart).toLocaleDateString('fr-FR');
    const signedAtStr = new Date(fiche.signedAt).toLocaleString('fr-FR');
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Fiche Individuelle de Police - ${fiche.nom} ${fiche.prenom}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              color: #333;
              line-height: 1.5;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              font-size: 20px;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .header p {
              margin: 5px 0 0 0;
              font-size: 12px;
              color: #666;
            }
            .legal-ref {
              font-style: italic;
              font-size: 11px;
              text-align: center;
              margin-bottom: 35px;
              color: #555;
            }
            .section {
              margin-bottom: 25px;
            }
            .section-title {
              font-weight: bold;
              font-size: 14px;
              text-transform: uppercase;
              background: #f1f5f9;
              padding: 5px 10px;
              margin-bottom: 15px;
              border-left: 4px solid #0f172a;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
            }
            .field {
              margin-bottom: 10px;
            }
            .label {
              font-size: 11px;
              text-transform: uppercase;
              color: #666;
              font-weight: bold;
            }
            .value {
              font-size: 14px;
              border-bottom: 1px dotted #999;
              padding-bottom: 3px;
              min-height: 20px;
            }
            .full-width {
              grid-column: span 2;
            }
            .signature-area {
              margin-top: 40px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 40px;
            }
            .signature-box {
              border: 1px solid #ccc;
              height: 150px;
              position: relative;
              padding: 10px;
            }
            .signature-box .title {
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
              color: #666;
              margin-bottom: 10px;
            }
            .signature-img {
              max-height: 110px;
              max-width: 100%;
              display: block;
              margin: 0 auto;
            }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Fiche Individuelle de Police</h1>
            <p>Pour la transmission aux autorités sur demande • Articles R. 611-35 à R. 611-42 du CESEDA</p>
          </div>
          
          <div class="legal-ref">
            Régie par l'article R. 611-35 du Code de l'entrée et du séjour des étrangers et du droit d'asile.<br/>
            Obligatoire pour les clients étrangers séjournant en hôtel, gîte, meublé ou camping. À conserver pendant 6 mois.
          </div>

          <div class="section">
            <div class="section-title">Établissement d'accueil</div>
            <div class="grid">
              <div class="field">
                <div class="label">Nom du Gîte</div>
                <div class="value">Gîte de la Maladrerie</div>
              </div>
              <div class="field">
                <div class="label">Adresse</div>
                <div class="value">Av. Louis Balsan, 12100 Millau, France</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Informations du Voyageur</div>
            <div class="grid">
              <div class="field">
                <div class="label">Nom de famille</div>
                <div class="value">${fiche.nom.toUpperCase()}</div>
              </div>
              <div class="field">
                <div class="label">Prénom(s)</div>
                <div class="value">${fiche.prenom}</div>
              </div>
              <div class="field">
                <div class="label">Date de naissance</div>
                <div class="value">${new Date(fiche.dateNaissance).toLocaleDateString('fr-FR')}</div>
              </div>
              <div class="field">
                <div class="label">Lieu de naissance</div>
                <div class="value">${fiche.lieuNaissance}</div>
              </div>
              <div class="field">
                <div class="label">Nationalité</div>
                <div class="value">${fiche.nationalite}</div>
              </div>
              <div class="field">
                <div class="label">Téléphone Mobile</div>
                <div class="value">${fiche.telephone || '-'}</div>
              </div>
              <div class="field full-width">
                <div class="label">Adresse email</div>
                <div class="value">${fiche.email || '-'}</div>
              </div>
              <div class="field full-width">
                <div class="label">Domicile habituel</div>
                <div class="value">${fiche.domicile}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Détails du Séjour</div>
            <div class="grid">
              <div class="field">
                <div class="label">Date d'arrivée</div>
                <div class="value">${dateArriveeStr}</div>
              </div>
              <div class="field">
                <div class="label">Date de départ prévue</div>
                <div class="value">${dateDepartStr}</div>
              </div>
            </div>
          </div>

          <div class="signature-area">
            <div class="field">
              <div class="label">Fait à</div>
              <div class="value">Saint-Cyprien</div>
              <div class="label" style="margin-top: 15px;">Le</div>
              <div class="value">${signedAtStr}</div>
            </div>
            <div class="signature-box">
              <div class="title">Signature du Voyageur</div>
              ${fiche.signature ? `<img class="signature-img" src="${fiche.signature}" alt="Signature" />` : '<div style="height:100px; display:flex; align-items:center; justify-content:center; color:#999; font-style:italic;">Aucune signature</div>'}
            </div>
          </div>

          <div style="margin-top: 50px; text-align: center;">
            <button onclick="window.print()" style="padding: 10px 20px; font-weight: bold; background: #0f172a; color: white; border: none; border-radius: 5px; cursor: pointer;">Imprimer la fiche</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSaveFiche = async (e) => {
    e.preventDefault();
    if (!ficheForm.signature) {
      showFeedback("La signature manuscrite est obligatoire pour valider la fiche.", "error");
      return;
    }
    
    setIsSavingFiche(true);
    try {
      const isDummy = activeFicheOccupant.id === 'client-dummy';
      const occupantIdVal = isDummy ? null : (typeof activeFicheOccupant.id === 'string' && activeFicheOccupant.id.startsWith('extra-') ? null : activeFicheOccupant.id);
      
      const payload = {
        occupantId: occupantIdVal,
        nom: ficheForm.nom,
        prenom: ficheForm.prenom,
        dateNaissance: ficheForm.dateNaissance,
        lieuNaissance: ficheForm.lieuNaissance,
        nationalite: ficheForm.nationalite,
        domicile: ficheForm.domicile,
        telephone: ficheForm.telephone,
        email: ficheForm.email,
        signature: ficheForm.signature,
        dateArrivee: ficheForm.dateArrivee,
        dateDepart: ficheForm.dateDepart
      };

      const response = await fetch(`${API_URL}/api/admin/reservations/${selectedFicheReservation.id}/fiche-police`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur lors de la sauvegarde.");
      
      showFeedback("Fiche de police enregistrée avec succès !", "success");
      
      // Mettre à jour la réservation sélectionnée
      setSelectedFicheReservation(data);
      
      // Mettre à jour la liste principale
      setReservations(prev => prev.map(r => r.id === data.id ? data : r));
      
      setActiveFicheOccupant(null);
    } catch (err) {
      showFeedback(err.message, "error");
    } finally {
      setIsSavingFiche(false);
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

  const fetchReservationsFactures = async () => {
    setIsLoadingFactures(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/factures/period?dateDebut=${dateDebutFacture}&dateFin=${dateFinFacture}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReservationsFactures(data);
      } else {
        setReservationsFactures([]);
      }
    } catch (err) {
      console.error("Erreur chargement factures:", err);
      setReservationsFactures([]);
    } finally {
      setIsLoadingFactures(false);
    }
  };

  const requestFactureSort = (key) => {
    let direction = 'desc';
    if (factureSortConfig.key === key && factureSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setFactureSortConfig({ key, direction });
  };

  const getFilteredAndSortedFactures = () => {
    let result = [...reservationsFactures];
    if (factureSearch.trim()) {
      const searchLower = factureSearch.toLowerCase();
      result = result.filter(res => {
        const nom = res.client?.nom || '';
        const email = res.client?.email || '';
        const structure = res.structure || '';
        const refFacture = res.numeroFacture || '';
        const refDevis = res.numeroDevis || '';
        const resId = String(res.id);
        
        return nom.toLowerCase().includes(searchLower) ||
               email.toLowerCase().includes(searchLower) ||
               structure.toLowerCase().includes(searchLower) ||
               refFacture.toLowerCase().includes(searchLower) ||
               refDevis.toLowerCase().includes(searchLower) ||
               resId.includes(searchLower);
      });
    }
    
    if (factureSortConfig.key) {
      result.sort((a, b) => {
        let valA, valB;
        if (factureSortConfig.key === 'ref') {
          valA = a.numeroFacture || a.numeroDevis || `FA-${a.id}`;
          valB = b.numeroFacture || b.numeroDevis || `FA-${b.id}`;
        } else if (factureSortConfig.key === 'client') {
          valA = a.client?.nom || '';
          valB = b.client?.nom || '';
        } else if (factureSortConfig.key === 'dateDebut') {
          valA = new Date(a.dateDebut);
          valB = new Date(b.dateDebut);
        } else if (factureSortConfig.key === 'prixTotal') {
          valA = a.prixTotal || 0;
          valB = b.prixTotal || 0;
        } else if (factureSortConfig.key === 'statutPaiement') {
          valA = a.statutPaiement || '';
          valB = b.statutPaiement || '';
        } else {
          return 0;
        }
        
        if (valA < valB) return factureSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return factureSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette dépense ?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback('Dépense supprimée avec succès');
        fetchFinances();
      } else {
        const data = await res.json();
        showFeedback(data.error || 'Erreur lors de la suppression', 'error');
      }
    } catch (err) {
      showFeedback('Erreur réseau', 'error');
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.label || !expenseForm.montant || !expenseForm.categorie || !expenseForm.comptePcg) {
      showFeedback('Veuillez remplir tous les champs obligatoires', 'error');
      return;
    }

    const method = editingExpense ? 'PUT' : 'POST';
    const url = editingExpense 
      ? `${API_URL}/api/admin/expenses/${editingExpense.id}`
      : `${API_URL}/api/admin/expenses`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(expenseForm)
      });

      if (res.ok) {
        showFeedback(editingExpense ? 'Dépense modifiée avec succès' : 'Dépense ajoutée avec succès');
        setShowExpenseModal(false);
        setEditingExpense(null);
        setExpenseForm({
          label: '',
          montant: '',
          categorie: 'Produits d\'entretien & petit équipement',
          comptePcg: '6063',
          description: '',
          date: new Date().toISOString().substring(0, 10)
        });
        fetchFinances();
      } else {
        const data = await res.json();
        showFeedback(data.error || 'Erreur lors de l\'enregistrement', 'error');
      }
    } catch (err) {
      showFeedback('Erreur réseau', 'error');
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
          'Lits faits': { checked: false, montant: 30 },
          'Linge de toilette': { checked: false, montant: 20 },
          'Ménage': { checked: false, montant: 50 },
          'Remise des clés': { checked: false, montant: 30 },
          'Astreinte de nuit sur place': { checked: false, montant: 200 },
          'Astreinte de nuit à domicile': { checked: false, montant: 100 }
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

  const [isSendingTaxReport, setIsSendingTaxReport] = useState(false);

  const handleSendMonthlyTaxReport = async () => {
    if (!window.confirm("Confirmer l'envoi immédiat du rapport de taxe de séjour du mois précédent par e-mail à Valérie et Johanna ?")) {
      return;
    }
    setIsSendingTaxReport(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/finances/send-monthly-tax-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Rapport mensuel envoyé avec succès par e-mail à : ${data.to}\nMontant déclaré : ${data.totalTaxeSejour.toFixed(2)} € pour la période de ${data.month} ${data.year}.`);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error || "Une erreur est survenue lors de l'envoi."}`);
      }
    } catch (e) {
      console.error(e);
      alert("Une erreur réseau est survenue.");
    } finally {
      setIsSendingTaxReport(false);
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
      const res = await fetch(`${API_URL}/api/reservations/${id}/${action}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
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

  const handleAcceptModification = async (id) => {
    setIsValidatingProposed(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${id}/accept-modification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback("Modification acceptée avec succès.");
        setShowModificationModal(false);
        setSelectedProposedModification(null);
        fetchReservations();
        fetchFinances();
      } else {
        const data = await res.json();
        showFeedback(data.error || "Erreur lors de la validation.", "error");
      }
    } catch (err) {
      showFeedback("Erreur réseau.", "error");
    } finally {
      setIsValidatingProposed(false);
    }
  };

  const handleRejectModification = async (id) => {
    setIsValidatingProposed(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${id}/reject-modification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showFeedback("Modification rejetée.");
        setShowModificationModal(false);
        setSelectedProposedModification(null);
        fetchReservations();
      } else {
        const data = await res.json();
        showFeedback(data.error || "Erreur lors du rejet.", "error");
      }
    } catch (err) {
      showFeedback("Erreur réseau.", "error");
    } finally {
      setIsValidatingProposed(false);
    }
  };

  const handleProlongDevis = async (devis) => {
    const defaultHours = 48;
    const val = window.prompt("De combien d'heures souhaitez-vous prolonger ce devis ? (Entrez par exemple 48 pour 2 jours, 168 pour une semaine)", defaultHours);
    if (val === null) return; // Annulé

    const hours = parseInt(val);
    if (isNaN(hours) || hours <= 0) {
      alert("Veuillez entrer un nombre d'heures valide supérieur à 0.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/devis/${devis.id}/prolong`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ hours })
      });
      if (res.ok) {
        showFeedback(`Devis prolongé de ${hours} heures avec succès ! E-mail de mise à jour envoyé.`);
        fetchReservations();
      } else {
        const data = await res.json();
        showFeedback(data.error || "Erreur lors de la prolongation.", "error");
      }
    } catch (err) {
      showFeedback("Erreur réseau.", "error");
    }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    if (!refundRes) return;
    if (!refundForm.montant || isNaN(parseFloat(refundForm.montant)) || parseFloat(refundForm.montant) <= 0) {
      alert("Veuillez entrer un montant valide supérieur à 0.");
      return;
    }

    setIsRefunding(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reservations/${refundRes.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          montant: parseFloat(refundForm.montant),
          mode: refundForm.mode,
          description: refundForm.description
        })
      });
      const data = await res.json();
      if (res.ok) {
        showFeedback(data.message || "Remboursement enregistré avec succès !");
        setShowRefundModal(false);
        setRefundRes(null);
        fetchReservations();
        fetchFinances();
      } else {
        showFeedback(data.error || "Erreur lors du remboursement.", "error");
      }
    } catch (err) {
      showFeedback("Erreur réseau.", "error");
    } finally {
      setIsRefunding(false);
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

  const taxesSejourParMois = reservations
    .filter(r => (r.statut === 'RESERVE' || r.statut === 'TERMINE') && r.taxeSejour > 0)
    .reduce((acc, r) => {
      const date = new Date(r.dateDebut); // Use check-in date as requested by user
      const monthYear = date.toISOString().substring(0, 7); // YYYY-MM
      if (!acc[monthYear]) {
        acc[monthYear] = {
          label: date.toLocaleString('fr-FR', { month: 'long', year: 'numeric' }),
          total: 0
        };
      }
      acc[monthYear].total += r.taxeSejour;
      return acc;
    }, {});

  const taxesSejourArray = Object.entries(taxesSejourParMois)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, data]) => data);

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans p-4 md:p-8">
      <div className="w-full max-w-[96%] mx-auto relative">
        <div className="bg-[#F8F8F8] pb-8 border-b border-slate-200 shadow-sm mb-8">
          <div className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-black text-muc-blue tracking-tight uppercase">Dashboard</h1>
                <p className="text-sm font-medium text-slate-500">Gestion des réservations - La Maladrerie</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
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



            <div className="flex gap-2 overflow-x-auto pb-2 whitespace-nowrap scrollbar-hide">
              <button onClick={() => setActiveTab('reservations')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all whitespace-nowrap ${activeTab === 'reservations' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Réservations</button>
              <button onClick={() => setActiveTab('devis')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'devis' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Devis</button>
              <button onClick={() => setActiveTab('clients')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'clients' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Clients</button>
              <button onClick={() => setActiveTab('intervenants')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'intervenants' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Intervenants</button>
              <button onClick={() => setActiveTab('planning')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'planning' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Planning</button>
              <button onClick={() => setActiveTab('finances')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'finances' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Finances</button>
              <button onClick={() => setActiveTab('factures')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'factures' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Factures</button>
              <button onClick={() => setActiveTab('promos')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'promos' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Promos</button>
              {adminUser?.isSuperAdmin && (
                <button onClick={() => setActiveTab('accounts')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'accounts' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Comptes</button>
              )}
              <button onClick={() => setActiveTab('profil')} className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-all ${activeTab === 'profil' ? 'text-muc-blue border-b-4 border-muc-blue' : 'text-slate-400 hover:text-slate-600'}`}>Mon Profil</button>
            </div>
          </div>
        </div>

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
                        Date de création {sortConfig.key === 'createdAt' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
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
                        const dateA = new Date(a.createdAt);
                        const dateB = new Date(b.createdAt);
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                      }
                      if (sortConfig.key === 'dateDebut') {
                        const dateA = new Date(a.dateDebut);
                        const dateB = new Date(b.dateDebut);
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                      }
                      if (sortConfig.key === 'client') {
                        const valA = a.client?.nom || '';
                        const valB = b.client?.nom || '';
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                      }
                      if (sortConfig.key === 'prestations') {
                        const getPrestationsStr = (res) => {
                          const ch = (res.chambres || []).map(id => CHAMBRES_NAMES[id] || `Ch. ${id}`).join(', ');
                          let s = '';
                          if (res.salles) {
                            if (res.salles.salle15) s += ' Salle 15 pl.';
                            if (res.salles.salle12) s += ' Salle 12 pl.';
                          }
                          return `${ch} ${s}`;
                        };
                        const valA = getPrestationsStr(a);
                        const valB = getPrestationsStr(b);
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                      }
                      if (sortConfig.key === 'restauration') {
                        const getRestaurationScore = (res) => {
                          let total = 0;
                          if (res.repas) {
                            Object.values(res.repas).forEach(r => {
                              if (r.PETIT_DEJ) total += (parseInt(r.PETIT_DEJ.ADULTE) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_12) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_5) || 0);
                              if (r.DEJEUNER) total += (parseInt(r.DEJEUNER.ADULTE) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_5) || 0);
                              if (r.DINER) total += (parseInt(r.DINER.ADULTE) || 0) + (parseInt(r.DINER.ENFANT_MOINS_12) || 0) + (parseInt(r.DINER.ENFANT_MOINS_5) || 0);
                            });
                          }
                          if (total === 0 && res.repasGlobal) {
                            if (res.repasGlobal.PETIT_DEJ) total += 1;
                            if (res.repasGlobal.DEJEUNER) total += 10;
                            if (res.repasGlobal.DINER) total += 100;
                          }
                          return total;
                        };
                        const valA = getRestaurationScore(a);
                        const valB = getRestaurationScore(b);
                        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                      }
                      if (sortConfig.key === 'tarif') {
                        const valA = a.prixTotal || 0;
                        const valB = b.prixTotal || 0;
                        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                      }
                      if (sortConfig.key === 'statut') {
                        const valA = a.statut || '';
                        const valB = b.statut || '';
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                      }
                      if (sortConfig.key === 'validePar') {
                        const valA = formatAdminName(a.validePar);
                        const valB = formatAdminName(b.validePar);
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
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
                        <div className="text-xs font-bold text-slate-700">{new Date(res.dateDebut).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
                        <div className="text-xs font-medium text-slate-500">{new Date(res.dateFin).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
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
                              totalEnfants += parseInt(ch.mineurs || ch.enfants || 0);
                            });
                          }
                          const total = totalAdultes + totalEnfants;
                          if (total === 0) return <div className="text-xs font-bold text-slate-700 mt-1">👥 0 occupant</div>;
                          return (
                            <div className="text-xs font-bold text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded inline-block leading-tight">
                              👥 {total} occupant{total > 1 ? 's' : ''}
                              <span className="font-normal text-slate-500 block text-[10px]">({totalAdultes} Ad., {totalEnfants} Enf.)</span>
                            </div>
                          );
                        })()}
                        {(res.statut === 'RESERVE' || res.statut === 'TERMINE') && (
                          <button
                            onClick={() => {
                              setSelectedFicheReservation(res);
                              setShowFicheModal(true);
                            }}
                            className="mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-lg outline-none border border-slate-200 bg-white text-slate-600 hover:border-muc-blue hover:text-muc-blue hover:bg-slate-50 transition-colors flex items-center gap-1.5 w-full justify-between shadow-sm"
                            title="Gérer les fiches de police voyageurs"
                          >
                            <span className="flex items-center gap-1">📝 Fiches Police</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                              (res.fichesPolice || []).length > 0 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {(res.fichesPolice || []).length} / {res.occupants ? res.occupants.length : 0}
                            </span>
                          </button>
                        )}
                        <div className="text-[10px] text-slate-500 mt-1.5 flex gap-1 flex-wrap font-bold">
                          {res.options?.litsFaits && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🛏️ Lits</span>}
                          {res.options?.lingeFourni && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧴 Linge</span>}
                          {res.options?.menage && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧹 Ménage</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wider font-bold">
                          {(() => {
                            let totalPtitDej = 0;
                            let totalDej = 0;
                            let totalDiner = 0;
                            
                            if (res.repas) {
                              Object.values(res.repas).forEach(r => {
                                if (r.PETIT_DEJ) {
                                  totalPtitDej += (parseInt(r.PETIT_DEJ.ADULTE) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_12) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_5) || 0);
                                }
                                if (r.DEJEUNER) {
                                  totalDej += (parseInt(r.DEJEUNER.ADULTE) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_5) || 0);
                                }
                                if (r.DINER) {
                                  totalDiner += (parseInt(r.DINER.ADULTE) || 0) + (parseInt(r.DINER.ENFANT_MOINS_12) || 0) + (parseInt(r.DINER.ENFANT_MOINS_5) || 0);
                                }
                              });
                            }
                            
                            if (totalPtitDej === 0 && totalDej === 0 && totalDiner === 0) {
                              const hasPtitDej = res.repasGlobal?.PETIT_DEJ;
                              const hasDej = res.repasGlobal?.DEJEUNER;
                              const hasDiner = res.repasGlobal?.DINER;
                              
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
                            }
                            
                            return (
                              <>
                                {totalPtitDej > 0 && <span className="text-orange-600">🥐 {totalPtitDej} Petit-déj</span>}
                                {totalDej > 0 && <span className="text-green-600">🍲 {totalDej} Déjeuner(s)</span>}
                                {totalDiner > 0 && <span className="text-blue-600">🍝 {totalDiner} Dîner(s)</span>}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-black text-slate-800 leading-tight">
                          {res.prixTotal ? `${res.prixTotal.toFixed(2)} €` : 'N/A'}
                          {res.taxeSejour > 0 && <span className="text-[9px] text-slate-400 font-normal italic ml-1">(taxe {res.taxeSejour.toFixed(2)}€)</span>}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 font-bold uppercase">Ac. 30%</span>
                            {res.montantAcompte === 0 ? (
                              <span className="text-slate-400 font-bold">—</span>
                            ) : res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE' ? (
                              <span className="text-green-600 font-bold">✓ Payé</span>
                            ) : res.modePaiement === 'VIREMENT' ? (
                              <span className="text-cyan-600 font-bold" title="Virement attendu">🏦 Vir. Att.</span>
                            ) : res.stripeAcompteId ? (
                              <span className="text-blue-600 font-bold">Lien</span>
                            ) : (
                              <span className="text-amber-600 font-bold">Attente</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 font-bold uppercase">
                              {res.montantAcompte === 0 ? "Total 100%" : "Solde 70%"}
                            </span>
                            {res.statutPaiement === 'SOLDE_PAYE' || res.statutPaiement === 'PAYE' ? (
                              <span className="text-green-600 font-bold">✓ Payé</span>
                            ) : res.modePaiement === 'VIREMENT' ? (
                              <span className="text-cyan-600 font-bold" title="Virement attendu">🏦 Vir. Att.</span>
                            ) : res.stripeSoldeId ? (
                              <span className="text-blue-600 font-bold">Lien</span>
                            ) : (
                              <span className="text-amber-600 font-bold">Attente</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-slate-100">
                            <span className="text-slate-500 font-bold uppercase">Caution</span>
                            {res.statutCaution === 'DEPOSEE' ? (
                              <span className="text-green-600 font-bold">✓ Dép.</span>
                            ) : res.statutCaution === 'RESTITUEE' ? (
                              <span className="text-slate-500 font-bold">✓ Rest.</span>
                            ) : res.statutCaution === 'UTILISEE' ? (
                              <span className="text-red-600 font-bold">⚠ Ret.</span>
                            ) : res.stripeCautionId ? (
                              <span className="text-blue-600 font-bold">Lien</span>
                            ) : (
                              <span className="text-amber-600 font-bold">Attente</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-2">
                          {res.modificationProposed && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProposedModification(res);
                                setShowModificationModal(true);
                              }}
                              className="w-full text-center bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg hover:bg-purple-100 transition-all flex items-center justify-center gap-1.5 animate-pulse"
                            >
                              <AlertTriangle size={12} className="text-purple-600 shrink-0" />
                              Modif. demandée
                            </button>
                          )}
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
                              const needsLitsFaits = !!res.options?.litsFaits;
                              const needsLinge = !!res.options?.lingeFourni;
                              const needsMenage = !!res.options?.menage;
                              const needsPetitDej = res.repasGlobal?.PETIT_DEJ || (res.repas && Object.values(res.repas).some(r => r.PETIT_DEJ && Object.keys(r.PETIT_DEJ).length > 0));
                              
                              const start = new Date(res.dateDebut);
                              const end = new Date(res.dateFin);
                              const nuits = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                              const nbChambres = res.chambres?.length || 1;
                              
                              setMissionChecks({
                                'Préparation petit-déjeuner': { checked: !!needsPetitDej, montant: 30 * nuits, isRecommended: !!needsPetitDej },
                                'Draps et ménage': { checked: false, montant: 70 },
                                'Lits faits': { checked: needsLitsFaits, montant: 10 * nbChambres, isRecommended: needsLitsFaits },
                                'Linge de toilette': { checked: needsLinge, montant: 10 * nbChambres, isRecommended: needsLinge },
                                'Ménage': { checked: needsMenage, montant: 30 * nbChambres, isRecommended: needsMenage },
                                'Remise des clés': { checked: false, montant: 30 },
                                'Astreinte de nuit sur place': { checked: false, montant: 200 * nuits },
                                'Astreinte de nuit à domicile': { checked: false, montant: 100 * nuits }
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
                        <div className="text-xs font-bold text-slate-600">{formatAdminName(res.validePar)}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="text-[11px] font-bold text-slate-600 leading-tight">
                          {new Date(res.createdAt).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'})}
                          <br />
                          <span className="font-normal text-slate-400">
                            {new Date(res.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          {res.statut === 'EN_ATTENTE' && (
                            <>
                              <button onClick={() => handleAction('accept', res.id)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-500 hover:text-white transition-colors" title="Accepter la réservation">
                                <Check size={18} />
                              </button>
                              <button onClick={() => handleAction('reject', res.id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Refuser la réservation">
                                <X size={18} />
                              </button>
                            </>
                          )}
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
                              {res.statutCaution === 'DEPOSEE' && (
                                <>
                                  <button onClick={() => triggerPaymentAction(res.id, 'cancel-caution')} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Annuler la caution">
                                    <ShieldAlert size={18} />
                                  </button>
                                  <button onClick={() => { setCaptureReservationId(res.id); setShowCaptureModal(true); }} className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-500 hover:text-white transition-colors" title="Retenir un montant partiel">
                                    <Coins size={18} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => {
                              setManualPaymentRes(res);
                              const isAcomptePaid = res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE';
                              const defaultType = isAcomptePaid ? 'SOLDE' : 'ACOMPTE';
                              const defaultAmt = isAcomptePaid
                                ? (res.montantSolde || Math.round((res.prixTotal || 0) * 0.7 * 100) / 100)
                                : (res.montantAcompte === 0 ? (res.prixTotal || 0) : (res.montantAcompte || Math.round((res.prixTotal || 0) * 0.3 * 100) / 100));
                              const defaultTypeFormatted = res.montantAcompte === 0 && !isAcomptePaid ? 'TOTAL' : defaultType;
                              
                              setManualPaymentForm({
                                montant: defaultAmt.toString(),
                                mode: 'ESPECES',
                                typePaiement: defaultTypeFormatted
                              });
                              setShowManualPaymentModal(true);
                            }}
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors"
                            title="Enregistrer un paiement manuel"
                          >
                            <Banknote size={18} />
                          </button>
                          {res.statutPaiement !== 'EN_ATTENTE' && (
                            <button
                              onClick={() => {
                                setRefundRes(res);
                                setRefundForm({
                                  montant: '',
                                  mode: (res.modePaiement === 'STRIPE' || res.stripeSessionId || res.stripeAcompteId || res.stripeSoldeId) ? 'STRIPE' : 'VIREMENT',
                                  description: ''
                                });
                                setShowRefundModal(true);
                              }}
                              className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                              title="Effectuer un remboursement"
                            >
                              <Coins size={18} />
                            </button>
                          )}
                          {res.numeroDevis && (
                            <button
                              onClick={() => window.open(`${API_URL}/api/admin/devis/${res.id}/pdf?token=${token}`, '_blank')}
                              className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                              title="Télécharger le Devis PDF"
                            >
                              <FileText size={18} />
                            </button>
                          )}
                          {(res.statut === 'RESERVE' || res.statut === 'TERMINE') && (
                            <button
                              onClick={() => openInvoiceModal(res)}
                              className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
                              title="Gérer la facture"
                            >
                              <Banknote size={18} />
                            </button>
                          )}
                          <button onClick={() => setEditingReservation(res)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors" title="Modifier la réservation">
                            <Edit3 size={18} />
                          </button>
                          <button onClick={() => setDeleteModalId(res.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Supprimer la réservation">
                            <Trash2 size={18} />
                          </button>
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
                onClick={() => setShowAddModal(true)}
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
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Prestations</th>
                      <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Restauration</th>
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
                        <div className="text-sm font-bold text-muc-blue">
                          {(res.chambres || []).map(id => CHAMBRES_NAMES[id] || `Ch. ${id}`).join(', ')}
                        </div>
                        {res.salles && (
                          <div className="text-sm font-bold text-indigo-600 mt-1 flex flex-col">
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
                              totalEnfants += parseInt(ch.mineurs || ch.enfants || 0);
                            });
                          }
                          const total = totalAdultes + totalEnfants;
                          if (total === 0) return <div className="text-xs font-bold text-slate-700 mt-1">👥 0 occupant</div>;
                          return (
                            <div className="text-xs font-bold text-slate-700 mt-1 bg-slate-100 px-2 py-1 rounded inline-block">
                              👥 {total} occupant{total > 1 ? 's' : ''} <span className="font-normal text-slate-500 ml-1">({totalAdultes} Adultes, {totalEnfants} Enfants)</span>
                            </div>
                          );
                        })()}
                        <div className="text-[10px] text-slate-500 mt-1.5 flex gap-1 flex-wrap font-bold">
                          {res.options?.litsFaits && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🛏️ Lits</span>}
                          {res.options?.lingeFourni && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧴 Linge</span>}
                          {res.options?.menage && <span className="border border-slate-200 px-1 py-0.5 rounded bg-slate-50 uppercase tracking-wider">🧹 Ménage</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wider font-bold">
                          {(() => {
                            let totalPtitDej = 0;
                            let totalDej = 0;
                            let totalDiner = 0;
                            
                            if (res.repas) {
                              Object.values(res.repas).forEach(r => {
                                if (r.PETIT_DEJ) {
                                  totalPtitDej += (parseInt(r.PETIT_DEJ.ADULTE) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_12) || 0) + (parseInt(r.PETIT_DEJ.ENFANT_MOINS_5) || 0);
                                }
                                if (r.DEJEUNER) {
                                  totalDej += (parseInt(r.DEJEUNER.ADULTE) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(r.DEJEUNER.ENFANT_MOINS_5) || 0);
                                }
                                if (r.DINER) {
                                  totalDiner += (parseInt(r.DINER.ADULTE) || 0) + (parseInt(r.DINER.ENFANT_MOINS_12) || 0) + (parseInt(r.DINER.ENFANT_MOINS_5) || 0);
                                }
                              });
                            }
                            
                            if (totalPtitDej === 0 && totalDej === 0 && totalDiner === 0) {
                              const hasPtitDej = res.repasGlobal?.PETIT_DEJ;
                              const hasDej = res.repasGlobal?.DEJEUNER;
                              const hasDiner = res.repasGlobal?.DINER;
                              
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
                            }
                            
                            return (
                              <>
                                {totalPtitDej > 0 && <span className="text-orange-600">🥐 {totalPtitDej} Petit-déj</span>}
                                {totalDej > 0 && <span className="text-green-600">🍲 {totalDej} Déjeuner(s)</span>}
                                {totalDiner > 0 && <span className="text-blue-600">🍝 {totalDiner} Dîner(s)</span>}
                              </>
                            );
                          })()}
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
                          <div className="text-xs font-bold text-slate-600">{new Date(res.createdAt).toLocaleDateString('fr-FR')} à {new Date(res.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            {(res.statut === 'DEVIS_EN_ATTENTE' || res.statut === 'DEVIS_EXPIRE') && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingReservation(res);
                                    setActiveTab('new-devis');
                                  }}
                                  className="p-1.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded transition-colors"
                                  title="Modifier le devis"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleProlongDevis(res)}
                                  className="p-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded transition-colors"
                                  title="Prolonger la validité"
                                >
                                  <Clock size={14} />
                                </button>
                                <button
                                  onClick={() => window.open(`${API_URL}/api/admin/devis/${res.id}/pdf?token=${token}`, '_blank')}
                                  className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded transition-colors"
                                  title="Visualiser le PDF"
                                >
                                  <FileText size={14} />
                                </button>
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
                                className="p-2 bg-blue-50 text-muc-blue rounded-lg hover:bg-muc-blue hover:text-white transition-colors"
                                title="Valider et transformer en réservation"
                              >
                                <Check size={18} />
                              </button>
                              </>
                            )}
                            <button
                              onClick={() => setDeleteModalId(res.id)}
                              className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                              title="Supprimer le devis"
                            >
                              <Trash2 size={18} />
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
                      setIntervenantForm({ nom: '', prenom: '', email: '', telephone: '', password: '', disponibilites: [], statut: 'SALARIE' });
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
                      <div className="flex items-center gap-4 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-lg">{interv.prenom} {interv.nom}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-black uppercase ${interv.statut === 'INDEPENDANT' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-green-100 text-green-800 border border-green-200'}`}>
                          {interv.statut === 'INDEPENDANT' ? 'Indépendant / Prestataire' : 'Salarié MUC'}
                        </span>
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
                    <div className="flex gap-1.5 shrink-0 ml-4">
                      <button 
                        onClick={() => inviteIntervenant(interv)} 
                        disabled={invitingId === interv.id}
                        className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
                        title="Inviter par e-mail"
                      >
                        <Mail size={18} />
                      </button>
                      <button onClick={() => editIntervenant(interv)} className="p-2 bg-blue-50 text-muc-blue rounded-lg hover:bg-muc-blue hover:text-white transition-colors" title="Modifier">
                        <Edit3 size={18} />
                      </button>
                      <button onClick={() => deleteIntervenant(interv.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Supprimer">
                        <Trash2 size={18} />
                      </button>
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
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-slate-800">Informations</h3>
                  {!isEditingClient && (
                    <button
                      onClick={() => startEditClient(selectedClient)}
                      className="px-3 py-1 bg-muc-blue text-white rounded-md text-xs font-bold hover:bg-muc-blue/90 transition-colors"
                    >
                      ✏️ Modifier
                    </button>
                  )}
                </div>
                {isEditingClient ? (
                  <form onSubmit={saveClient} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Nom complet</label>
                      <input
                        required
                        type="text"
                        value={editClientForm.nom}
                        onChange={e => setEditClientForm({ ...editClientForm, nom: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-muc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Adresse email</label>
                      <input
                        required
                        type="email"
                        value={editClientForm.email}
                        onChange={e => setEditClientForm({ ...editClientForm, email: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-muc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Téléphone</label>
                      <input
                        required
                        type="text"
                        value={editClientForm.telephone}
                        onChange={e => setEditClientForm({ ...editClientForm, telephone: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-muc-blue"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Adresse postale</label>
                      <textarea
                        value={editClientForm.adressePostale}
                        onChange={e => setEditClientForm({ ...editClientForm, adressePostale: e.target.value })}
                        rows="2"
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-muc-blue resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingClient(false)}
                        className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-md text-xs font-bold hover:bg-slate-300 transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingClient}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingClient ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
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
                <h3 className="font-bold text-slate-800 mb-3">Historique des Réservations</h3>
                <div className="space-y-4">
                  {selectedClient.reservations.map(res => (
                    <div key={res.id} className="border border-slate-100 p-4 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-muc-blue">Réf: {res.numeroDevis || `Résa #${res.id}`}</span>
                          {res.numeroDevis && (
                            <button
                              onClick={() => window.open(`${API_URL}/api/admin/devis/${res.id}/pdf?token=${token}`, '_blank')}
                              className="p-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-[10px] font-bold"
                              title="Télécharger le Devis PDF"
                            >
                              Devis PDF
                            </button>
                          )}
                          {(res.statut === 'RESERVE' || res.statut === 'TERMINE') && (
                            <button
                              onClick={() => openInvoiceModal(res)}
                              className="p-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-[10px] font-bold"
                              title="Gérer la facture"
                            >
                              Facture PDF
                            </button>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md uppercase font-bold ${
                          res.statut === 'RESERVE' ? 'bg-green-100 text-green-700' :
                          res.statut === 'DEVIS_EN_ATTENTE' ? 'bg-amber-100 text-amber-700' :
                          res.statut === 'DEVIS_EXPIRE' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{res.statut}</span>
                      </div>

                      {/* Timeline */}
                      <div className="relative border-l-2 border-slate-100 pl-4 ml-2 space-y-4 my-4">
                        {/* 1. Étape Création */}
                        <div className="relative">
                          <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></div>
                          <p className="text-xs font-bold text-slate-700">Création</p>
                          <p className="text-xs text-slate-500">
                            {new Date(res.createdAt).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {res.numeroDevis ? (
                              <span>📋 Devis Initial (N° <strong>{res.numeroDevis}</strong>)</span>
                            ) : (
                              <span>⚡ Réservation Directe</span>
                            )}
                          </p>
                        </div>

                        {/* 2. Étape Validation */}
                        <div className="relative">
                          <div className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                            (res.valideLe || res.statut === 'RESERVE' || res.statut === 'ACCEPTEE') ? 'bg-green-500' : 'bg-slate-300'
                          }`}></div>
                          <p className="text-xs font-bold text-slate-700">Validation</p>
                          {res.valideLe ? (
                            <>
                              <p className="text-xs text-slate-500">
                                {new Date(res.valideLe).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Validé {res.validePar ? `par ${res.validePar}` : ''}
                              </p>
                            </>
                          ) : (res.statut === 'RESERVE' || res.statut === 'ACCEPTEE') ? (
                            <>
                              <p className="text-xs text-slate-500 italic">Validé (Date de validation antérieure ou inconnue)</p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Statut : {res.statut} {res.validePar ? `par ${res.validePar}` : ''}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 italic">En attente de validation</p>
                          )}
                        </div>

                        {/* 3. Étape Paiement */}
                        <div className="relative">
                          <div className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                            (res.payeLe || res.statutPaiement === 'PAYE' || res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'SOLDE_PAYE') ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}></div>
                          <p className="text-xs font-bold text-slate-700">Règlement</p>
                          {res.payeLe ? (
                            <>
                              <p className="text-xs text-slate-500">
                                {new Date(res.payeLe).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Réglé par <strong className="uppercase">{res.modePaiement || 'N/A'}</strong> (Statut : <strong>{res.statutPaiement}</strong>)
                              </p>
                            </>
                          ) : (res.statutPaiement === 'PAYE' || res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'SOLDE_PAYE') ? (
                            <>
                              <p className="text-xs text-slate-500 italic">Payé (Date de transaction antérieure ou inconnue)</p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Mode : <strong className="uppercase">{res.modePaiement || 'N/A'}</strong> (Statut : <strong>{res.statutPaiement}</strong>)
                              </p>
                            </>
                          ) : (
                            <div>
                              <p className="text-xs text-slate-400 italic">En attente de règlement (Statut : {res.statutPaiement})</p>
                              {res.modePaiement && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Moyen attendu : <strong className="uppercase">{res.modePaiement}</strong>
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 4. Étape Délai de traitement (si validé et payé) */}
                        {res.valideLe && res.payeLe && (
                          <div className="relative bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="absolute -left-[25px] top-3 w-3 h-3 rounded-full bg-purple-500 border-2 border-white"></div>
                            <p className="text-[11px] font-bold text-purple-700">Délai de traitement</p>
                            <p className="text-xs text-slate-600 font-medium">
                              {(() => {
                                const diffMs = new Date(res.payeLe) - new Date(res.valideLe);
                                if (diffMs < 0) return "Paiement enregistré avant validation";
                                const diffMin = Math.floor(diffMs / (1000 * 60));
                                const diffHours = Math.floor(diffMin / 60);
                                const diffDays = Math.floor(diffHours / 24);
                                
                                if (diffDays > 0) {
                                  const hoursLeft = diffHours % 24;
                                  return `${diffDays} jour(s) et ${hoursLeft} heure(s) entre la validation et le paiement`;
                                } else if (diffHours > 0) {
                                  const minsLeft = diffMin % 60;
                                  return `${diffHours} heure(s) et ${minsLeft} minute(s) entre la validation et le paiement`;
                                } else {
                                  return `${diffMin} minute(s) entre la validation et le paiement`;
                                }
                              })()}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Stay & Estimation details */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-1 mt-3">
                        <div className="flex justify-between">
                          <span>Séjour :</span>
                          <span className="font-bold">Du {new Date(res.dateDebut).toLocaleDateString('fr-FR')} au {new Date(res.dateFin).toLocaleDateString('fr-FR')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Chambres :</span>
                          <span>{(res.chambres || []).join(', ')}</span>
                        </div>
                        <div className="flex flex-col space-y-0.5 mt-1 pb-1">
                          <span className="font-semibold text-slate-500">Restauration :</span>
                          {formatMealsDetail(res.repas)}
                        </div>
                        {res.structure && (
                          <div className="flex justify-between">
                            <span>Structure :</span>
                            <span className="font-semibold">{res.structure}</span>
                          </div>
                        )}
                        <hr className="border-slate-200 my-1" />
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>Estimation Prix Total :</span>
                          <span>{res.prixTotal ? `${res.prixTotal.toFixed(2)} €` : 'N/A'}</span>
                        </div>
                        {res.repas && Object.keys(res.repas).length > 0 && (
                          <div className="flex justify-between text-slate-500 font-semibold pl-2 border-l-2 border-amber-300">
                            <span>Dont Restauration :</span>
                            <span className="text-amber-700">{calculerTotalRepasFrontend(res.repas).toFixed(2)} €</span>
                          </div>
                        )}
                        {res.montantAcompte && (
                          <div className="flex justify-between text-slate-500">
                            <span>Acompte estimé :</span>
                            <span>{res.montantAcompte.toFixed(2)} €</span>
                          </div>
                        )}
                        {res.montantSolde && (
                          <div className="flex justify-between text-slate-500">
                            <span>Solde estimé :</span>
                            <span>{res.montantSolde.toFixed(2)} €</span>
                          </div>
                        )}
                        {(() => {
                          let taxe = 0;
                          if (res.dateDebut && res.dateFin) {
                            const nuits = Math.max(1, Math.ceil((new Date(res.dateFin) - new Date(res.dateDebut)) / (1000 * 60 * 60 * 24)));
                            let nbAdultes = 0;
                            let nbOccupants = 0;
                            if (res.occupants && res.occupants.length > 0) {
                              nbAdultes = res.occupants.filter(o => o.estAdulte).length;
                              nbOccupants = res.occupants.length;
                            } else if (res.chambresDetails && Object.keys(res.chambresDetails).length > 0) {
                              Object.values(res.chambresDetails).forEach(room => {
                                nbAdultes += parseInt(room.adultes || 0);
                                nbOccupants += parseInt(room.adultes || 0) + parseInt(room.mineurs || 0);
                              });
                            }
                            if (nbAdultes > 0 && res.chambres && res.chambres.length > 0) {
                               const tarifPers = (nbOccupants >= res.chambres.length * 4) ? 22 : 25;
                               taxe = nbAdultes * tarifPers * nuits * 0.044;
                            }
                          }
                          return taxe > 0 ? (
                            <div className="flex justify-between text-muc-blue/80 font-bold mt-1">
                              <span>Taxe de séjour (estimée) :</span>
                              <span>{taxe.toFixed(2)} €</span>
                            </div>
                          ) : null;
                        })()}
                      </div>

                      {/* Suivi des Règlements Réels */}
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5 text-muc-blue" />
                          Suivi des Règlements
                        </p>
                        <div className="bg-slate-100/60 p-2.5 rounded-lg border border-slate-200/50 space-y-1.5 text-[11px]">
                          {/* Acompte */}
                          <div className="flex justify-between items-center pb-1 border-b border-slate-200/40">
                            <div>
                              <span className="font-semibold text-slate-700">1. Acompte : </span>
                              <span className="text-slate-500">
                                {res.montantAcompte ? `${res.montantAcompte.toFixed(2)} €` : '30% à la validation'}
                              </span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              (res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE') 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {(res.statutPaiement === 'ACOMPTE_PAYE' || res.statutPaiement === 'PAYE') ? 'PAYÉ' : 'EN ATTENTE'}
                            </span>
                          </div>
                          
                          {/* Solde */}
                          <div className="flex justify-between items-center pb-1 border-b border-slate-200/40">
                            <div>
                              <span className="font-semibold text-slate-700">2. Solde : </span>
                              <span className="text-slate-500">
                                {res.montantSolde ? `${res.montantSolde.toFixed(2)} €` : 'Solde restant'}
                              </span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              res.statutPaiement === 'PAYE' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {res.statutPaiement === 'PAYE' ? 'PAYÉ' : 'EN ATTENTE'}
                            </span>
                          </div>
                          
                          {/* Caution */}
                          {res.statutCaution && res.statutCaution !== 'NON_DEMANDEE' && (
                            <div className="flex justify-between items-center pb-1 border-b border-slate-200/40 last:border-0 last:pb-0">
                              <div>
                                <span className="font-semibold text-slate-700">🛡️ Caution (Garantie) : </span>
                                <span className="text-slate-500">Pre-auth Stripe</span>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                res.statutCaution === 'DEPOSEE' ? 'bg-indigo-100 text-indigo-700' :
                                res.statutCaution === 'RESTITUEE' ? 'bg-green-100 text-green-700' :
                                res.statutCaution === 'UTILISEE' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {res.statutCaution === 'DEPOSEE' ? 'DÉPOSÉE' : 
                                 res.statutCaution === 'RESTITUEE' ? 'RESTITUÉE' : 
                                 res.statutCaution === 'UTILISEE' ? 'RETENUE' : res.statutCaution}
                              </span>
                            </div>
                          )}

                          {/* Total Payé Effectif */}
                          <div className="flex justify-between font-bold text-emerald-700 pt-1 text-xs">
                            <span>Total Encaissé Réel :</span>
                            <span>
                              {(() => {
                                let paye = 0;
                                if (res.statutPaiement === 'PAYE') {
                                  paye = res.prixTotal || 0;
                                } else if (res.statutPaiement === 'ACOMPTE_PAYE') {
                                  paye = res.montantAcompte || 0;
                                }
                                return `${paye.toFixed(2)} €`;
                              })()}
                            </span>
                          </div>
                          
                          {/* Moyen & Date */}
                          {(res.payeLe || res.modePaiement) && (
                            <div className="text-[10px] text-slate-400 mt-1 italic">
                              Enregistré par <strong className="uppercase">{res.modePaiement || 'Stripe'}</strong>
                              {res.payeLe && ` le ${new Date(res.payeLe).toLocaleDateString('fr-FR')}`}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Occupants list */}
                      {res.occupants && res.occupants.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs font-bold text-slate-700 mb-1">Occupants ({res.occupants.length}) :</p>
                          <ul className="text-xs text-slate-500 list-disc list-inside grid grid-cols-2 gap-x-2 gap-y-0.5">
                            {res.occupants.map(o => (
                              <li key={o.id} className="truncate">{o.prenom} {o.nom} {o.estAdulte ? '(Ad)' : `(Enf, ${o.age} ans)`}</li>
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
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Statut de facturation</label>
                <select 
                  value={intervenantForm.statut || 'SALARIE'} 
                  onChange={e => setIntervenantForm({ ...intervenantForm, statut: e.target.value })} 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:border-muc-blue bg-white font-medium"
                >
                  <option value="SALARIE">Salarié MUC (Frais de personnel - PCG 641)</option>
                  <option value="INDEPENDANT">Indépendant / Prestataire (Prestations de services - PCG 611)</option>
                </select>
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

      {activeTab === 'finances' && (() => {
        // PCG Computations
        
        // RECETTES
        let r7061 = 0; // Hébergement
        let r7062 = 0; // Restauration
        let r7063 = 0; // Salles
        let r447  = 0; // Taxe de séjour collectée
        let rList7061 = [];
        let rList7062 = [];
        let rList7063 = [];
        let rList447 = [];

        (finances?.recettesDetaillees || []).forEach(r => {
            if (r.partHebergement > 0) {
                r7061 += r.partHebergement;
                rList7061.push({ date: r.date || r.createdAt, label: `Résa #${r.id} (${r.clientNom})`, montant: r.partHebergement, statut: r.typePaiement });
            }
            if (r.partRestauration > 0) {
                r7062 += r.partRestauration;
                rList7062.push({ date: r.date || r.createdAt, label: `Repas Résa #${r.id} (${r.clientNom})`, montant: r.partRestauration, statut: r.typePaiement });
            }
            if (r.partSalles > 0) {
                r7063 += r.partSalles;
                rList7063.push({ date: r.date || r.createdAt, label: `Salles Résa #${r.id} (${r.clientNom})`, montant: r.partSalles, statut: r.typePaiement });
            }
            if (r.partTaxeSejour > 0) {
                r447 += r.partTaxeSejour;
                rList447.push({ 
                    date: r.date || r.createdAt, 
                    label: `Taxe Résa #${r.id} (${r.clientNom})`, 
                    montant: r.partTaxeSejour, 
                    statut: r.typePaiement,
                    nbAdultes: r.nbAdultes || 0,
                    nbMineurs: r.nbMineurs || 0,
                    nuits: r.nuits || 0
                });
            }
        });
        
        const totalRecettes = r7061 + r7062 + r7063 + r447;

        // DEPENSES
        let d601 = 0; // Achats (repas + manuels)
        let d641 = 0; // Personnel
        let d447 = 0; // Reversement taxe
        let dAutres = {}; // Groupés par code
        
        let dList601 = [];
        let dList641 = [];
        let dList447 = [];
        let dListAutres = {};

        // Achats automatiques de repas
        (finances?.repasCoutsDetailles || []).forEach(r => {
            d601 += r.montant;
            dList601.push({ date: r.date, label: r.label, montant: r.montant, statut: 'Auto' });
        });

        // Rémunérations
        let d611 = 0; // Prestations externes (Indépendants)
        let dList611 = [];

        (finances?.missionsDetails || []).forEach(m => {
            if (m.intervenantStatut === 'INDEPENDANT') {
                d611 += m.montant;
                dList611.push({ date: m.date, label: `${m.typeMission} - ${m.intervenant} (Résa #${m.reservationId})`, montant: m.montant, statut: m.statut });
            } else {
                d641 += m.montant;
                dList641.push({ date: m.date, label: `${m.typeMission} - ${m.intervenant} (Résa #${m.reservationId})`, montant: m.montant, statut: m.statut });
            }
        });

        // Dépenses manuelles
        (finances?.expenses || []).forEach(e => {
            const code = e.comptePcg || '618';
            const item = { date: e.date, label: e.label, montant: e.montant, statut: e.categorie };
            if (code.startsWith('601')) {
                d601 += e.montant;
                dList601.push(item);
            } else if (code.startsWith('641')) {
                d641 += e.montant;
                dList641.push(item);
            } else if (code.startsWith('611')) {
                d611 += e.montant;
                dList611.push(item);
            } else if (code.startsWith('447')) {
                d447 += e.montant;
                dList447.push(item);
            } else {
                if (!dAutres[code]) {
                    dAutres[code] = { total: 0, items: [] };
                }
                dAutres[code].total += e.montant;
                dAutres[code].items.push(item);
            }
        });

        let totalDepenses = d601 + d641 + d611 + d447 + Object.values(dAutres).reduce((sum, g) => sum + g.total, 0);
        
        const resultatNet = totalRecettes - totalDepenses;

        const taxesMensuelles = rList447.reduce((acc, item) => {
            const date = new Date(item.date);
            const monthYear = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            if (!acc[monthYear]) acc[monthYear] = { total: 0, items: [] };
            acc[monthYear].total += item.montant;
            acc[monthYear].items.push(item);
            return acc;
        }, {});
        // Sort by date (descending)
        const taxesMensuellesArray = Object.entries(taxesMensuelles).map(([label, data]) => ({
            label,
            total: data.total,
            items: data.items
        }));


        const openModal = (code, title, total, items) => {
            setFinanceModalData({ code, title, total, items: items.sort((a,b) => new Date(b.date) - new Date(a.date)) });
            setShowFinanceModal(true);
        };

        const PCGRow = ({ code, title, total, items, type }) => (
            <div 
                onClick={() => openModal(code, title, total, items)}
                className={`flex justify-between items-center p-4 border rounded-xl cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg ${type === 'recette' ? 'bg-green-50 hover:bg-green-100 border-green-200' : 'bg-red-50 hover:bg-red-100 border-red-200'}`}
            >
                <div>
                    <span className={`text-xs font-black px-2 py-1 rounded-md ${type === 'recette' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>{code}</span>
                    <span className="ml-3 font-bold text-slate-700 text-sm">{title}</span>
                </div>
                <span className={`font-black text-lg ${type === 'recette' ? 'text-green-600' : 'text-red-600'}`}>
                    {type === 'depense' ? '-' : ''}{total.toFixed(2)} €
                </span>
            </div>
        );

        return (
            <div className="space-y-6 pb-20">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Tableau de Bord Financier (PCG)</h2>
                    <button onClick={() => setShowExpenseModal(true)} className="bg-muc-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md text-sm">+ Nouvelle Dépense Manuelle</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* DÉPENSES */}
                    <div className="bg-white rounded-2xl shadow-xl border-t-8 border-t-red-500 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-red-50/50">
                            <h3 className="font-black text-red-800 uppercase tracking-widest flex items-center gap-2">
                                <span className="text-2xl">📉</span> Dépenses (Débit)
                            </h3>
                            <span className="text-2xl font-black text-red-600">-{totalDepenses.toFixed(2)} €</span>
                        </div>
                        <div className="p-6 space-y-4">
                            <PCGRow code="601" title="Achats (Matières 1ères, repas)" total={d601} items={dList601} type="depense" />
                            <PCGRow code="611" title="Sous-traitance & Prestations externes" total={d611} items={dList611} type="depense" />
                            <PCGRow code="641" title="Rémunérations du personnel" total={d641} items={dList641} type="depense" />
                            <PCGRow code="447" title="Reversement Taxe de Séjour" total={d447} items={dList447} type="depense" />
                            
                            {Object.entries(dAutres).sort((a,b) => a[0].localeCompare(b[0])).map(([code, data]) => (
                                <PCGRow key={code} code={code} title="Autres Dépenses" total={data.total} items={data.items} type="depense" />
                            ))}
                        </div>
                    </div>

                    {/* RECETTES */}
                    <div className="bg-white rounded-2xl shadow-xl border-t-8 border-t-green-500 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-green-50/50">
                            <h3 className="font-black text-green-800 uppercase tracking-widest flex items-center gap-2">
                                <span className="text-2xl">📈</span> Recettes (Crédit)
                            </h3>
                            <span className="text-2xl font-black text-green-600">+{totalRecettes.toFixed(2)} €</span>
                        </div>
                        <div className="p-6 space-y-4">
                            <PCGRow code="7061" title="Hébergement (Chambres)" total={r7061} items={rList7061} type="recette" />
                            <PCGRow code="7062" title="Restauration (Repas facturés)" total={r7062} items={rList7062} type="recette" />
                            <PCGRow code="7063" title="Location de Salles" total={r7063} items={rList7063} type="recette" />
                            <PCGRow code="447" title="Taxe de séjour collectée" total={r447} items={rList447} type="recette" />
                        </div>
                    </div>
                </div>

                {/* RÉSULTAT */}
                <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center text-center transform transition-all hover:scale-[1.01]">
                    <h3 className="text-slate-400 font-black uppercase tracking-widest text-sm mb-2">Résultat Net (Recettes - Dépenses)</h3>
                    <p className={`text-6xl font-black ${resultatNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {resultatNet >= 0 ? '+' : ''}{resultatNet.toFixed(2)} €
                    </p>
                </div>

                {/* TAXE DE SEJOUR MENSUELLE */}
                <div className="bg-amber-50 rounded-2xl shadow-xl border border-amber-100 overflow-hidden mt-8">
                    <div className="p-6 border-b border-amber-200 flex justify-between items-center bg-amber-100/50 flex-wrap gap-2">
                        <h3 className="font-black text-amber-900 uppercase tracking-widest flex items-center gap-2">
                            <span className="text-2xl">🏛️</span> Taxe de Séjour Mensuelle (À reverser)
                        </h3>
                        <button
                          type="button"
                          disabled={isSendingTaxReport}
                          onClick={handleSendMonthlyTaxReport}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSendingTaxReport ? (
                            <>
                              <Loader2 className="animate-spin" size={14} />
                              Envoi en cours...
                            </>
                          ) : (
                            <>
                              <Mail size={14} />
                              Envoyer le rapport par e-mail
                            </>
                          )}
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {taxesMensuellesArray.length > 0 ? taxesMensuellesArray.map((t, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => openModal("447", `Taxe de Séjour - ${t.label}`, t.total, t.items)}
                                className="flex justify-between items-center p-4 border border-amber-200 rounded-xl bg-white shadow-sm cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md hover:bg-amber-50"
                            >
                                <span className="text-xs font-bold text-amber-900 capitalize">{t.label}</span>
                                <span className="text-base font-black text-amber-600">{t.total.toFixed(2)} €</span>
                            </div>
                        )) : <p className="text-sm text-amber-700 italic p-4 col-span-full text-center">Aucune taxe de séjour collectée pour le moment.</p>}
                        </div>
                    </div>
                </div>
            </div>
        );
      })()}
      {activeTab === 'factures' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest">Gestion & Édition des Factures</h2>
              {reservationsFactures.length > 0 && (
                <button
                  onClick={() => {
                    window.open(`${API_URL}/api/admin/factures/period/zip?dateDebut=${dateDebutFacture}&dateFin=${dateFinFacture}&token=${token}`, '_blank');
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md"
                >
                  📦 Télécharger les {reservationsFactures.length} factures (ZIP)
                </button>
              )}
            </div>
            
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher une facture (nom du client, structure, e-mail, référence...)"
                  value={factureSearch}
                  onChange={(e) => setFactureSearch(e.target.value)}
                  className="w-full bg-slate-50 pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-muc-blue focus:outline-none transition-all text-sm"
                />
                <Search className="absolute left-4 top-4 text-slate-400" size={18} />
              </div>
            </div>
            
            <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Séjour débutant après le :</label>
                <input 
                  type="date" 
                  value={dateDebutFacture} 
                  onChange={(e) => setDateDebutFacture(e.target.value)}
                  className="w-full bg-white p-3 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-muc-blue focus:outline-none"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Séjour débutant avant le :</label>
                <input 
                  type="date" 
                  value={dateFinFacture} 
                  onChange={(e) => setDateFinFacture(e.target.value)}
                  className="w-full bg-white p-3 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-muc-blue focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const now = new Date();
                    setDateDebutFacture(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
                    setDateFinFacture(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
                  }}
                  className="px-3 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 bg-white transition-all"
                >
                  Mois en cours
                </button>
                <button 
                  onClick={() => {
                    const now = new Date();
                    setDateDebutFacture(new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]);
                    setDateFinFacture(new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0]);
                  }}
                  className="px-3 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 bg-white transition-all"
                >
                  Année en cours
                </button>
                <button 
                  onClick={fetchReservationsFactures}
                  disabled={isLoadingFactures}
                  className="bg-muc-blue text-white px-6 py-3 rounded-xl font-black uppercase tracking-wider hover:bg-blue-800 transition-all shadow-md flex items-center gap-2"
                >
                  {isLoadingFactures ? 'Chargement...' : '🔍 Filtrer'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            {isLoadingFactures ? (
              <div className="p-12 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-muc-blue border-t-transparent rounded-full mb-4"></div>
                <p className="text-slate-500 font-medium">Chargement des factures de la période...</p>
              </div>
            ) : reservationsFactures.length === 0 ? (
              <div className="p-12 text-center bg-slate-50/50">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-slate-500 font-bold mb-1">Aucune réservation trouvée pour cette période.</p>
                <p className="text-xs text-slate-400">Modifiez les dates de filtre ci-dessus pour élargir votre recherche.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black text-slate-400 uppercase tracking-widest select-none">
                      <th className="p-4 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestFactureSort('ref')}>
                        Réf / Devis {factureSortConfig.key === 'ref' && (factureSortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      <th className="p-4 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestFactureSort('client')}>
                        Client / Structure {factureSortConfig.key === 'client' && (factureSortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      <th className="p-4 cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestFactureSort('dateDebut')}>
                        Séjour {factureSortConfig.key === 'dateDebut' && (factureSortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      <th className="p-4 text-right cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestFactureSort('prixTotal')}>
                        Total TTC {factureSortConfig.key === 'prixTotal' && (factureSortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-slate-600 transition-colors" onClick={() => requestFactureSort('statutPaiement')}>
                        Règlements {factureSortConfig.key === 'statutPaiement' && (factureSortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {getFilteredAndSortedFactures().map((res) => {
                      const start = new Date(res.dateDebut);
                      const end = new Date(res.dateFin);
                      const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                      const year = new Date().getFullYear();
                      const month = String(new Date().getMonth() + 1).padStart(2, '0');
                      const refFacture = res.numeroFacture || (res.numeroDevis 
                        ? res.numeroDevis.replace(/^D-/, 'F-') 
                        : `FA-${year}-${month}-${String(res.id).padStart(5, '0')}`);

                      return (
                        <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                              {refFacture}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1 font-semibold">Résa #{res.id}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{res.client.nom}</div>
                            {res.structure && (
                              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                                🏢 {res.structure}
                              </div>
                            )}
                            <div className="text-xs text-slate-400 font-medium mt-0.5">{res.client.email}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-slate-700">
                              du {start.toLocaleDateString('fr-FR')} au {end.toLocaleDateString('fr-FR')}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 font-medium">{nuits} nuits | {(res.chambres || []).length} chambre(s)</div>
                          </td>
                          <td className="p-4 text-right font-black text-slate-800">
                            {res.prixTotal ? `${res.prixTotal.toFixed(2)} €` : '0.00 €'}
                          </td>
                          <td className="p-4 text-center">
                            {res.statutPaiement === 'PAYE' ? (
                              <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 text-xs font-black uppercase tracking-wider rounded-lg">Payé</span>
                            ) : res.statutPaiement === 'ACOMPTE_PAYE' ? (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-black uppercase tracking-wider rounded-lg">Acompte</span>
                            ) : (
                              <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-xs font-black uppercase tracking-wider rounded-lg">Attente</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => openInvoiceModal(res)}
                              className="inline-flex items-center gap-2 bg-muc-blue hover:bg-blue-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-sm"
                            >
                              📄 Gérer la facture
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
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
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => deletePromoCode(promo.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Supprimer ce code promo">
                          <Trash2 size={18} />
                        </button>
                      </div>
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
            <button onClick={openNewAdminModal} className="bg-muc-blue text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-md">+ Nouvel Admin</button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
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
                      <div className="flex justify-end gap-1.5 animate-fadeIn">
                        <button onClick={() => editAdminAccount(acc)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-muc-blue hover:text-white transition-colors" title="Modifier ce compte">
                          <Edit3 size={18} />
                        </button>
                        <button onClick={() => deleteAdminAccount(acc.id)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors" title="Supprimer ce compte">
                          <Trash2 size={18} />
                        </button>
                      </div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-100 p-6 animate-fadeIn">
            <h3 className="text-lg font-black text-muc-blue uppercase tracking-tight mb-6 pb-2 border-b border-slate-100">
              {editingAdmin ? "Modifier l'Administrateur" : "Nouvel Administrateur"}
            </h3>
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
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">Téléphone</label>
                <input type="tel" value={adminForm.telephone || ''} onChange={e => setAdminForm({ ...adminForm, telephone: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" placeholder="06 XX XX XX XX" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1 ml-1">
                  Mot de passe {editingAdmin && <span className="text-slate-400 font-normal lowercase">(optionnel)</span>}
                </label>
                <input required={!editingAdmin} type="password" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-muc-blue rounded-xl outline-none font-bold" placeholder={editingAdmin ? "•••••••• (laisser vide)" : "••••••••"} />
              </div>

              <div className="border-t border-slate-100 pt-4 mt-4">
                <h4 className="text-xs font-black text-muc-blue uppercase tracking-wider mb-3">Préférences de notification</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center">
                    <input 
                      id="modal_notifNewReservation"
                      type="checkbox" 
                      checked={!!adminForm.notifNewReservation} 
                      onChange={e => setAdminForm({ ...adminForm, notifNewReservation: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifNewReservation" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Demandes de réservation
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      id="modal_notifNewDevis"
                      type="checkbox" 
                      checked={!!adminForm.notifNewDevis} 
                      onChange={e => setAdminForm({ ...adminForm, notifNewDevis: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifNewDevis" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Nouveaux devis émis
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      id="modal_notifDevisValidation"
                      type="checkbox" 
                      checked={!!adminForm.notifDevisValidation} 
                      onChange={e => setAdminForm({ ...adminForm, notifDevisValidation: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifDevisValidation" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Confirmations de devis
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      id="modal_notifPaymentReceived"
                      type="checkbox" 
                      checked={!!adminForm.notifPaymentReceived} 
                      onChange={e => setAdminForm({ ...adminForm, notifPaymentReceived: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifPaymentReceived" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Paiements reçus
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      id="modal_notifModificationRequest"
                      type="checkbox" 
                      checked={!!adminForm.notifModificationRequest} 
                      onChange={e => setAdminForm({ ...adminForm, notifModificationRequest: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifModificationRequest" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Demandes de modification
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      id="modal_notifIntervenantMissions"
                      type="checkbox" 
                      checked={!!adminForm.notifIntervenantMissions} 
                      onChange={e => setAdminForm({ ...adminForm, notifIntervenantMissions: e.target.checked })} 
                      className="rounded text-muc-blue focus:ring-muc-blue border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="modal_notifIntervenantMissions" className="ml-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                      Missions des intervenants
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setShowAdminModal(false); setEditingAdmin(null); }} className="flex-1 px-6 py-3 border-2 border-slate-100 text-slate-500 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all">Annuler</button>
                <button type="submit" className="flex-1 px-6 py-3 bg-muc-blue text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-800 transition-all shadow-lg shadow-blue-200">
                  {editingAdmin ? "Enregistrer" : "Créer le compte"}
                </button>
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
                              {type === 'Préparation petit-déjeuner' && '🥐 '}
                              {type === 'Draps et ménage' && '🛏️ '}
                              {type === 'Lits faits' && '🛏️ '}
                              {type === 'Ménage' && '🧹 '}
                              {type === 'Linge de toilette' && '🧴 '}
                              {type === 'Remise des clés' && '🔑 '}
                              {type === 'Astreinte de nuit sur place' && '🏠 '}
                              {type === 'Astreinte de nuit à domicile' && '📞 '}
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
                <h2 className="text-xl font-black text-muc-blue tracking-tight uppercase">{activeTab === 'devis' ? 'Nouveau Devis' : 'Ajouter une réservation'}</h2>
                <p className="text-xs text-slate-500 mt-1">{activeTab === 'devis' ? "Création d'un nouveau devis" : 'Saisie complète et blocage du planning'}</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl px-2">&times;</button>
            </div>
            <div className="p-6">
              <ReservationForm
                events={reservations.map(r => ({ id: r.id, start: r.dateDebut, end: r.dateFin, chambres: r.chambres }))}
                isAdmin={true}
                isDevis={activeTab === 'devis'}
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
                <h2 className="text-xl font-black text-muc-blue tracking-tight uppercase">{editingReservation.statut?.includes('DEVIS') ? 'Modifier le devis' : 'Modifier la réservation'}</h2>
                <p className="text-xs text-slate-500 mt-1">{editingReservation.statut?.includes('DEVIS') ? 'Modification du devis' : 'Modification de la réservation'} #{editingReservation.id}</p>
                {editingReservation.statut?.includes('DEVIS') && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1">
                      <Clock size={12} className="text-amber-600" />
                      Expire le : {editingReservation.expireLe ? new Date(editingReservation.expireLe).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Non défini'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleProlongDevis(editingReservation);
                        setEditingReservation(null);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md hover:scale-[1.02]"
                      title="Prolonger la validité sans modifier le contenu"
                    >
                      <Clock size={10} />
                      Prolonger le devis
                    </button>
                  </div>
                )}
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

      {showInvoiceModal && currentInvoiceRes && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowInvoiceModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <FileText className="w-6 h-6 text-muc-blue" />
              Gérer la facture
            </h3>
            
            <p className="text-slate-600 mb-6 text-sm">
              Sélectionnez les options pour la facture de la réservation <strong>#{currentInvoiceRes.id}</strong> ({currentInvoiceRes.client?.nom}).
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 text-muc-blue rounded focus:ring-muc-blue border-slate-300"
                  checked={invoiceIncludeOccupants}
                  onChange={(e) => setInvoiceIncludeOccupants(e.target.checked)}
                />
                <span className="text-slate-700 font-medium text-sm">
                  Inclure le nom des occupants (page Annexe)
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleDownloadInvoice}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Télécharger le PDF
              </button>
              
              <button
                onClick={handleSendInvoice}
                disabled={isSendingInvoice}
                className="w-full bg-muc-blue hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSendingInvoice ? (
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Mail className="w-5 h-5" />
                )}
                {isSendingInvoice ? 'Envoi en cours...' : 'Envoyer par e-mail au client'}
              </button>
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
              <h3 className="text-lg font-black text-slate-800">Lien de Paiement</h3>
              <button onClick={() => setPaymentLinkData(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              Le lien de paiement intermédiaire a été généré avec succès. Vous pouvez le copier et l'envoyer au client.
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
      {/* Modale Menu Paiement */}
      {paymentMenuResId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setPaymentMenuResId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="bg-muc-blue p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Demander un paiement</h3>
              <button onClick={() => setPaymentMenuResId(null)} className="text-white/70 hover:text-white">&times;</button>
            </div>
            <div className="p-6 space-y-3">
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'acompte'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-muc-yellow/10 border-2 border-slate-100 hover:border-muc-yellow rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-muc-yellow flex items-center justify-center text-slate-500 group-hover:text-white transition-colors">
                  <CreditCard size={20} />
                </div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Les arrhes (30%)</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien d'acompte</span>
                </div>
              </button>
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'solde'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-muc-blue/10 border-2 border-slate-100 hover:border-muc-blue rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-muc-blue flex items-center justify-center text-slate-500 group-hover:text-white transition-colors">
                  <CreditCard size={20} />
                </div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">Le solde</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien du solde</span>
                </div>
              </button>
              <button onClick={() => { triggerPaymentAction(paymentMenuResId, 'totalite'); setPaymentMenuResId(null); }} className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-emerald-500/10 border-2 border-slate-100 hover:border-emerald-500 rounded-xl transition-all group">
                <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-emerald-500 flex items-center justify-center text-slate-500 group-hover:text-white transition-colors">
                  <CreditCard size={20} />
                </div>
                <div className="text-left flex-1">
                  <span className="block font-bold text-slate-800">La totalité (100%)</span>
                  <span className="block text-xs text-slate-500">Envoyer le lien du montant total</span>
                </div>
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
                    <option value="STRIPE">Stripe (Carte Bancaire)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Type de règlement</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const amt = manualPaymentRes.montantAcompte || Math.round((manualPaymentRes.prixTotal || 0) * 0.3 * 100) / 100;
                        setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'ACOMPTE', montant: amt.toString() });
                      }}
                      className={`py-3 px-1 rounded-xl font-bold border-2 transition-all text-center leading-none ${manualPaymentForm.typePaiement === 'ACOMPTE' ? 'bg-muc-blue text-white border-muc-blue' : 'bg-white text-slate-600 border-slate-100 hover:border-muc-blue/30'}`}
                      style={{ fontSize: '10px' }}
                    >
                      Acompte (30%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const amt = manualPaymentRes.montantSolde || Math.round((manualPaymentRes.prixTotal || 0) * 0.7 * 100) / 100;
                        setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'SOLDE', montant: amt.toString() });
                      }}
                      className={`py-3 px-1 rounded-xl font-bold border-2 transition-all text-center leading-none ${manualPaymentForm.typePaiement === 'SOLDE' ? 'bg-muc-blue text-white border-muc-blue' : 'bg-white text-slate-600 border-slate-100 hover:border-muc-blue/30'}`}
                      style={{ fontSize: '10px' }}
                    >
                      Solde (70%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const amt = manualPaymentRes.prixTotal || 0;
                        setManualPaymentForm({ ...manualPaymentForm, typePaiement: 'TOTAL', montant: amt.toString() });
                      }}
                      className={`py-3 px-1 rounded-xl font-bold border-2 transition-all text-center leading-none ${manualPaymentForm.typePaiement === 'TOTAL' ? 'bg-muc-blue text-white border-muc-blue' : 'bg-white text-slate-600 border-slate-100 hover:border-muc-blue/30'}`}
                      style={{ fontSize: '10px' }}
                    >
                      Totalité (100%)
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

      {/* Modale Remboursement */}
      {showRefundModal && refundRes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-black uppercase tracking-tight">Rembourser un client</h3>
              <p className="text-sm opacity-90">Client : {refundRes.client?.nom || 'Inconnu'}</p>
            </div>
            <form onSubmit={handleRefund} className="p-8">
              <div className="space-y-6">
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-rose-900 text-xs font-semibold leading-relaxed">
                  ⚠️ <strong>Attention :</strong> Si vous choisissez le mode **Carte Bancaire (Stripe)**, le montant saisi sera **réellement remboursé** sur le compte bancaire du client via Stripe (à partir du paiement enregistré). Les autres modes (Virement, Espèces, Chèque) ne font que consigner la transaction dans vos finances.
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Montant à rembourser (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={refundForm.montant}
                    onChange={(e) => setRefundForm({ ...refundForm, montant: e.target.value })}
                    placeholder="Ex: 100.00"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-rose-600 outline-none transition-all font-bold text-slate-800"
                  />
                  <div className="text-[10px] text-slate-400 mt-1 font-medium">
                    Coût actuel séjour : {(refundRes.prixTotal || 0).toFixed(2)} € (Acompte : {(refundRes.montantAcompte || 0).toFixed(2)} €, Solde : {(refundRes.montantSolde || 0).toFixed(2)} €)
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Mode de remboursement</label>
                  <select
                    value={refundForm.mode}
                    onChange={(e) => setRefundForm({ ...refundForm, mode: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-rose-600 outline-none transition-all font-bold text-slate-800"
                  >
                    <option value="STRIPE">Carte Bancaire (Stripe)</option>
                    <option value="VIREMENT">Virement Bancaire</option>
                    <option value="ESPECES">Espèces</option>
                    <option value="CHEQUE">Chèque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Motif / Description (Optionnel)</label>
                  <textarea
                    value={refundForm.description}
                    onChange={(e) => setRefundForm({ ...refundForm, description: e.target.value })}
                    placeholder="Ex: Remboursement partiel suite à la suppression d'une chambre"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-rose-600 outline-none transition-all text-xs font-medium text-slate-700 h-20 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all"
                  disabled={isRefunding}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isRefunding}
                  className="flex-1 py-4 bg-rose-600 text-white font-black uppercase tracking-wider rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {isRefunding ? 'Traitement...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale de validation de modification client */}
      {showModificationModal && selectedProposedModification && (() => {
        const current = selectedProposedModification;
        const proposed = selectedProposedModification.modificationProposed || {};
        
        const recalculatedPrice = proposed.prixTotal || 0;
        const priceDifference = recalculatedPrice - (current.prixTotal || 0);

        // Helper to format values
        const formatOptionsList = (opt) => {
          if (!opt) return "Aucun";
          const list = [];
          if (opt.litsFaits) list.push("Lits faits");
          if (opt.lingeFourni) list.push("Linge de toilette");
          if (opt.menage) list.push("Ménage");
          return list.join(', ') || "Aucun";
        };

        const formatSallesList = (sl) => {
          if (!sl) return "Aucune";
          const list = [];
          if (sl.salle15) list.push("Salle 15 pers.");
          if (sl.salle12) list.push("Salle 12 pers.");
          return list.join(', ') || "Aucune";
        };



        const formatChambresDetails = (chambresList, details) => {
          if (!chambresList || chambresList.length === 0) return "Aucune chambre";
          return chambresList.map(chId => {
            const info = details?.[chId] || details?.[String(chId)] || {};
            const adults = info.adultes || 0;
            const kids = info.mineurs || info.enfants || 0;
            return `Chambre ${chId} (${adults} Ad. ${kids > 0 ? `, ${kids} Enf.` : ''})`;
          }).join(', ');
        };

        const getYYYYMMDD = (d) => {
          if (!d) return '';
          try {
            return new Date(d).toISOString().split('T')[0];
          } catch (e) {
            return '';
          }
        };

        const currentDatesStr = `Du ${new Date(current.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(current.dateFin).toLocaleDateString('fr-FR')}`;
        const proposedDatesStr = `Du ${new Date(proposed.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(proposed.dateFin).toLocaleDateString('fr-FR')}`;
        const datesChanged = getYYYYMMDD(current.dateDebut) !== getYYYYMMDD(proposed.dateDebut) || getYYYYMMDD(current.dateFin) !== getYYYYMMDD(proposed.dateFin);

        const optionsChanged = JSON.stringify(current.options) !== JSON.stringify(proposed.options);
        const sallesChanged = JSON.stringify(current.salles) !== JSON.stringify(proposed.salles);
        const repasChanged = JSON.stringify(current.repas) !== JSON.stringify(proposed.repas);
        const chambresChanged = JSON.stringify(current.chambres?.sort()) !== JSON.stringify(proposed.chambres?.sort()) || JSON.stringify(current.chambresDetails) !== JSON.stringify(proposed.chambresDetails);

        // Occupants diff calculations
        const curOccList = current.occupants || [];
        const propOccList = proposed.occupants || [];
        const maxLen = Math.max(curOccList.length, propOccList.length);
        const occupantsDiffs = [];

        for (let i = 0; i < maxLen; i++) {
          const cur = curOccList[i];
          const prop = propOccList[i];
          
          if (cur && !prop) {
            occupantsDiffs.push({
              index: i + 1,
              status: 'removed',
              cur: `${cur.nom} ${cur.prenom} (${cur.estAdulte ? 'Adulte' : `${cur.age} ans`}) - ${cur.nationalite || 'Française'}`,
              prop: '—'
            });
          } else if (!cur && prop) {
            const nationaliteStr = prop.nationalite === true || prop.nationalite === 'Française' ? 'Française' : (prop.nationalite === false || prop.nationalite === 'Étrangère' ? 'Étrangère' : prop.nationalite || 'Française');
            occupantsDiffs.push({
              index: i + 1,
              status: 'added',
              cur: '—',
              prop: `${prop.nom} ${prop.prenom} (${prop.estAdulte ? 'Adulte' : `${prop.age} ans`}) - ${nationaliteStr}`
            });
          } else {
            // Both exist
            const nationaliteCur = cur.nationalite || 'Française';
            const nationaliteProp = prop.nationalite === true || prop.nationalite === 'Française' ? 'Française' : (prop.nationalite === false || prop.nationalite === 'Étrangère' ? 'Étrangère' : prop.nationalite || 'Française');
            
            const curStr = `${cur.nom} ${cur.prenom} (${cur.estAdulte ? 'Adulte' : `${cur.age} ans`}) - ${nationaliteCur}`;
            const propStr = `${prop.nom} ${prop.prenom} (${prop.estAdulte ? 'Adulte' : `${prop.age} ans`}) - ${nationaliteProp}`;
            
            const nameChanged = cur.nom !== prop.nom || cur.prenom !== prop.prenom;
            const typeChanged = cur.estAdulte !== prop.estAdulte || cur.age !== prop.age;
            const natChanged = nationaliteCur !== nationaliteProp;
            
            const changed = nameChanged || typeChanged || natChanged;
            
            occupantsDiffs.push({
              index: i + 1,
              status: changed ? 'changed' : 'unchanged',
              cur: curStr,
              prop: propStr,
              diffDetails: changed ? {
                name: nameChanged,
                type: typeChanged,
                nat: natChanged,
                curName: `${cur.nom} ${cur.prenom}`,
                propName: `${prop.nom} ${prop.prenom}`,
                curType: cur.estAdulte ? 'Adulte' : `${cur.age} ans`,
                propType: prop.estAdulte ? 'Adulte' : `${prop.age} ans`,
                curNat: nationaliteCur,
                propNat: nationaliteProp
              } : null
            });
          }
        }

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
              <div className="bg-purple-700 p-6 text-white shrink-0">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <AlertTriangle size={20} className="text-amber-300" />
                  Validation de la modification proposée par le client
                </h3>
                <p className="text-sm opacity-90">Réservation #{current.id} - Client : {current.client?.nom || 'Inconnu'}</p>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {(() => {
                  const listModifs = [];
                  if (datesChanged) listModifs.push("Dates de séjour");
                  if (chambresChanged) listModifs.push("Chambres & Répartition");
                  if (optionsChanged) listModifs.push("Options & Services");
                  if (sallesChanged) listModifs.push("Salles de réunion");
                  if (repasChanged) listModifs.push("Restauration (Repas)");
                  if (occupantsDiffs.some(d => d.status !== 'unchanged')) listModifs.push("Voyageurs (Noms/Nombre)");

                  if (listModifs.length === 0) return null;

                  return (
                    <div className="bg-purple-50 border-l-4 border-l-purple-600 rounded-r-xl p-4 shadow-sm">
                      <h4 className="text-sm font-black text-purple-900 uppercase tracking-wide flex items-center gap-2">
                        <AlertTriangle className="text-purple-600 shrink-0" size={16} />
                        Récapitulatif des modifications détectées
                      </h4>
                      <p className="text-xs text-purple-800 mt-1.5 font-semibold">
                        Le client demande des modifications sur : <span className="bg-purple-200/80 text-purple-950 px-2 py-0.5 rounded font-black ml-1 inline-block">{listModifs.join(', ')}</span>
                      </p>
                      {priceDifference !== 0 && (
                        <p className="text-xs text-purple-800 mt-2 font-bold">
                          💼 Impact financier : le montant total passera de <span className="line-through text-slate-500">{(current.prixTotal || 0).toFixed(2)} €</span> à <span className="text-purple-950 font-black bg-purple-200/60 px-1.5 py-0.5 rounded">{recalculatedPrice.toFixed(2)} €</span> ({priceDifference > 0 ? `hausse de +${priceDifference.toFixed(2)} €` : `baisse de ${priceDifference.toFixed(2)} €`}).
                        </p>
                      )}
                    </div>
                  );
                })()}

                <table className="block overflow-x-auto w-full text-left border-collapse border border-slate-200 rounded-xl shadow-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 border border-slate-200 w-1/4">Élément</th>
                      <th className="p-4 border border-slate-200 bg-red-50/30 text-red-800 w-3/8">Version Actuelle</th>
                      <th className="p-4 border border-slate-200 bg-green-50/30 text-green-800 w-3/8">Version Proposée</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-semibold text-slate-700">
                    {/* Dates */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Dates du séjour</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {currentDatesStr}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        datesChanged ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {proposedDatesStr}
                        {datesChanged && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Chambres */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Chambres & Répartition</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {formatChambresDetails(current.chambres, current.chambresDetails)}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        chambresChanged ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {formatChambresDetails(proposed.chambres, proposed.chambresDetails)}
                        {chambresChanged && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Options */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Options & Services</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {formatOptionsList(current.options)}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        optionsChanged ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {formatOptionsList(proposed.options)}
                        {optionsChanged && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Salles */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Salles de réunion</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {formatSallesList(current.salles)}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        sallesChanged ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {formatSallesList(proposed.salles)}
                        {sallesChanged && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Repas */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Restauration (Repas)</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {formatMealsCount(current.repas)}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        repasChanged ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {formatMealsCount(proposed.repas)}
                        {repasChanged && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Voyageurs */}
                    <tr className="border-b border-slate-200">
                      <td className="p-4 font-bold border border-slate-200 bg-slate-50/50">Voyageurs (Occupants)</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10">
                        {(() => {
                          const adults = curOccList.filter(o => o.estAdulte).length;
                          const kids = curOccList.filter(o => !o.estAdulte).length;
                          return `${adults} Adulte(s)${kids > 0 ? `, ${kids} Enfant(s)` : ''}`;
                        })()}
                      </td>
                      <td className={`p-4 border border-slate-200 ${
                        occupantsDiffs.some(d => d.status !== 'unchanged') ? 'bg-green-100/50 text-green-900 font-bold border-l-4 border-l-green-500' : ''
                      }`}>
                        {(() => {
                          const adults = propOccList.filter(o => o.estAdulte).length;
                          const kids = propOccList.filter(o => !o.estAdulte).length;
                          return `${adults} Adulte(s)${kids > 0 ? `, ${kids} Enfant(s)` : ''}`;
                        })()}
                        {occupantsDiffs.some(d => d.status !== 'unchanged') && <span className="ml-2 text-[10px] bg-green-200/80 text-green-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Modifié</span>}
                      </td>
                    </tr>

                    {/* Prix total */}
                    <tr className="bg-slate-50 font-black text-sm">
                      <td className="p-4 border border-slate-200">Tarif Total (TTC)</td>
                      <td className="p-4 border border-slate-200 bg-red-50/10 text-red-800">
                        {current.prixTotal?.toFixed(2)} €
                      </td>
                      <td className={`p-4 border border-slate-200 bg-green-50 text-green-950 font-black`}>
                        {recalculatedPrice?.toFixed(2)} € 
                        {priceDifference !== 0 && (
                          <span className={`ml-2 text-xs px-2.5 py-1 rounded-full ${priceDifference > 0 ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-green-100 text-green-900 font-bold'}`}>
                            {priceDifference > 0 ? `+${priceDifference.toFixed(2)} €` : `${priceDifference.toFixed(2)} €`}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Detailed Occupants Diff Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white mt-6">
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <h4 className="font-black text-xs text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Users size={16} className="text-[#004B93]" />
                      Comparatif détaillé des Voyageurs ({curOccList.length} actuels vs {propOccList.length} proposés)
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                          <th className="p-3 w-10 text-center">N°</th>
                          <th className="p-3 w-5/12">Version Actuelle</th>
                          <th className="p-3 w-5/12">Version Proposée</th>
                          <th className="p-3 w-2/12 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-semibold text-slate-700">
                        {occupantsDiffs.map((occ, idx) => (
                          <tr 
                            key={idx} 
                            className={`border-b border-slate-100 transition-all ${
                              occ.status === 'added' ? 'bg-green-50/50 hover:bg-green-50' :
                              occ.status === 'removed' ? 'bg-red-50/30 hover:bg-red-50/50' :
                              occ.status === 'changed' ? 'bg-amber-50/40 hover:bg-amber-50/60' : 'hover:bg-slate-50/40'
                            }`}
                          >
                            <td className="p-3 text-center text-slate-400 font-bold">{occ.index}</td>
                            <td className={`p-3 ${occ.status === 'removed' ? 'text-red-900/60 line-through' : ''}`}>
                              {occ.cur}
                            </td>
                            <td className="p-3">
                              {occ.status === 'changed' && occ.diffDetails ? (
                                <div className="space-y-0.5">
                                  {occ.diffDetails.name ? (
                                    <span>
                                      Nom : <span className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-bold">{occ.diffDetails.propName}</span>
                                      <span className="text-[10px] text-slate-400 font-medium ml-1.5">(ex: {occ.diffDetails.curName})</span>
                                    </span>
                                  ) : (
                                    <span>{occ.diffDetails.propName}</span>
                                  )}
                                  <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 font-medium">
                                    {occ.diffDetails.type ? (
                                      <span>
                                        Type/Âge : <span className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-bold">{occ.diffDetails.propType}</span>
                                        <span className="text-[9px] text-slate-400 font-normal ml-1">(ex: {occ.diffDetails.curType})</span>
                                      </span>
                                    ) : (
                                      <span>Type/Âge : {occ.diffDetails.propType}</span>
                                    )}
                                    {occ.diffDetails.nat && (
                                      <span>
                                        Nat. : <span className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-bold">{occ.diffDetails.propNat}</span>
                                        <span className="text-[9px] text-slate-400 font-normal ml-1">(ex: {occ.diffDetails.curNat})</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : occ.status === 'added' ? (
                                <span className="text-green-900 font-bold">{occ.prop}</span>
                              ) : (
                                <span>{occ.prop}</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {occ.status === 'added' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full border border-green-200">
                                  + Ajouté
                                </span>
                              )}
                              {occ.status === 'removed' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full border border-red-200">
                                  - Supprimé
                                </span>
                              )}
                              {occ.status === 'changed' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                                  ✏ Modifié
                                </span>
                              )}
                              {occ.status === 'unchanged' && (
                                <span className="text-[10px] text-slate-400 font-bold">
                                  Identique
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  onClick={() => {
                    setShowModificationModal(false);
                    setSelectedProposedModification(null);
                  }}
                  disabled={isValidatingProposed}
                  className="px-6 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all text-xs"
                >
                  Fermer
                </button>
                <button
                  onClick={() => handleRejectModification(current.id)}
                  disabled={isValidatingProposed}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wider rounded-xl transition-all text-xs shadow-md"
                >
                  Refuser la modification
                </button>
                <button
                  onClick={() => handleAcceptModification(current.id)}
                  disabled={isValidatingProposed}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wider rounded-xl transition-all text-xs shadow-md"
                >
                  Valider la modification
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Fiches de Police */}
      {showFicheModal && selectedFicheReservation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-muc-blue text-white p-6 flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2">
                📋 Fiches de Police - Réf: {selectedFicheReservation.numeroDevis || `Resa #${selectedFicheReservation.id}`}
              </h3>
              <button 
                onClick={() => {
                  setShowFicheModal(false);
                  setSelectedFicheReservation(null);
                  setActiveFicheOccupant(null);
                }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Occupant Detail/Signing form */}
              {activeFicheOccupant ? (
                <form onSubmit={handleSaveFiche} className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Voyageur en cours d'émargement</h4>
                    <div className="text-sm font-bold text-slate-800">
                      {activeFicheOccupant.nom} {activeFicheOccupant.prenom}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Séjour du {new Date(selectedFicheReservation.dateDebut).toLocaleDateString('fr-FR')} au {new Date(selectedFicheReservation.dateFin).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nom</label>
                      <input 
                        type="text" 
                        value={ficheForm.nom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, nom: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Prénom</label>
                      <input 
                        type="text" 
                        value={ficheForm.prenom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, prenom: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Date de naissance</label>
                      <input 
                        type="date" 
                        value={ficheForm.dateNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, dateNaissance: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Lieu de naissance</label>
                      <input 
                        type="text" 
                        value={ficheForm.lieuNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, lieuNaissance: e.target.value })}
                        placeholder="Ville, Pays"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nationalité</label>
                      <input 
                        type="text" 
                        value={ficheForm.nationalite} 
                        onChange={(e) => setFicheForm({ ...ficheForm, nationalite: e.target.value })}
                        placeholder="Ex: Espagnole"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Téléphone mobile</label>
                      <input 
                        type="tel" 
                        value={ficheForm.telephone} 
                        onChange={(e) => setFicheForm({ ...ficheForm, telephone: e.target.value })}
                        placeholder="+33 6..."
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Adresse e-mail</label>
                      <input 
                        type="email" 
                        value={ficheForm.email} 
                        onChange={(e) => setFicheForm({ ...ficheForm, email: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Domicile habituel</label>
                      <input 
                        type="text" 
                        value={ficheForm.domicile} 
                        onChange={(e) => setFicheForm({ ...ficheForm, domicile: e.target.value })}
                        placeholder="Adresse complète (N°, rue, code postal, ville, pays)"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <SignaturePad onSave={(sig) => setFicheForm(prev => ({ ...prev, signature: sig }))} />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveFicheOccupant(null)}
                      className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingFiche || !ficheForm.signature}
                      className="flex-1 py-3 text-sm font-bold text-white bg-muc-blue hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors flex justify-center items-center gap-2"
                    >
                      {isSavingFiche ? 'Enregistrement...' : 'Enregistrer la fiche'}
                    </button>
                  </div>
                </form>
              ) : (
                /* Occupants List */
                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-600">
                    Sélectionnez un occupant pour remplir sa fiche de police et la faire signer :
                  </div>

                  <div className="space-y-3">
                    {/* Map existing reservation occupants */}
                    {((selectedFicheReservation.occupants || []).length > 0 ? selectedFicheReservation.occupants : [
                      { id: 'client-dummy', nom: selectedFicheReservation.client?.nom?.split(' ')[0] || 'Client', prenom: selectedFicheReservation.client?.nom?.split(' ')[1] || 'Réservataire', estAdulte: true }
                    ]).map((occ) => {
                      const existingFiche = (selectedFicheReservation.fichesPolice || []).find(
                        f => f.occupantId === occ.id || (occ.id === 'client-dummy' && f.occupantId === null)
                      );

                      return (
                        <div 
                          key={occ.id} 
                          className="border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              <span>{occ.nom} {occ.prenom}</span>
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase">
                                {occ.estAdulte ? 'Adulte' : 'Enfant'}
                              </span>
                              {occ.nationalite && (
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                  {occ.nationalite}
                                </span>
                              )}
                            </div>
                            {existingFiche ? (
                              <div className="text-xs text-emerald-655 font-bold flex items-center gap-1 mt-1">
                                <CheckCircle size={14} className="text-emerald-500" /> Fiche signée le {new Date(existingFiche.signedAt).toLocaleDateString('fr-FR')}
                              </div>
                            ) : (
                              <div className="text-xs text-amber-655 font-semibold flex items-center gap-1 mt-1">
                                <Clock size={14} className="text-amber-500" /> En attente de signature
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {existingFiche ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => printFichePolice(selectedFicheReservation, existingFiche)}
                                  className="px-3 py-1.5 bg-blue-50 text-muc-blue hover:bg-muc-blue hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                >
                                  <FileText size={14} /> Imprimer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFicheForm({
                                      nom: existingFiche.nom,
                                      prenom: existingFiche.prenom,
                                      dateNaissance: existingFiche.dateNaissance,
                                      lieuNaissance: existingFiche.lieuNaissance,
                                      nationalite: existingFiche.nationalite,
                                      domicile: existingFiche.domicile,
                                      telephone: existingFiche.telephone || '',
                                      email: existingFiche.email || '',
                                      dateArrivee: existingFiche.dateArrivee ? existingFiche.dateArrivee.split('T')[0] : selectedFicheReservation.dateDebut.split('T')[0],
                                      dateDepart: existingFiche.dateDepart ? existingFiche.dateDepart.split('T')[0] : selectedFicheReservation.dateFin.split('T')[0],
                                      signature: existingFiche.signature
                                    });
                                    setActiveFicheOccupant(occ);
                                  }}
                                  className="px-3 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-xs font-bold transition-all"
                                >
                                  Modifier
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setFicheForm({
                                    nom: occ.nom || '',
                                    prenom: occ.prenom || '',
                                    dateNaissance: '',
                                    lieuNaissance: '',
                                    nationalite: occ.nationalite || '',
                                    domicile: selectedFicheReservation.client?.adressePostale || '',
                                    telephone: selectedFicheReservation.client?.telephone || '',
                                    email: selectedFicheReservation.client?.email || '',
                                    dateArrivee: selectedFicheReservation.dateDebut.split('T')[0],
                                    dateDepart: selectedFicheReservation.dateFin.split('T')[0],
                                    signature: null
                                  });
                                  setActiveFicheOccupant(occ);
                                }}
                                className="px-3 py-1.5 bg-muc-blue text-white hover:bg-blue-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Check size={14} /> Émarger / Signer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => {
                        const newId = `extra-${Date.now()}`;
                        setFicheForm({
                          nom: '',
                          prenom: '',
                          dateNaissance: '',
                          lieuNaissance: '',
                          nationalite: '',
                          domicile: selectedFicheReservation.client?.adressePostale || '',
                          telephone: '',
                          email: '',
                          dateArrivee: selectedFicheReservation.dateDebut.split('T')[0],
                          dateDepart: selectedFicheReservation.dateFin.split('T')[0],
                          signature: null
                        });
                        setActiveFicheOccupant({ id: newId, nom: 'Nouveau', prenom: 'Voyageur', estAdulte: true });
                      }}
                      className="px-4 py-2 text-xs font-bold text-muc-blue border border-dashed border-muc-blue hover:bg-blue-50 rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <PlusCircle size={14} /> Ajouter un voyageur non listé
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-black text-muc-blue uppercase tracking-tight">Planning Équipe & Missions</h2>
                <p className="text-xs text-slate-500 mt-1">Consultez en temps réel les réservations, disponibilités et missions assignées aux intervenants.</p>
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
                    noEventsInRange: "Aucun événement dans cette période",
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
                      fontSize: '0.82rem',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
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
                  onSelectEvent={(event) => setSelectedPlanningEvent(event)}
                />
              </div>
            )}
          </div>

          {/* Modal Détails Événement */}
          {selectedPlanningEvent && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-muc-blue text-white p-6 flex justify-between items-center">
                  <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2">
                    {selectedPlanningEvent.type === 'reservation' && '🗓️ Détails Réservation'}
                    {selectedPlanningEvent.type === 'mission' && '📌 Détails Mission'}
                    {selectedPlanningEvent.type === 'dispo' && '✅ Disponibilité'}
                  </h3>
                  <button 
                    onClick={() => setSelectedPlanningEvent(null)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Titre</h4>
                    <p className="text-sm font-bold text-slate-800 mt-1">{selectedPlanningEvent.title}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Début</h4>
                      <p className="text-sm font-medium text-slate-800 mt-1">
                        {new Date(selectedPlanningEvent.start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Fin</h4>
                      <p className="text-sm font-medium text-slate-800 mt-1">
                        {new Date(selectedPlanningEvent.end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {selectedPlanningEvent.type === 'mission' && selectedPlanningEvent.mission && (
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Intervenant</h4>
                        <p className="text-sm font-bold text-slate-800 mt-1">
                          {selectedPlanningEvent.mission.intervenantName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedPlanningEvent.mission.intervenantEmail} {selectedPlanningEvent.mission.intervenantPhone ? `• ${selectedPlanningEvent.mission.intervenantPhone}` : ''}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Rémunération</h4>
                          <p className="text-sm font-black text-muc-blue mt-1">
                            {selectedPlanningEvent.mission.montant.toFixed(2)} €
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Statut Mission</h4>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black uppercase mt-1 ${
                            selectedPlanningEvent.mission.statut === 'ACCEPTEE' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : selectedPlanningEvent.mission.statut === 'REFUSEE' 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-amber-100 text-amber-800 animate-pulse'
                          }`}>
                            {selectedPlanningEvent.mission.statut === 'ACCEPTEE' ? 'Validé (Accepté)' : selectedPlanningEvent.mission.statut === 'REFUSEE' ? 'Refusé' : 'En attente'}
                          </span>
                        </div>
                      </div>

                      {selectedPlanningEvent.reservation && (
                        <div className="border-t border-slate-100 pt-3">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Client & Séjour lié</h4>
                          <p className="text-xs font-bold text-slate-700 mt-1">
                            Client : {selectedPlanningEvent.reservation.clientNom}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ID Réservation : #{selectedPlanningEvent.reservation.id} ({selectedPlanningEvent.reservation.statut === 'RESERVE' ? 'Confirmée' : 'Option'})
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPlanningEvent.type === 'reservation' && (
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Client</h4>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedPlanningEvent.clientNom}</p>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Statut Réservation</h4>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black uppercase mt-1 ${
                            selectedPlanningEvent.statut === 'RESERVE' ? 'bg-indigo-100 text-indigo-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {selectedPlanningEvent.statut === 'RESERVE' ? 'Confirmée' : 'Option / En attente'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Responsable principal</h4>
                        <p className="text-xs text-slate-700 font-semibold mt-1">{selectedPlanningEvent.intervenantName}</p>
                      </div>
                    </div>
                  )}

                  {selectedPlanningEvent.type === 'dispo' && (
                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Intervenant Disponible</h4>
                      <p className="text-sm font-bold text-slate-800 mt-1">{selectedPlanningEvent.intervenantName}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                  <button 
                    onClick={() => setSelectedPlanningEvent(null)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors text-sm"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
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

              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-sm font-black text-muc-blue uppercase tracking-wider mb-2">Préférences de notification</h3>
                <p className="text-xs text-slate-500 mb-4">Sélectionnez les e-mails d'alerte que vous souhaitez recevoir :</p>
                
                <div className="space-y-3">
                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifNewReservation"
                      type="checkbox" 
                      checked={!!profileForm.notifNewReservation} 
                      onChange={e => setProfileForm({...profileForm, notifNewReservation: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="notifNewReservation" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Demandes de réservation</span>
                      <span className="text-xs text-slate-500">Alertes lors d'une nouvelle demande de réservation client.</span>
                    </label>
                  </div>
                  
                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifNewDevis"
                      type="checkbox" 
                      checked={!!profileForm.notifNewDevis} 
                      onChange={e => setProfileForm({...profileForm, notifNewDevis: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="notifNewDevis" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Nouveaux devis émis</span>
                      <span className="text-xs text-slate-500">Notification lorsqu'un devis est émis pour un séjour.</span>
                    </label>
                  </div>

                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifDevisValidation"
                      type="checkbox" 
                      checked={!!profileForm.notifDevisValidation} 
                      onChange={e => setProfileForm({...profileForm, notifDevisValidation: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="notifDevisValidation" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Confirmations de devis</span>
                      <span className="text-xs text-slate-500">Lorsqu'un client accepte un devis (par carte ou par virement).</span>
                    </label>
                  </div>

                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifPaymentReceived"
                      type="checkbox" 
                      checked={!!profileForm.notifPaymentReceived} 
                      onChange={e => setProfileForm({...profileForm, notifPaymentReceived: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300"
                    />
                    <label htmlFor="notifPaymentReceived" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Paiements reçus</span>
                      <span className="text-xs text-slate-500">Alertes lors d'un paiement effectué ou d'une intention de virement déclarée.</span>
                    </label>
                  </div>

                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifModificationRequest"
                      type="checkbox" 
                      checked={!!profileForm.notifModificationRequest} 
                      onChange={e => setProfileForm({...profileForm, notifModificationRequest: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="notifModificationRequest" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Demandes de modification</span>
                      <span className="text-xs text-slate-500">Lorsqu'un client soumet une demande de modification de séjour.</span>
                    </label>
                  </div>

                  <div className="flex items-start p-3 bg-slate-50 hover:bg-slate-100/75 rounded-xl transition-all border border-slate-100">
                    <input 
                      id="notifIntervenantMissions"
                      type="checkbox" 
                      checked={!!profileForm.notifIntervenantMissions} 
                      onChange={e => setProfileForm({...profileForm, notifIntervenantMissions: e.target.checked})} 
                      className="mt-1 mr-3 rounded text-muc-blue focus:ring-muc-blue focus:ring-opacity-20 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="notifIntervenantMissions" className="cursor-pointer select-none flex-1">
                      <span className="text-sm font-semibold text-slate-800 block">Missions des intervenants</span>
                      <span className="text-xs text-slate-500">Lorsqu'un intervenant accepte ou refuse ses missions assignées.</span>
                    </label>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={isSavingProfile} className={`w-full py-4 bg-muc-blue text-white font-black uppercase tracking-widest rounded-xl hover:bg-muc-blue/90 shadow-lg transition-all ${isSavingProfile ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSavingProfile ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 mt-6">
            <h3 className="text-lg font-black text-muc-blue uppercase tracking-tight mb-4 pb-4 border-b border-slate-100 flex items-center gap-2">
              <span>📅</span> Synchronisation Agenda (Outlook, Google, Mac...)
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Vous pouvez afficher en temps réel toutes les réservations validées du gîte directement sur votre agenda personnel (Outlook, Google Agenda ou Apple Calendrier) en vous abonnant à ce flux.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">Lien d'abonnement iCal :</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={`${API_URL}/api/calendar/ical/MUC_MALADRERIE_SYNC`}
                  className="flex-1 bg-white p-2.5 border border-slate-200 rounded-lg text-xs font-mono select-all outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${API_URL}/api/calendar/ical/MUC_MALADRERIE_SYNC`);
                    alert("Lien d'abonnement copié !");
                  }}
                  className="bg-muc-blue text-white px-4 py-2 text-xs font-bold rounded-lg hover:bg-blue-800 transition-all shadow-sm"
                >
                  Copier
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-700 mb-1">Comment l'ajouter dans Outlook ?</p>
                <ol className="text-[11px] text-slate-500 list-decimal list-inside space-y-1">
                  <li>Copiez le lien ci-dessus.</li>
                  <li>Dans Outlook, ouvrez votre calendrier et cliquez sur <strong>Ajouter un calendrier</strong>.</li>
                  <li>Sélectionnez <strong>S'abonner à partir du web</strong>.</li>
                  <li>Collez le lien et donnez-lui un nom (ex: "Gîte La Maladrerie").</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-100 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-muc-blue uppercase tracking-tight mb-4">
              {editingExpense ? 'Modifier la dépense' : 'Saisir une dépense'}
            </h3>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">Date *</label>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-muc-blue font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">Libellé *</label>
                <input
                  type="text"
                  value={expenseForm.label}
                  onChange={e => setExpenseForm({ ...expenseForm, label: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-muc-blue font-medium"
                  placeholder="ex: Achats produits d'entretien"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">Montant TTC (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseForm.montant}
                    onChange={e => setExpenseForm({ ...expenseForm, montant: e.target.value })}
                    className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-muc-blue font-bold"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-500 mb-1">Code PCG & Catégorie *</label>
                  <select
                    value={expenseForm.comptePcg}
                    onChange={(e) => {
                      const code = e.target.value;
                      const cat = PCG_CATEGORIES.find(c => c.code === code);
                      if (cat) {
                        setExpenseForm({ ...expenseForm, comptePcg: code, categorie: cat.name });
                      }
                    }}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-white outline-none focus:border-muc-blue font-bold text-xs"
                    required
                  >
                    {PCG_CATEGORIES.map(cat => (
                      <option key={cat.code} value={cat.code}>
                        {cat.code} - {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1">Description / Notes</label>
                <textarea
                  value={expenseForm.description || ''}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-muc-blue font-medium h-20 resize-none"
                  placeholder="Description détaillée de la dépense..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExpenseModal(false);
                    setEditingExpense(null);
                  }}
                  className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 text-sm font-bold text-white bg-muc-blue hover:bg-blue-800 rounded-xl transition-all shadow-md"
                >
                  Enregistrer
                </button>
              </div>
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
    
      {showFinanceModal && (() => {
        let totalUnitesLouees = 0;
        let totalNuiteesAssujetties = 0;
        let totalNuiteesExonerees = 0;

        if (financeModalData && financeModalData.code === "447") {
          totalUnitesLouees = financeModalData.items.length;
          financeModalData.items.forEach(item => {
            totalNuiteesAssujetties += (item.nbAdultes || 0) * (item.nuits || 0);
            totalNuiteesExonerees += (item.nbMineurs || 0) * (item.nuits || 0);
          });
        }

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-4xl shadow-2xl transform transition-all relative max-h-[90vh] flex flex-col">
              <button onClick={() => setShowFinanceModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-red-500 hover:rotate-90 transition-all p-2 bg-slate-100 hover:bg-red-50 rounded-full">
                <X size={24} />
              </button>
              <div className="mb-6">
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-md text-xs font-black tracking-widest uppercase mr-3">Compte {financeModalData.code}</span>
                  <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter inline-block">{financeModalData.title}</h3>
                  <p className="text-xl font-bold text-muc-blue mt-2">Total : {financeModalData.total.toFixed(2)} €</p>
              </div>

              {financeModalData.code === "447" && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 mb-6">
                    <div className="flex justify-between items-center mb-4 border-b border-amber-200 pb-3 flex-wrap gap-2">
                        <span className="text-amber-900 font-bold text-sm flex items-center gap-1.5">
                            🏛️ Informations pour la Déclaration Extranet
                        </span>
                        <a 
                            href="https://taxe.3douest.com/extranet/accueil.php" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all shadow-md inline-block"
                        >
                            Accéder au site de déclaration
                        </a>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-3 border border-amber-200 rounded-xl flex flex-col items-center justify-between text-center relative group">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight">
                                (2) Unités d'accueil louées
                            </span>
                            <span className="text-3xl font-black text-slate-800 my-1.5">{totalUnitesLouees}</span>
                            <span className="text-[10px] text-slate-400 font-medium italic">
                                Nbr de réservations
                            </span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(totalUnitesLouees.toString()); alert("Copié !"); }}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 text-slate-600 hover:bg-muc-blue hover:text-white p-1 rounded text-[9px] font-bold"
                            >
                                Copier
                            </button>
                        </div>

                        <div className="bg-white p-3 border border-amber-200 rounded-xl flex flex-col items-center justify-between text-center relative group">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight">
                                (3) Nuitées Assujetties
                            </span>
                            <span className="text-3xl font-black text-slate-800 my-1.5">{totalNuiteesAssujetties}</span>
                            <span className="text-[10px] text-slate-400 font-medium italic">
                                Adultes x nuits
                            </span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(totalNuiteesAssujetties.toString()); alert("Copié !"); }}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 text-slate-600 hover:bg-muc-blue hover:text-white p-1 rounded text-[9px] font-bold"
                            >
                                Copier
                            </button>
                        </div>

                        <div className="bg-white p-3 border border-amber-200 rounded-xl flex flex-col items-center justify-between text-center relative group">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight">
                                (4) Nuitées Exonérées
                            </span>
                            <span className="text-3xl font-black text-slate-800 my-1.5">{totalNuiteesExonerees}</span>
                            <span className="text-[10px] text-slate-400 font-medium italic">
                                Mineurs x nuits
                            </span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(totalNuiteesExonerees.toString()); alert("Copié !"); }}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 text-slate-600 hover:bg-muc-blue hover:text-white p-1 rounded text-[9px] font-bold"
                            >
                                Copier
                            </button>
                        </div>

                        <div className="bg-amber-100/50 p-3 border border-amber-300 rounded-xl flex flex-col items-center justify-between text-center relative group">
                            <span className="text-[10px] text-amber-950 font-black uppercase tracking-widest leading-tight">
                                (5) Montant Collecté
                            </span>
                            <span className="text-3xl font-black text-amber-800 my-1.5">{financeModalData.total.toFixed(2)} €</span>
                            <span className="text-[10px] text-amber-600 font-medium italic">
                                Montant total à déclarer
                            </span>
                            <button 
                                onClick={() => { navigator.clipboard.writeText(financeModalData.total.toFixed(2)); alert("Copié !"); }}
                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-amber-200 text-amber-900 hover:bg-amber-600 hover:text-white p-1 rounded text-[9px] font-bold"
                            >
                                Copier
                            </button>
                        </div>
                    </div>
                </div>
              )}
              
              <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                      <thead className="sticky top-0 bg-white shadow-sm z-10">
                          <tr className="border-b-2 border-slate-200">
                              <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs">Date</th>
                              <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs">Libellé</th>
                              {financeModalData.code === "447" && (
                                <>
                                  <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs text-center">Nuits</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs text-center">Adultes (3)</th>
                                  <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs text-center">Enfants (4)</th>
                                </>
                              )}
                              <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs">Statut / Type</th>
                              <th className="p-3 font-bold text-slate-500 uppercase tracking-widest text-xs text-right">Montant</th>
                          </tr>
                      </thead>
                      <tbody>
                          {financeModalData.items.length > 0 ? financeModalData.items.map((item, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                  <td className="p-3 text-slate-600">{new Date(item.date).toLocaleDateString('fr-FR')}</td>
                                  <td className="p-3 font-medium text-slate-800">{item.label}</td>
                                  {financeModalData.code === "447" && (
                                    <>
                                      <td className="p-3 text-center text-slate-700 font-bold">{item.nuits}</td>
                                      <td className="p-3 text-center text-slate-700 font-bold">{item.nbAdultes}</td>
                                      <td className="p-3 text-center text-slate-700 font-bold">{item.nbMineurs}</td>
                                    </>
                                  )}
                                  <td className="p-3 text-xs text-slate-500">
                                      <span className="bg-slate-100 px-2 py-1 rounded-full">{item.statut || '-'}</span>
                                  </td>
                                  <td className="p-3 font-bold text-right text-slate-800">{item.montant.toFixed(2)} €</td>
                              </tr>
                          )) : (
                              <tr>
                                  <td colSpan={financeModalData.code === "447" ? "7" : "4"} className="p-8 text-center text-slate-400 italic">Aucune transaction trouvée.</td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Fiches de Police */}
      {showFicheModal && selectedFicheReservation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-muc-blue text-white p-6 flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2">
                📋 Fiches de Police - Réf: {selectedFicheReservation.numeroDevis || `Resa #${selectedFicheReservation.id}`}
              </h3>
              <button 
                onClick={() => {
                  setShowFicheModal(false);
                  setSelectedFicheReservation(null);
                  setActiveFicheOccupant(null);
                }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Occupant Detail/Signing form */}
              {activeFicheOccupant ? (
                <form onSubmit={handleSaveFiche} className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Voyageur en cours d'émargement</h4>
                    <div className="text-sm font-bold text-slate-800">
                      {activeFicheOccupant.nom} {activeFicheOccupant.prenom}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Séjour du {new Date(selectedFicheReservation.dateDebut).toLocaleDateString('fr-FR')} au {new Date(selectedFicheReservation.dateFin).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nom</label>
                      <input 
                        type="text" 
                        value={ficheForm.nom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, nom: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Prénom</label>
                      <input 
                        type="text" 
                        value={ficheForm.prenom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, prenom: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Date de naissance</label>
                      <input 
                        type="date" 
                        value={ficheForm.dateNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, dateNaissance: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Lieu de naissance</label>
                      <input 
                        type="text" 
                        value={ficheForm.lieuNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, lieuNaissance: e.target.value })}
                        placeholder="Ville, Pays"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nationalité</label>
                      <input 
                        type="text" 
                        value={ficheForm.nationalite} 
                        onChange={(e) => setFicheForm({ ...ficheForm, nationalite: e.target.value })}
                        placeholder="Ex: Espagnole"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Téléphone mobile</label>
                      <input 
                        type="tel" 
                        value={ficheForm.telephone} 
                        onChange={(e) => setFicheForm({ ...ficheForm, telephone: e.target.value })}
                        placeholder="+33 6..."
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Adresse e-mail</label>
                      <input 
                        type="email" 
                        value={ficheForm.email} 
                        onChange={(e) => setFicheForm({ ...ficheForm, email: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Domicile habituel</label>
                      <input 
                        type="text" 
                        value={ficheForm.domicile} 
                        onChange={(e) => setFicheForm({ ...ficheForm, domicile: e.target.value })}
                        placeholder="Adresse complète (N°, rue, code postal, ville, pays)"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:border-muc-blue focus:ring-1 focus:ring-muc-blue outline-none text-sm font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <SignaturePad onSave={(sig) => setFicheForm(prev => ({ ...prev, signature: sig }))} />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveFicheOccupant(null)}
                      className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingFiche || !ficheForm.signature}
                      className="flex-1 py-3 text-sm font-bold text-white bg-muc-blue hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors flex justify-center items-center gap-2"
                    >
                      {isSavingFiche ? 'Enregistrement...' : 'Enregistrer la fiche'}
                    </button>
                  </div>
                </form>
              ) : (
                /* Occupants List */
                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-600">
                    Sélectionnez un occupant pour remplir sa fiche de police et la faire signer :
                  </div>

                  <div className="space-y-3">
                    {/* Map existing reservation occupants */}
                    {((selectedFicheReservation.occupants || []).length > 0 ? selectedFicheReservation.occupants : [
                      { id: 'client-dummy', nom: selectedFicheReservation.client?.nom?.split(' ')[0] || 'Client', prenom: selectedFicheReservation.client?.nom?.split(' ')[1] || 'Réservataire', estAdulte: true }
                    ]).map((occ) => {
                      const existingFiche = (selectedFicheReservation.fichesPolice || []).find(
                        f => f.occupantId === occ.id || (occ.id === 'client-dummy' && f.occupantId === null)
                      );

                      return (
                        <div 
                          key={occ.id} 
                          className="border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 hover:bg-slate-100/50 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              <span>{occ.nom} {occ.prenom}</span>
                              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase">
                                {occ.estAdulte ? 'Adulte' : 'Enfant'}
                              </span>
                              {occ.nationalite && (
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                                  {occ.nationalite}
                                </span>
                              )}
                            </div>
                            {existingFiche ? (
                              <div className="text-xs text-emerald-655 font-bold flex items-center gap-1 mt-1">
                                <CheckCircle size={14} className="text-emerald-500" /> Fiche signée le {new Date(existingFiche.signedAt).toLocaleDateString('fr-FR')}
                              </div>
                            ) : (
                              <div className="text-xs text-amber-655 font-semibold flex items-center gap-1 mt-1">
                                <Clock size={14} className="text-amber-500" /> En attente de signature
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {existingFiche ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => printFichePolice(selectedFicheReservation, existingFiche)}
                                  className="px-3 py-1.5 bg-blue-50 text-muc-blue hover:bg-muc-blue hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                >
                                  <FileText size={14} /> Imprimer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFicheForm({
                                      nom: existingFiche.nom,
                                      prenom: existingFiche.prenom,
                                      dateNaissance: existingFiche.dateNaissance,
                                      lieuNaissance: existingFiche.lieuNaissance,
                                      nationalite: existingFiche.nationalite,
                                      domicile: existingFiche.domicile,
                                      telephone: existingFiche.telephone || '',
                                      email: existingFiche.email || '',
                                      dateArrivee: existingFiche.dateArrivee ? existingFiche.dateArrivee.split('T')[0] : selectedFicheReservation.dateDebut.split('T')[0],
                                      dateDepart: existingFiche.dateDepart ? existingFiche.dateDepart.split('T')[0] : selectedFicheReservation.dateFin.split('T')[0],
                                      signature: existingFiche.signature
                                    });
                                    setActiveFicheOccupant(occ);
                                  }}
                                  className="px-3 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-xs font-bold transition-all"
                                >
                                  Modifier
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setFicheForm({
                                    nom: occ.nom || '',
                                    prenom: occ.prenom || '',
                                    dateNaissance: '',
                                    lieuNaissance: '',
                                    nationalite: occ.nationalite || '',
                                    domicile: selectedFicheReservation.client?.adressePostale || '',
                                    telephone: selectedFicheReservation.client?.telephone || '',
                                    email: selectedFicheReservation.client?.email || '',
                                    dateArrivee: selectedFicheReservation.dateDebut.split('T')[0],
                                    dateDepart: selectedFicheReservation.dateFin.split('T')[0],
                                    signature: null
                                  });
                                  setActiveFicheOccupant(occ);
                                }}
                                className="px-3 py-1.5 bg-muc-blue text-white hover:bg-blue-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                              >
                                <Check size={14} /> Émarger / Signer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => {
                        const newId = `extra-${Date.now()}`;
                        setFicheForm({
                          nom: '',
                          prenom: '',
                          dateNaissance: '',
                          lieuNaissance: '',
                          nationalite: '',
                          domicile: selectedFicheReservation.client?.adressePostale || '',
                          telephone: '',
                          email: '',
                          dateArrivee: selectedFicheReservation.dateDebut.split('T')[0],
                          dateDepart: selectedFicheReservation.dateFin.split('T')[0],
                          signature: null
                        });
                        setActiveFicheOccupant({ id: newId, nom: 'Nouveau', prenom: 'Voyageur', estAdulte: true });
                      }}
                      className="px-4 py-2 text-xs font-bold text-muc-blue border border-dashed border-muc-blue hover:bg-blue-50 rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <PlusCircle size={14} /> Ajouter un voyageur non listé
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
</div>
  );
};

export default Admin;
