import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Calendar, Users, CreditCard, Info, ShieldCheck, 
  ArrowRight, CheckCircle, AlertTriangle, Loader2, 
  Plus, Trash2, Home as HomeIcon, CheckSquare, Square
} from 'lucide-react';
import { API_URL } from '../config';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC', maxOccupants: 5 },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage', maxOccupants: 6 },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage', maxOccupants: 6 },
  4: { num: 4, name: 'Grande chambre', lits: 7, etage: '2e étage', maxOccupants: 7 },
  5: { num: 5, name: 'Grande chambre', lits: 7, etage: '2e étage', maxOccupants: 7 },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage', maxOccupants: 5 }
};

const ReservationModify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading, edit, success, error
  const [message, setMessage] = useState('');
  const [reservation, setReservation] = useState(null);

  // Form fields
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [chambres, setChambres] = useState([]);
  const [chambresDetails, setChambresDetails] = useState({});
  const [options, setOptions] = useState({ litsFaits: false, lingeFourni: false, menage: false });
  const [repas, setRepas] = useState({});
  const [salles, setSalles] = useState({ salle15: false, salle12: false });
  const [occupants, setOccupants] = useState([]);

  // Recalculated pricing
  const [pricing, setPricing] = useState({ originalPrice: 0, newPrice: 0, difference: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initial load
  useEffect(() => {
    const fetchReservationInfo = async () => {
      if (!token) {
        setStatus('error');
        setMessage("Lien de modification incorrect ou manquant de jeton de sécurité.");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/reservation/modify/info/${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          setReservation(data);
          
          // Pre-populate fields
          setDateDebut(data.dateDebut ? new Date(data.dateDebut).toISOString().split('T')[0] : '');
          setDateFin(data.dateFin ? new Date(data.dateFin).toISOString().split('T')[0] : '');
          setChambres(data.chambres || []);
          setChambresDetails(data.chambresDetails || {});
          setOptions(data.options || { litsFaits: false, lingeFourni: false, menage: false });
          setRepas(data.repas || {});
          setSalles(data.salles || { salle15: false, salle12: false });
          
          if (data.occupants) {
            setOccupants(data.occupants.map(o => ({
              id: o.id,
              nom: o.nom || '',
              prenom: o.prenom || '',
              estAdulte: o.estAdulte,
              age: o.age || '',
              nationalite: o.nationalite === 'Française' || o.nationalite === true || o.nationalite === null
            })));
          }
          
          setStatus('edit');
        } else {
          let errMsg = `Erreur (HTTP ${res.status})`;
          try {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } catch (_) {}
          setStatus('error');
          setMessage(errMsg);
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage("Impossible de joindre le serveur. Veuillez vérifier votre connexion.");
      }
    };

    fetchReservationInfo();
  }, [token]);

  // Recalculate price on changes
  useEffect(() => {
    if (status !== 'edit' || !dateDebut || !dateFin || chambres.length === 0) return;

    const recalculatePrice = async () => {
      try {
        const res = await fetch(`${API_URL}/api/reservation/modify/recalculate/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateDebut,
            dateFin,
            chambres,
            chambresDetails,
            options,
            repas,
            salles
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPricing(data);
        }
      } catch (err) {
        console.error("Recalculation pricing error:", err);
      }
    };

    const timer = setTimeout(recalculatePrice, 400);
    return () => clearTimeout(timer);
  }, [dateDebut, dateFin, chambres, chambresDetails, options, repas, salles, status, token]);

  const handleRoomToggle = (chId) => {
    setChambres(prev => {
      let updated;
      if (prev.includes(chId)) {
        updated = prev.filter(id => id !== chId);
        const newDetails = { ...chambresDetails };
        delete newDetails[chId];
        setChambresDetails(newDetails);
      } else {
        updated = [...prev, chId];
        setChambresDetails(prevDetails => ({
          ...prevDetails,
          [chId]: { adultes: 1, enfants: 0 }
        }));
      }
      return updated;
    });
  };

  const handleRoomDetailChange = (chId, field, value) => {
    setChambresDetails(prev => ({
      ...prev,
      [chId]: {
        ...prev[chId],
        [field]: parseInt(value) || 0
      }
    }));
  };

  const handleOccupantChange = (index, field, value) => {
    setOccupants(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addOccupant = () => {
    setOccupants(prev => [...prev, { nom: '', prenom: '', estAdulte: true, age: '', nationalite: true }]);
  };

  const removeOccupant = (index) => {
    setOccupants(prev => prev.filter((_, i) => i !== index));
  };

  // Generate stay dates for meal config
  const getStayDates = () => {
    if (!dateDebut || !dateFin) return [];
    const dates = [];
    let curr = new Date(dateDebut);
    const end = new Date(dateFin);
    // Keep it reasonable
    let safety = 0;
    while (curr < end && safety < 100) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
      safety++;
    }
    return dates;
  };

  const handleMealChange = (dateStr, mealType, category, value) => {
    setRepas(prev => {
      const dateRepas = prev[dateStr] || {};
      const meal = dateRepas[mealType] || { ADULTE: 0, ENFANT_MOINS_12: 0, ENFANT_MOINS_5: 0 };
      const updatedMeal = { ...meal, [category]: parseInt(value) || 0 };
      return {
        ...prev,
        [dateStr]: {
          ...dateRepas,
          [mealType]: updatedMeal
        }
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (chambres.length === 0) {
      setErrorMsg("Vous devez sélectionner au moins une chambre.");
      return;
    }

    // Validate dates
    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    if (end <= start) {
      setErrorMsg("La date de départ doit être après la date d'arrivée.");
      return;
    }

    // Validate occupants
    for (let i = 0; i < occupants.length; i++) {
      const occ = occupants[i];
      if (occ.estAdulte) {
        if (!occ.nom?.trim() || !occ.prenom?.trim()) {
          setErrorMsg(`Veuillez renseigner le nom et le prénom pour l'adulte n°${i + 1}.`);
          return;
        }
      } else {
        if (occ.age === '' || isNaN(occ.age) || occ.age < 0 || occ.age >= 18) {
          setErrorMsg(`Veuillez indiquer un âge valide (0-17 ans) pour le mineur n°${i + 1}.`);
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/reservation/modify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateDebut,
          dateFin,
          chambres,
          chambresDetails,
          options,
          repas,
          salles,
          occupants: occupants.map(o => ({
            ...o,
            nationalite: o.nationalite ? 'Française' : 'Étrangère'
          }))
        })
      });

      if (res.ok) {
        setStatus('success');
      } else {
        let errText = "Erreur serveur";
        try {
          const errData = await res.json();
          errText = errData.error || errText;
        } catch (_) {}
        setErrorMsg(errText);
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Impossible de joindre le serveur pour soumettre votre modification.");
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Banner */}
      <div className="bg-[#004B93] text-white py-12 px-6 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="bg-[#FFD700] text-[#004B93] text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-widest block w-fit mb-3">
              Gîte de la Maladrerie
            </span>
            <h1 className="text-3xl font-black tracking-tight uppercase">Modifier votre Réservation</h1>
            <p className="text-slate-200 mt-2 font-medium max-w-xl text-sm leading-relaxed">
              Modifiez vos dates, chambres, options, repas et occupants. Vos changements seront soumis à la validation de votre conseiller de séjour.
            </p>
          </div>
          {reservation && (
            <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider block">ID Réservation</span>
              <span className="text-xl font-black tracking-wider text-[#FFD700]">#{reservation.id}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 size={60} className="text-[#004B93] animate-spin" />
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Chargement de votre dossier...</h2>
          </div>
        )}

        {status === 'error' && (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-red-500 mt-10">
            <div className="bg-red-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-red-600 mb-6">
              <AlertTriangle size={50} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Lien de modification non valide</h2>
            <p className="text-red-600 font-medium bg-red-50/50 p-4 rounded-xl border border-red-100/50 text-sm mb-6 leading-relaxed">
              {message}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg"
            >
              Retour à l'accueil
            </button>
          </div>
        )}

        {status === 'edit' && reservation && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            
            {/* Left Column: Comparisons & Status */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Comparative Pricing */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                  <CreditCard className="text-[#004B93]" size={20} />
                  Estimation du Prix
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Prix d'origine :</span>
                    <span className="font-bold text-slate-700">{(reservation.prixTotal || 0).toFixed(2)} €</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-medium">Nouveau prix estimé :</span>
                    <span className="font-bold text-slate-800">
                      {(pricing.newPrice || reservation.prixTotal || 0).toFixed(2)} €
                    </span>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-100 flex justify-between items-center">
                    <span className="text-sm font-black text-slate-700">Écart :</span>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                      pricing.difference > 0 ? 'bg-amber-100 text-amber-800' : 
                      pricing.difference < 0 ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {pricing.difference > 0 ? `+${pricing.difference.toFixed(2)} €` : `${pricing.difference.toFixed(2)} €`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Current details recap */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Info className="text-[#004B93]" size={20} />
                  Détails Actuels du Séjour
                </h3>

                <div className="space-y-4 text-xs font-medium text-slate-600">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">Dates réservées</span>
                    <span className="text-slate-800 font-bold block mt-1">
                      Du {formatDate(reservation.dateDebut)} au {formatDate(reservation.dateFin)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">Chambres actuelles</span>
                    <span className="text-slate-800 font-bold block mt-1">
                      {reservation.chambres.join(', ')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Modification Form */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* Error Box */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800">
                  <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
                  <p className="text-xs font-bold">{errorMsg}</p>
                </div>
              )}

              {/* Dates & Salles */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-2 border-b border-slate-100 flex items-center gap-2">
                  <Calendar className="text-[#004B93]" size={20} />
                  Dates & Salles de Réunion
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Date d'arrivée</label>
                    <input 
                      type="date" 
                      value={dateDebut} 
                      onChange={(e) => setDateDebut(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] bg-white outline-none text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Date de départ</label>
                    <input 
                      type="date" 
                      value={dateFin} 
                      onChange={(e) => setDateFin(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] bg-white outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-dashed border-slate-100 space-y-3">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">Salles de réunion optionnelles</span>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={salles.salle15}
                        onChange={(e) => setSalles(prev => ({ ...prev, salle15: e.target.checked }))}
                        className="accent-[#004B93] w-4 h-4"
                      />
                      Grande Salle d'activité / Réunion (Capacité 15 personnes)
                    </label>
                    <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={salles.salle12}
                        onChange={(e) => setSalles(prev => ({ ...prev, salle12: e.target.checked }))}
                        className="accent-[#004B93] w-4 h-4"
                      />
                      Petite Salle de réunion (Capacité 12 personnes)
                    </label>
                  </div>
                </div>
              </div>

              {/* Rooms Selection */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-2 border-b border-slate-100 flex items-center gap-2">
                  <HomeIcon className="text-[#004B93]" size={20} />
                  Choix des Chambres
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(CHAMBRES_INFO).map(([idStr, info]) => {
                    const id = parseInt(idStr);
                    const isSelected = chambres.includes(id);
                    return (
                      <div 
                        key={id} 
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          isSelected ? 'bg-blue-50/50 border-[#004B93]' : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                        }`}
                        onClick={() => handleRoomToggle(id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 text-sm">Chambre {id} ({info.name})</span>
                          {isSelected ? <CheckSquare size={18} className="text-[#004B93]" /> : <Square size={18} className="text-slate-400" />}
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold block mt-1">{info.etage} - Jusqu'à {info.maxOccupants} lits</span>

                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-dashed border-[#004B93]/20 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                            <div>
                              <label className="text-[9px] font-black text-slate-500 uppercase block">Adultes</label>
                              <input 
                                type="number" 
                                min="1" 
                                max={info.maxOccupants}
                                value={chambresDetails[id]?.adultes || 1}
                                onChange={(e) => handleRoomDetailChange(id, 'adultes', e.target.value)}
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-black text-slate-500 uppercase block">Enfants</label>
                              <input 
                                type="number" 
                                min="0" 
                                max={info.maxOccupants}
                                value={chambresDetails[id]?.enfants || 0}
                                onChange={(e) => handleRoomDetailChange(id, 'enfants', e.target.value)}
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Options */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-2 border-b border-slate-100 flex items-center gap-2">
                  <CheckSquare className="text-[#004B93]" size={20} />
                  Options & Services
                </h3>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={options.litsFaits}
                      onChange={(e) => setOptions(prev => ({ ...prev, litsFaits: e.target.checked }))}
                      className="accent-[#004B93] w-4 h-4"
                    />
                    Lits faits à l'arrivée (5€ / personne)
                  </label>
                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={options.lingeFourni}
                      onChange={(e) => setOptions(prev => ({ ...prev, lingeFourni: e.target.checked }))}
                      className="accent-[#004B93] w-4 h-4"
                    />
                    Linge de toilette fourni (5€ / personne)
                  </label>
                  <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={options.menage}
                      onChange={(e) => setOptions(prev => ({ ...prev, menage: e.target.checked }))}
                      className="accent-[#004B93] w-4 h-4"
                    />
                    Forfait ménage fin de séjour (50€ / chambre)
                  </label>
                </div>
              </div>

              {/* Meals Config */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-2 border-b border-slate-100 flex items-center gap-2">
                  <Users className="text-[#004B93]" size={20} />
                  Restauration
                </h3>

                <div className="space-y-4">
                  {getStayDates().length === 0 ? (
                    <p className="text-slate-500 text-xs italic">Veuillez d'abord renseigner des dates de séjour valides.</p>
                  ) : (
                    getStayDates().map(dateStr => {
                      const dayRepas = repas[dateStr] || {};
                      return (
                        <div key={dateStr} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                          <span className="text-xs font-bold text-[#004B93] block capitalize">
                            {new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            {['PETIT_DEJ', 'DEJEUNER', 'DINER'].map(mealType => {
                              const label = mealType === 'PETIT_DEJ' ? 'Petit-déjeuner' : mealType === 'DEJEUNER' ? 'Déjeuner' : 'Dîner';
                              const meal = dayRepas[mealType] || { ADULTE: 0, ENFANT_MOINS_12: 0, ENFANT_MOINS_5: 0 };
                              return (
                                <div key={mealType} className="bg-white p-3 rounded-lg border border-slate-100 space-y-2">
                                  <span className="text-[10px] font-black text-slate-600 block">{label}</span>
                                  <div className="grid grid-cols-3 gap-1">
                                    <div>
                                      <label className="text-[8px] font-black text-slate-400 block">Ad.</label>
                                      <input 
                                        type="number" 
                                        min="0" 
                                        value={meal.ADULTE || 0}
                                        onChange={(e) => handleMealChange(dateStr, mealType, 'ADULTE', e.target.value)}
                                        className="w-full text-center p-1 text-[10px] rounded border border-slate-200"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-black text-slate-400 block">-12a.</label>
                                      <input 
                                        type="number" 
                                        min="0" 
                                        value={meal.ENFANT_MOINS_12 || 0}
                                        onChange={(e) => handleMealChange(dateStr, mealType, 'ENFANT_MOINS_12', e.target.value)}
                                        className="w-full text-center p-1 text-[10px] rounded border border-slate-200"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[8px] font-black text-slate-400 block">-5a.</label>
                                      <input 
                                        type="number" 
                                        min="0" 
                                        value={meal.ENFANT_MOINS_5 || 0}
                                        onChange={(e) => handleMealChange(dateStr, mealType, 'ENFANT_MOINS_5', e.target.value)}
                                        className="w-full text-center p-1 text-[10px] rounded border border-slate-200"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Occupants list */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Liste des Occupants</h3>
                  <button 
                    type="button" 
                    onClick={addOccupant}
                    className="bg-blue-50 text-[#004B93] font-bold text-xs px-3.5 py-1.5 rounded-full hover:bg-blue-100 transition-all flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Ajouter
                  </button>
                </div>

                <div className="space-y-4">
                  {occupants.map((occ, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200">
                        <span className="text-[10px] font-black text-slate-700 uppercase">Voyageur n°{idx + 1}</span>
                        {occupants.length > 1 && (
                          <button type="button" onClick={() => removeOccupant(idx)} className="text-red-500 hover:text-red-700">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Nom</label>
                          <input 
                            type="text" 
                            required
                            placeholder="Nom"
                            value={occ.nom}
                            onChange={(e) => handleOccupantChange(idx, 'nom', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Prénom</label>
                          <input 
                            type="text" 
                            required
                            placeholder="Prénom"
                            value={occ.prenom}
                            onChange={(e) => handleOccupantChange(idx, 'prenom', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400">Type / Âge</label>
                          <div className="flex gap-2">
                            <select 
                              value={occ.estAdulte ? 'adulte' : 'mineur'}
                              onChange={(e) => handleOccupantChange(idx, 'estAdulte', e.target.value === 'adulte')}
                              className="px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none"
                            >
                              <option value="adulte">Adulte</option>
                              <option value="mineur">Enfant</option>
                            </select>
                            {!occ.estAdulte && (
                              <input 
                                type="number" 
                                min="0" 
                                max="17"
                                required
                                placeholder="Âge"
                                value={occ.age}
                                onChange={(e) => handleOccupantChange(idx, 'age', e.target.value)}
                                className="w-16 px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs outline-none"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-dashed border-slate-200 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-600">Nationalité française :</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name={`nationalite-${idx}`}
                              checked={occ.nationalite === true}
                              onChange={() => handleOccupantChange(idx, 'nationalite', true)}
                              className="accent-[#004B93]"
                            />
                            Oui
                          </label>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                            <input 
                              type="radio" 
                              name={`nationalite-${idx}`}
                              checked={occ.nationalite === false}
                              onChange={() => handleOccupantChange(idx, 'nationalite', false)}
                              className="accent-[#004B93]"
                            />
                            Non
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <div className="flex items-start gap-2.5 text-xs text-slate-500 font-medium leading-relaxed">
                  <ShieldCheck className="shrink-0 text-[#004B93] mt-0.5" size={16} />
                  <p>Votre demande de modification sera envoyée à votre conseiller. Elle sera traitée dans les plus brefs délais et vous recevrez une confirmation par e-mail.</p>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-4 bg-[#FFD700] hover:bg-[#FCD34D] text-[#004B93] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl hover:scale-[1.01] ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin text-[#004B93]" size={20} />
                      Soumission en cours...
                    </>
                  ) : (
                    <>
                      <ArrowRight size={20} />
                      Soumettre ma modification pour validation
                    </>
                  )}
                </button>
              </div>

            </div>

          </form>
        )}

        {status === 'success' && (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-green-500 mt-10">
            <div className="bg-green-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-green-600 mb-6">
              <CheckCircle size={50} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Demande Envoyée !</h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Votre demande de modification a été transmise avec succès à l'administrateur de séjour. Vous recevrez une réponse par e-mail dans les plus brefs délais.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg"
            >
              Retour à l'accueil
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ReservationModify;
