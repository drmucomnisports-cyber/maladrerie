import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 8, etage: '2e étage' },
  5: { num: 5, name: 'Chambre standard', lits: 6, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const ReservationForm = ({ events = [], isAdmin = false, onCreated = () => {} }) => {
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

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

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
    let totalEnfants = 0;

    formData.chambres.forEach(chId => {
      const details = formData.chambresDetails[chId] || { adultes: 0, enfants: 0 };
      const info = CHAMBRES_INFO[chId];
      const nbAdultes = parseInt(details.adultes || 0);
      const nbEnfants = parseInt(details.enfants || 0);
      const occupants = nbAdultes + nbEnfants;
      
      totalAdultes += nbAdultes;
      totalEnfants += nbEnfants;

      const tarifPers = occupants >= info.lits ? 22 : 25;
      total += occupants * tarifPers * nuits;
    });

    total += totalAdultes * 0.88 * nuits;

    const totalPersonnes = totalAdultes + totalEnfants;
    if (formData.options.litsFaits) total += totalPersonnes * 5;
    if (formData.options.lingeFourni) total += totalPersonnes * 5;
    if (formData.options.menage) total += formData.chambres.length * 50;

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
      const res = await fetch('http://localhost:5000/api/promo-codes/validate', {
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
        else newDetails[chambreId] = { adultes: 0, enfants: 0 };

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
      const occupantsCount = (details?.adultes || 0) + (details?.enfants || 0);
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
      const nbEnfants = parseInt(details?.enfants || 0);
      
      // Ajouter les adultes
      for (let i = 0; i < nbAdultes; i++) {
        newOccupants.push({ nom: '', prenom: '', estAdulte: true, age: '' });
      }
      // Ajouter les enfants
      for (let i = 0; i < nbEnfants; i++) {
        newOccupants.push({ nom: '', prenom: '', estAdulte: false, age: '' });
      }
    }
    
    setFormData(prev => ({ ...prev, occupants: newOccupants }));
    setStep(2);
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
        promoCode: promoApplied?.code
      };
      
      const url = isAdmin 
        ? 'http://localhost:5000/api/admin/reservations'
        : 'http://localhost:5000/api/reservations';

      const headers = { 'Content-Type': 'application/json' };
      if (isAdmin) {
        const token = localStorage.getItem('adminToken');
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        let message = isAdmin 
          ? 'Réservation ajoutée manuellement avec succès.' 
          : 'Demande de réservation envoyée avec succès. Vous recevrez une confirmation prochainement.';
        
        // Afficher l'alerte de dernière minute si applicable
        if (data.isLastMinute && data.lastMinuteWarning) {
          message = data.lastMinuteWarning;
        }
        
        setSuccessMsg(message);
        setFormData({ nom: '', email: '', telephone: '', adressePostale: '', dateDebut: '', dateFin: '', chambres: [], chambresDetails: {}, options: {litsFaits: false, lingeFourni: false, menage: false}, occupants: [] });
        setStep(1);
        onCreated();
        setTimeout(() => setSuccessMsg(''), 5000);
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
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">{isAdmin ? 'Nom Client / Groupe' : 'Nom Complet du Responsable'}</label>
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
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Enfants (&lt;13 ans)</label>
                      <input type="number" min="0" max={info.lits} value={formData.chambresDetails[num]?.enfants || 0} onChange={(e) => handleRoomDetailsChange(num, 'enfants', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm" />
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
                placeholder="Entrez votre code"
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-muc-blue font-bold text-sm uppercase"
                disabled={promoApplied}
              />
              {!promoApplied ? (
                <button 
                  type="button" 
                  onClick={handleApplyPromo}
                  disabled={validatingPromo || !promoCode}
                  className="px-4 py-2 bg-muc-blue text-white rounded-xl font-bold text-sm hover:bg-blue-800 disabled:opacity-50 transition-all"
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
            <p className="text-[10px] text-slate-500 mt-2">* Inclut la taxe de séjour (0.88€/adulte/nuit)</p>
          </div>
        </div>
      )}

          <button type="submit" className="w-full bg-muc-blue text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-muc-blue/90 hover:scale-[1.02] transition-all shadow-xl mt-8">
            <Send size={20} /> Étape suivante : Détails des occupants
          </button>
        </>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          <button type="button" onClick={() => setStep(1)} className="text-sm font-bold text-muc-blue hover:underline mb-4 inline-block">
            ← Retour à la sélection
          </button>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-4">Coordonnées du Responsable</h3>
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Adresse Postale Complète</label>
              <textarea required name="adressePostale" value={formData.adressePostale} onChange={handleChange} rows="3" className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: 123 rue de la Paix, 75000 Paris" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-4">Détails des {formData.occupants.length} Occupants</h3>
            <div className="space-y-6">
              {(() => {
                let adultCount = 0;
                let childCount = 0;
                return formData.occupants.map((occ, idx) => {
                  const label = occ.estAdulte ? `Adulte ${++adultCount}` : `Enfant ${++childCount}`;
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
                          <label className="text-xs font-bold text-slate-500 mb-1 block">Âge de l'enfant</label>
                          <input required type="number" min="0" max="12" placeholder="Âge" value={occ.age} onChange={(e) => handleOccupantChange(idx, 'age', parseInt(e.target.value))} className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-muc-yellow outline-none" />
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
              <><Send size={20} /> {isAdmin ? 'Valider et Créer' : 'Confirmer la demande'}</>
            )}
          </button>
        </div>
      )}
    </form>
  );
};

export default ReservationForm;
