import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Users, AlertTriangle, CheckCircle, ShieldCheck, Home, Calendar } from 'lucide-react';
import { API_URL } from '../config';

const OccupantsCollect = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading, form, success, error
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reservation, setReservation] = useState(null);
  const [occupants, setOccupants] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchReservationInfo = async () => {
      if (!token) {
        setStatus('error');
        setMessage("Le lien de saisie est invalide ou incomplet. Aucun token n'a été trouvé dans l'URL.");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/reservation/occupants/${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          setReservation(data);

          // Initialiser les occupants
          let initialOccupants = [];
          if (data.occupants && data.occupants.length > 0) {
            initialOccupants = data.occupants.map(occ => ({
              id: occ.id,
              nom: occ.nom || '',
              prenom: occ.prenom || '',
              estAdulte: occ.estAdulte,
              age: occ.age || '',
              nationalite: occ.nationalite === 'Française' || occ.nationalite === true || occ.nationalite === null
            }));
          } else {
            // Créer le bon nombre de champs vides en fonction des totaux calculés par le backend
            for (let i = 0; i < (data.totalAdultes || 0); i++) {
              initialOccupants.push({ nom: '', prenom: '', estAdulte: true, age: '', nationalite: true });
            }
            for (let i = 0; i < (data.totalMineurs || 0); i++) {
              initialOccupants.push({ nom: '', prenom: '', estAdulte: false, age: '', nationalite: true });
            }
          }
          setOccupants(initialOccupants);
          setStatus('form');
        } else {
          const errData = await res.json().catch(() => ({}));
          setStatus('error');
          setMessage(errData.error || `Erreur lors de la récupération des détails de la réservation (HTTP ${res.status}).`);
        }
      } catch (err) {
        console.error("Erreur réseau chargement occupants:", err);
        setStatus('error');
        setMessage("Impossible de contacter le serveur. Vérifiez votre connexion internet.");
      }
    };

    fetchReservationInfo();
  }, [token]);

  const handleOccupantChange = (index, field, value) => {
    setOccupants(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Valider les occupants
    for (let i = 0; i < occupants.length; i++) {
      const occ = occupants[i];
      if (occ.estAdulte) {
        if (!occ.nom?.trim() || !occ.prenom?.trim()) {
          setErrorMsg(`Veuillez renseigner le nom et le prénom pour l'adulte n°${i + 1}.`);
          return;
        }
      } else {
        if (occ.age === '' || occ.age === undefined || occ.age === null || isNaN(occ.age) || occ.age < 0 || occ.age >= 18) {
          setErrorMsg(`Veuillez indiquer un âge valide (moins de 18 ans) pour le mineur n°${i + 1}.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/reservation/occupants/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupants })
      });

      if (res.ok) {
        setStatus('success');
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || "Une erreur est survenue lors de l'enregistrement.");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("Erreur réseau enregistrement occupants:", err);
      setErrorMsg("Erreur réseau : impossible de soumettre le formulaire.");
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Header Banner */}
      <div className="bg-[#004B93] text-white py-12 px-6 shadow-md text-center">
        <span className="bg-[#FFD700] text-[#004B93] text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-widest inline-block mb-3">
          Gîte de la Maladrerie
        </span>
        <h1 className="text-3xl font-black tracking-tight uppercase">Saisie des Voyageurs</h1>
        <p className="text-slate-200 mt-2 font-medium max-w-xl mx-auto text-sm leading-relaxed">
          Veuillez renseigner ci-dessous l'identité des occupants de votre groupe pour finaliser votre séjour.
        </p>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto p-6 md:p-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 size={50} className="text-[#004B93] animate-spin" />
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Chargement...</h2>
          </div>
        )}

        {status === 'error' && (
          <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-red-500 mt-10">
            <div className="bg-red-100 p-6 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-red-600 mb-6">
              <AlertTriangle size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Lien Invalide ou Expiré</h2>
            <p className="text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-100 text-sm mb-6 leading-relaxed">
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

        {status === 'form' && reservation && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Recap Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                <Calendar className="text-[#004B93]" size={20} />
                Votre Séjour
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Réservation au nom de</span>
                  <span className="text-slate-800 font-bold text-sm block mt-0.5">{reservation.clientNom}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Dates du séjour</span>
                  <span className="text-slate-800 font-bold text-sm block mt-0.5">
                    Du {formatDate(reservation.dateDebut)} au {formatDate(reservation.dateFin)}
                  </span>
                </div>
              </div>
            </div>

            {/* Occupants List Form */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Liste des Occupants</h3>
                  <p className="text-slate-500 text-xs mt-1">Saisie obligatoire pour les démarches administratives réglementaires.</p>
                </div>
                <span className="bg-blue-50 text-[#004B93] font-bold text-xs px-3.5 py-1.5 rounded-full shrink-0 flex items-center gap-1.5">
                  <Users size={14} /> {occupants.length} voyageur(s)
                </span>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800 animate-in fade-in duration-200">
                  <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
                  <p className="text-xs font-bold">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-6">
                {(() => {
                  let adultCount = 0;
                  let childCount = 0;
                  return occupants.map((occ, idx) => {
                    const label = occ.estAdulte ? `Adulte n°${++adultCount}` : `Mineur n°${++childCount}`;
                    return (
                      <div key={idx} className={`p-5 rounded-2xl border-2 ${occ.estAdulte ? 'bg-slate-50/50 border-slate-100' : 'bg-amber-50/30 border-amber-100/50'} space-y-4`}>
                        <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200/60">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{label}</h4>
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${occ.estAdulte ? 'bg-slate-100 text-slate-600' : 'bg-amber-100/70 text-amber-700'}`}>
                            {occ.estAdulte ? 'Adulte (+18 ans)' : 'Mineur (-18 ans)'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Nom {occ.estAdulte && <span className="text-red-500">*</span>}</label>
                            <input 
                              required={occ.estAdulte} 
                              type="text" 
                              placeholder={occ.estAdulte ? "Nom" : "Nom (optionnel)"} 
                              value={occ.nom} 
                              onChange={(e) => handleOccupantChange(idx, 'nom', e.target.value)} 
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] bg-white outline-none text-sm transition-all" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Prénom {occ.estAdulte && <span className="text-red-500">*</span>}</label>
                            <input 
                              required={occ.estAdulte} 
                              type="text" 
                              placeholder={occ.estAdulte ? "Prénom" : "Prénom (optionnel)"} 
                              value={occ.prenom} 
                              onChange={(e) => handleOccupantChange(idx, 'prenom', e.target.value)} 
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] bg-white outline-none text-sm transition-all" 
                            />
                          </div>
                          {!occ.estAdulte && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Âge <span className="text-red-500">*</span></label>
                              <input 
                                required 
                                type="number" 
                                min="0" 
                                max="17" 
                                placeholder="Âge" 
                                value={occ.age} 
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                  handleOccupantChange(idx, 'age', val);
                                }} 
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] bg-white outline-none text-sm transition-all" 
                              />
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-dashed border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <span className="text-xs font-bold text-slate-600">Nationalité française :</span>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                              <input 
                                type="radio" 
                                name={`nationalite-${idx}`} 
                                checked={occ.nationalite === true} 
                                onChange={() => handleOccupantChange(idx, 'nationalite', true)} 
                                className="accent-[#004B93] w-4 h-4"
                              />
                              Oui
                            </label>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                              <input 
                                type="radio" 
                                name={`nationalite-${idx}`} 
                                checked={occ.nationalite === false} 
                                onChange={() => handleOccupantChange(idx, 'nationalite', false)} 
                                className="accent-[#004B93] w-4 h-4"
                              />
                              Non
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                <div className="flex items-start gap-2.5 text-xs text-slate-500 font-medium leading-relaxed">
                  <ShieldCheck className="shrink-0 text-[#004B93] mt-0.5" size={16} />
                  <p>Vos données sont protégées et cryptées. Les informations d'identité sont récoltées uniquement à des fins administratives réglementaires.</p>
                </div>

                <button 
                  disabled={isSubmitting} 
                  type="submit" 
                  className={`w-full py-4 bg-[#FFD700] hover:bg-[#FCD34D] text-[#004B93] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl hover:scale-[1.01] ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin text-[#004B93]" size={20} />
                      Enregistrement en cours...
                    </>
                  ) : (
                    "Valider et Enregistrer"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {status === 'success' && (
          <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-green-500 mt-10">
            <div className="bg-green-100 p-6 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-green-600 mb-6">
              <CheckCircle size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Informations Enregistrées !</h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Merci, la liste des voyageurs de votre groupe a bien été transmise avec succès à l'équipe du Gîte de la Maladrerie.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg text-sm"
            >
              Retour à l'accueil
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OccupantsCollect;
