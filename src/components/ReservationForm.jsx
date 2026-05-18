import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, X, CheckCircle, AlertTriangle, Phone } from 'lucide-react';
import { API_URL } from '../config';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 8, etage: '2e étage' },
  5: { num: 5, name: 'Chambre standard', lits: 6, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const ReservationForm = ({ events = [], isAdmin = false, isDevis = false, onCreated = () => {}, adminUser = null }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    email: '',
    telephone: '',
    adressePostale: '',
    dateDebut: '',
    dateFin: '',
    chambres: [],
    chambresDetails: {},
    options: {
      litsFaits: false,
      lingeFourni: false,
      menage: false
    },
    occupants: []
  });

  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', message: '' });

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [devisWarningRooms, setDevisWarningRooms] = useState([]);

  useEffect(() => {
    if (formData.dateDebut && formData.dateFin && events.length > 0) {
      const start = new Date(formData.dateDebut);
      const end = new Date(formData.dateFin);
      
      const overlappingDevis = events.filter(e => {
        // Assume events mapped from backend include 'statut'
        if (e.statut !== 'DEVIS_EN_ATTENTE') return false;
        const eStart = new Date(e.start);
        const eEnd = new Date(e.end);
        return (start < eEnd && end > eStart);
      });

      const rooms = [...new Set(overlappingDevis.flatMap(e => e.chambres || []))];
      // Filter only rooms currently selected
      const selectedOverlappingRooms = rooms.filter(r => formData.chambres.includes(r));
      setDevisWarningRooms(selectedOverlappingRooms);
    } else {
      setDevisWarningRooms([]);
    }
  }, [formData.dateDebut, formData.dateFin, events, formData.chambres]);

  const [unavailableRooms, setUnavailableRooms] = useState([]);

  // Check availability when dates change
  useEffect(() => {
    if (formData.dateDebut && formData.dateFin) {
      const start = new Date(formData.dateDebut);
      const end = new Date(formData.dateFin);
      
      const unavailable = new Set();

      events.forEach(event => {
        const evStart = new Date(event.start);
        const evEnd = new Date(event.end);

        // Check for date overlap
        if (start < evEnd && end > evStart) {
           if (event.chambres && Array.isArray(event.chambres)) {
             event.chambres.forEach(ch => unavailable.add(ch));
           }
        }
      });

      setUnavailableRooms(Array.from(unavailable));

      // Remove selected rooms that became unavailable
      setFormData(prev => {
        const validChambres = prev.chambres.filter(ch => !unavailable.has(ch));
        if (validChambres.length === prev.chambres.length) return prev; // no change

        const newDetails = { ...prev.chambresDetails };
        prev.chambres.forEach(ch => {
          if (unavailable.has(ch)) {
            delete newDetails[ch];
          }
        });

        return { ...prev, chambres: validChambres, chambresDetails: newDetails };
      });
    } else {
      setUnavailableRooms([]);
    }
  }, [formData.dateDebut, formData.dateFin, events]);

  const calculerPrix = () => {
    if (!formData.dateDebut || !formData.dateFin) return 0;
    const start = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (nuits <= 0) return 0;

    let total = 0;
    let totalAdultes = 0;
    let totalMineurs = 0;

    formData.chambres.forEach(chId => {
      const details = formData.chambresDetails[chId] || { adultes: 0, mineurs: 0 };
      const info = CHAMBRES_INFO[chId];
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.mineurs || 0);
      const occupants = nbAdultes + nbMineurs;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;

      const tarifPers = occupants >= info.lits ? 22 : 25;
      total += occupants * tarifPers * nuits;
      
      // Taxe de séjour : 4% du prix de la nuitée par adulte (+18 ans)
      // Note: Adultes dans chambresDetails sont ≥13 ans pour le tarif, 
      // mais ici on applique 4% sur le prix de la nuitée par adulte.
      total += nbAdultes * tarifPers * nuits * 0.04;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    if (formData.options.litsFaits) total += totalPersonnes * 5;
    if (formData.options.lingeFourni) total += totalPersonnes * 5;
    if (formData.options.menage) total += formData.chambres.length * 50;

    // Appliquer Promo
    if (promoApplied) {
      if (promoApplied.type === 'pourcentage') {
        total = total * (1 - promoApplied.valeur / 100);
      } else {
        total = Math.max(0, total - promoApplied.valeur);
      }
    }

    return total;
  };

  const handleApplyPromo = async () => {
    if (!promoCode) return;
    setValidatingPromo(true);
    setPromoError('');
    try {
      const res = await fetch(`${API_URL}/api/promo-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode,
          date: formData.dateDebut
        })
      });const data = await res.json();
      if (res.ok) {
        setPromoApplied(data);
      } else {
        setPromoError(data.error || 'Code invalide');
      }
    } catch (err) {
      setPromoError('Erreur de validation');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox' && name === 'chambres') {
      const chambreId = parseInt(value);
      setFormData(prev => {
        const newChambres = checked 
          ? [...prev.chambres, chambreId]
          : prev.chambres.filter(id => id !== chambreId);
        
        const newDetails = { ...prev.chambresDetails };
        if (!checked) delete newDetails[chambreId];
        else newDetails[chambreId] = { adultes: 0, mineurs: 0 };

        return { ...prev, chambres: newChambres, chambresDetails: newDetails };
      });
    } else if (type === 'checkbox' && name.startsWith('opt_')) {
      const optName = name.replace('opt_', '');
      setFormData(prev => ({
        ...prev,
        options: { ...prev.options, [optName]: checked }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleRoomDetailsChange = (chambreId, field, value) => {
    setFormData(prev => ({
      ...prev,
      chambresDetails: {
        ...prev.chambresDetails,
        [chambreId]: {
          ...prev.chambresDetails[chambreId],
          [field]: parseInt(value) || 0
        }
      }
    }));
  };

  const handleOccupantChange = (index, field, value) => {
    setFormData(prev => {
      const newOccupants = [...prev.occupants];
      newOccupants[index] = { ...newOccupants[index], [field]: value };
      return { ...prev, occupants: newOccupants };
    });
  };

  const goToStep2 = (e) => {
    e.preventDefault();
    if (!formData.dateDebut || !formData.dateFin) {
      alert("Veuillez sélectionner des dates.");
      return;
    }
    const start = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    if (start >= end) {
      alert("La date de départ doit être après la date d'arrivée.");
      return;
    }
    
    if(formData.chambres.length === 0) {
      alert("Veuillez sélectionner au moins une chambre.");
      return;
    }
    
    let totalExpectedOccupants = 0;
    for (let chId of formData.chambres) {
      const details = formData.chambresDetails[chId];
      const occupantsCount = (details?.adultes || 0) + (details?.mineurs || 0);
      const capacite = CHAMBRES_INFO[chId].lits;
      if (occupantsCount === 0) {
        alert(`Veuillez indiquer le nombre d'occupants pour la chambre ${chId}.`);
        return;
      }
      if (occupantsCount > capacite) {
        alert(`La capacité de la chambre ${chId} est dépassée (${occupantsCount} occupants pour ${capacite} lits).`);
        return;
      }
      totalExpectedOccupants += occupantsCount;
    }

    // Générer automatiquement les occupants en fonction des adultes/enfants renseignés
    const newOccupants = [];
    for (const chId of formData.chambres) {
      const details = formData.chambresDetails[chId];
      const nbAdultes = parseInt(details?.adultes || 0);
      const nbMineurs = parseInt(details?.mineurs || 0);
      
      // Ajouter les adultes
      for (let i = 0; i < nbAdultes; i++) {
        newOccupants.push({ nom: '', prenom: '', estAdulte: true, age: '' });
      }
      // Ajouter les mineurs
      for (let i = 0; i < nbMineurs; i++) {
        newOccupants.push({ nom: '', prenom: '', estAdulte: false, age: '' });
      }
    }
    
    setFormData(prev => ({ ...prev, occupants: newOccupants }));
    setStep(2);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    for (let occ of formData.occupants) {
      if (!occ.nom || !occ.prenom) {
        setErrorMsg("Veuillez remplir les noms et prénoms de tous les occupants.");
        return;
      }
      if (!occ.estAdulte && (!occ.age || occ.age < 0 || occ.age > 18)) {
        setErrorMsg("Veuillez indiquer un âge valide pour les mineurs.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        prixTotal: calculerPrix(),
        promoCode: promoApplied?.code,
        adminEmail: adminUser?.email,
        adminName: adminUser?.nom
      };
      
      const url = isDevis
        ? `${API_URL}/api/admin/devis`
        : isAdmin 
          ? `${API_URL}/api/admin/reservations`
          : `${API_URL}/api/reservations`;

      const headers = { 'Content-Type': 'application/json' };
      if (isAdmin || isDevis) {
        const token = localStorage.getItem('adminToken');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        const roomNames = formData.chambres.map(id => CHAMBRES_INFO[id]?.name || `Chambre ${id}`).join(', ');
        let message = isDevis
          ? `Le devis pour ${roomNames} a été généré et envoyé à ${formData.email}. Il est valable pendant 48 heures.`
          : isAdmin 
            ? 'La réservation a bien été enregistrée.' 
            : 'Demande de réservation envoyée avec succès. Vous recevrez une confirmation prochainement.';
        
        setModalConfig({
          type: data.isLastMinute ? 'warning' : 'success',
          title: data.isLastMinute ? 'Action Requise !' : (isDevis ? 'Devis Envoyé' : (isAdmin ? 'Réservation Enregistrée' : 'Demande Envoyée')),
          message: data.isLastMinute ? data.lastMinuteWarning : message
        });
        setShowModal(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setFormData({ nom: '', email: '', telephone: '', adressePostale: '', dateDebut: '', dateFin: '', chambres: [], chambresDetails: {}, options: {litsFaits: false, lingeFourni: false, menage: false}, occupants: [] });
        setStep(1);
        // onCreated(); // Retiré d'ici pour éviter de fermer la modale parente prématurément
      } else {
        const errData = await res.json();
        setErrorMsg(errData.error || "Une erreur est survenue lors de l'envoi.");
      }
    } catch (err) {
      setErrorMsg("Erreur réseau. Impossible de contacter le serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={step === 1 ? goToStep2 : handleSubmit} className="space-y-6 relative">
      {successMsg && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline font-bold">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline font-bold">{errorMsg}</span>
        </div>
      )}
      {step === 1 && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">{isAdmin ? 'Nom Client / Groupe' : 'Nom Complet du Client'}</label>
            <input required type="text" name="nom" value={formData.nom} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: Jean Dupont" />
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">E-mail</label>
            <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="jean@exemple.com" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Téléphone</label>
            <input required type="tel" name="telephone" value={formData.telephone} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="06 00 00 00 00" />
          </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Arrivée (à partir de 17h)</label>
          <input required type="date" name="dateDebut" value={formData.dateDebut} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Départ (avant 11h)</label>
          <input required type="date" name="dateFin" value={formData.dateFin} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-4 block">Sélection des Chambres</label>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(num => {
            const info = CHAMBRES_INFO[num];
            const isChecked = formData.chambres.includes(num);
            const isUnavailable = unavailableRooms.includes(num);

            return (
              <div key={num} className={`p-4 rounded-xl border-2 transition-all ${isUnavailable ? 'opacity-50 bg-slate-100 border-slate-200 grayscale cursor-not-allowed' : isChecked ? 'border-muc-yellow bg-muc-yellow/5' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                <label className={`flex items-center gap-3 w-full ${isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input type="checkbox" name="chambres" value={num} checked={isChecked} onChange={handleChange} disabled={isUnavailable} className="hidden" />
                  <div className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-muc-yellow border-muc-yellow' : 'bg-white border-slate-300'}`}>
                    {isChecked && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-slate-700 uppercase tracking-tight block">
                        Ch. {num} - {info.name} {isUnavailable && <span className="text-red-500 text-xs ml-2">(Indisponible)</span>}
                    </span>
                    <span className="text-xs font-medium text-slate-500">{info.lits} lits • {info.etage}</span>
                  </div>
                </label>
                
                {isChecked && !isUnavailable && (
                  <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Adultes (≥13 ans)</label>
                      <input type="number" min="0" max={info.lits} value={formData.chambresDetails[num]?.adultes || 0} onChange={(e) => handleRoomDetailsChange(num, 'adultes', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Mineurs</label>
                      <input type="number" min="0" max={info.lits} value={formData.chambresDetails[num]?.mineurs || 0} onChange={(e) => handleRoomDetailsChange(num, 'mineurs', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-4 block">Options Complémentaires</label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_litsFaits" checked={formData.options.litsFaits} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Lits faits à l'arrivée (5€ / pers)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_lingeFourni" checked={formData.options.lingeFourni} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Linge de toilette fourni (5€ / pers)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_menage" checked={formData.options.menage} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Ménage fin de séjour (50€ / chambre)</span>
          </label>
        </div>
      </div>

      {formData.dateDebut && formData.dateFin && formData.chambres.length > 0 && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-2 block">Code Promo</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={promoCode} 
                onChange={e => setPromoCode(e.target.value.toUpperCase())}
                placeholder="VOTRE CODE"
                className="w-full sm:flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-muc-blue font-bold text-sm uppercase min-w-0"
                disabled={promoApplied}
              />
              {!promoApplied ? (
                <button 
                  type="button" 
                  onClick={handleApplyPromo}
                  disabled={validatingPromo || !promoCode}
                  className="whitespace-nowrap px-6 py-2 bg-muc-blue text-white rounded-xl font-bold text-sm hover:bg-blue-800 disabled:opacity-50 transition-all shadow-md"
                >
                  {validatingPromo ? '...' : 'Appliquer'}
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={() => { setPromoApplied(null); setPromoCode(''); }}
                  className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold text-sm hover:bg-red-200 transition-all"
                >
                  Retirer
                </button>
              )}
            </div>
            {promoError && <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{promoError}</p>}
            {promoApplied && <p className="text-green-600 text-[10px] font-bold mt-1 ml-1">Code appliqué : -{promoApplied.type === 'pourcentage' ? `${promoApplied.valeur}%` : `${promoApplied.valeur}€`}</p>}
          </div>

          <div className="bg-muc-blue/5 p-6 rounded-2xl border-2 border-muc-blue/10">
            <h3 className="text-sm font-black uppercase text-muc-blue tracking-widest mb-4">Récapitulatif</h3>
            <div className="flex justify-between items-center text-xl font-black text-slate-900">
              <span>Total Estimé</span>
              <div className="text-right">
                {promoApplied && <span className="text-sm text-slate-400 line-through mr-2 font-normal">{(calculerPrix() / (promoApplied.type === 'pourcentage' ? (1 - promoApplied.valeur / 100) : 1) + (promoApplied.type === 'fixe' ? promoApplied.valeur : 0)).toFixed(2)} €</span>}
                <span>{calculerPrix().toFixed(2)} €</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">* Inclut la taxe de séjour (4% du prix de la nuitée / adulte)</p>
          </div>
        </div>
      )}

          <button type="submit" className="w-full bg-muc-blue text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-muc-blue/90 hover:scale-[1.02] transition-all shadow-xl mt-8">
            <Send size={20} /> Valider
          </button>
        </>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          <button type="button" onClick={() => setStep(1)} className="text-sm font-bold text-muc-blue hover:underline mb-4 inline-block">
            ← Retour à la sélection
          </button>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Adresse Postale Complète</label>
              <textarea required name="adressePostale" value={formData.adressePostale} onChange={handleChange} rows="3" className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: 123 rue de la Paix, 75000 Paris" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-4 uppercase tracking-tight">Détails des occupants</h3>
            <div className="space-y-6">
              {(() => {
                let adultCount = 0;
                let childCount = 0;
                return formData.occupants.map((occ, idx) => {
                  const label = occ.estAdulte ? `Adulte ${++adultCount}` : `Mineur ${++childCount}`;
                  return (
                    <div key={idx} className={`p-4 rounded-xl border ${occ.estAdulte ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                      <h4 className="text-sm font-bold text-slate-700 mb-3">{label}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <input required type="text" placeholder="Nom" value={occ.nom} onChange={(e) => handleOccupantChange(idx, 'nom', e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-muc-yellow outline-none" />
                        </div>
                        <div>
                          <input required type="text" placeholder="Prénom" value={occ.prenom} onChange={(e) => handleOccupantChange(idx, 'prenom', e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-muc-yellow outline-none" />
                        </div>
                      </div>
                      {!occ.estAdulte && (
                        <div className="mt-3">
                          <label className="text-xs font-bold text-slate-500 mb-1 block">Âge du mineur</label>
                          <input required type="number" min="0" max="18" placeholder="Âge" value={occ.age} onChange={(e) => handleOccupantChange(idx, 'age', parseInt(e.target.value))} className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-muc-yellow outline-none" />
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          <div className="bg-muc-blue/5 p-6 rounded-2xl border-2 border-muc-blue/10">
            <div className="flex justify-between items-center text-xl font-black text-slate-900">
              <span>Total Estimé</span>
              <span>{calculerPrix().toFixed(2)} €</span>
            </div>
          </div>

          <button disabled={isSubmitting} type="submit" className={`w-full bg-muc-yellow text-muc-blue py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl mt-8 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#FCD34D] hover:scale-[1.02]'}`}>
            {isSubmitting ? (
              <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-muc-blue"></div> Traitement en cours...</>
            ) : (
              <><Send size={20} /> {isAdmin ? 'Valider' : 'Confirmer la demande'}</>
            )}
          </button>
        </div>
      )}

      {/* Modal de Confirmation / Alerte */}
      {showModal && (
        <div className="fixed inset-0 w-screen h-screen z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-100">
            <div className="flex justify-center mb-4">
              {modalConfig.type === 'warning' ? (
                <div className="bg-amber-100 p-4 rounded-full text-amber-600">
                  <AlertTriangle size={40} />
                </div>
              ) : (
                <div className="bg-green-100 p-4 rounded-full text-green-600 flex justify-center items-center">
                  <CheckCircle size={40} />
                </div>
              )}
            </div>
            <h3 className="text-2xl font-black mb-2 uppercase tracking-tight text-slate-800">{modalConfig.title}</h3>
            <div className="text-slate-600 font-medium leading-relaxed whitespace-pre-line mb-6">
              {modalConfig.message}
            </div>
            
            {modalConfig.type === 'warning' && (
              <div className="mt-6 flex items-center justify-center gap-2 text-muc-blue font-bold bg-white/50 p-3 rounded-xl border border-amber-200 mb-6">
                <Phone size={18} />
                <a href="tel:0667993681">06 67 99 36 81</a>
              </div>
            )}
            
            <button 
              onClick={() => {
                setShowModal(false);
                if (isAdmin) {
                  onCreated(); // Notifie le parent (Admin) pour rafraîchir et fermer le tiroir
                  navigate('/admin');
                } else {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg ${
                modalConfig.type === 'warning' 
                ? 'bg-muc-blue text-white hover:bg-blue-800' 
                : 'bg-muc-yellow text-muc-blue hover:bg-yellow-400'
              }`}
            >
              {modalConfig.type === 'warning' ? 'J\'appelle de suite' : 'Fermer'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
};

export default ReservationForm;
