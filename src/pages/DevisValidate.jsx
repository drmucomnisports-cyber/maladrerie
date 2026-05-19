import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Loader2, Calendar, Users, CreditCard, Info, ShieldCheck, Mail, Phone, Home } from 'lucide-react';
import { API_URL } from '../config';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 8, etage: '2e étage' },
  5: { num: 5, name: 'Chambre standard', lits: 6, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const DevisValidate = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState('loading'); // loading, form, success, error
  const [message, setMessage] = useState('');
  const [devis, setDevis] = useState(null);
  const [occupants, setOccupants] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchDevisInfo = async () => {
      if (!token) {
        setStatus('error');
        setMessage("Le lien de validation est invalide ou incomplet. Aucun token n'a été trouvé dans l'URL.");
        return;
      }

      const url = `${API_URL}/api/devis/info/${encodeURIComponent(token)}`;
      console.log('[DevisValidate] Fetching devis info:', { API_URL, token, url });

      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setDevis(data);
          
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
          } else if (data.chambresDetails) {
            Object.entries(data.chambresDetails).forEach(([chId, details]) => {
              const nbAdultes = parseInt(details.adultes || 0);
              const nbMineurs = parseInt(details.enfants || details.mineurs || 0);
              for (let i = 0; i < nbAdultes; i++) {
                initialOccupants.push({ nom: '', prenom: '', estAdulte: true, age: '', nationalite: true });
              }
              for (let i = 0; i < nbMineurs; i++) {
                initialOccupants.push({ nom: '', prenom: '', estAdulte: false, age: '', nationalite: true });
              }
            });
          }
          setOccupants(initialOccupants);
          setStatus('form');
        } else {
          let errMsg = `Erreur serveur (HTTP ${res.status})`;
          try {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } catch (_) { /* response not JSON */ }
          console.error('[DevisValidate] Server error:', { status: res.status, errMsg, url });
          setStatus('error');
          setMessage(errMsg);
        }
      } catch (err) {
        console.error('[DevisValidate] Network error:', err);
        const detail = err.message || String(err);
        setStatus('error');
        setMessage(`Impossible de contacter le serveur (${detail}). Vérifiez votre connexion internet ou réessayez.`);
      }
    };

    fetchDevisInfo();
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
    
    // Valider les informations des occupants
    for (let i = 0; i < occupants.length; i++) {
      const occ = occupants[i];
      if (occ.estAdulte) {
        if (!occ.nom?.trim() || !occ.prenom?.trim()) {
          setErrorMsg(`Veuillez renseigner le nom et le prénom pour l'adulte n°${i + 1}.`);
          return;
        }
        if (occ.age === '' || occ.age === undefined || occ.age === null || isNaN(occ.age) || occ.age < 18) {
          setErrorMsg(`Veuillez indiquer un âge valide (18 ans ou plus) pour l'adulte n°${i + 1}.`);
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
    const validateUrl = `${API_URL}/api/devis/validate/${encodeURIComponent(token)}`;
    console.log('[DevisValidate] Validating devis:', { validateUrl, occupantsCount: occupants.length });

    try {
      const res = await fetch(validateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupants })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          // Rediriger vers Stripe Checkout
          window.location.href = data.url;
        } else {
          setStatus('success');
        }
      } else {
        let errMsg = `Erreur serveur (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) { /* response not JSON */ }
        console.error('[DevisValidate] Validation error:', { status: res.status, errMsg, validateUrl });
        setErrorMsg(errMsg);
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('[DevisValidate] Network error on validate:', err);
      const detail = err.message || String(err);
      setErrorMsg(`Erreur réseau : ${detail}. Vérifiez votre connexion internet ou réessayez.`);
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getNuitsCount = () => {
    if (!devis?.dateDebut || !devis?.dateFin) return 0;
    const start = new Date(devis.dateDebut);
    const end = new Date(devis.dateFin);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Header / Banner */}
      <div className="bg-[#004B93] text-white py-12 px-6 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="bg-[#FFD700] text-[#004B93] text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-widest block w-fit mb-3">
              Gîte de la Maladrerie
            </span>
            <h1 className="text-3xl font-black tracking-tight uppercase">Validation de votre Devis</h1>
            <p className="text-slate-200 mt-2 font-medium max-w-xl text-sm leading-relaxed">
              Pour finaliser votre réservation et réserver vos dates de séjour, veuillez vérifier les informations ci-dessous et renseigner les détails de chaque occupant.
            </p>
          </div>
          {devis?.numeroDevis && (
            <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider block">Numéro de Devis</span>
              <span className="text-xl font-black tracking-wider text-[#FFD700]">{devis.numeroDevis}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 size={60} className="text-[#004B93] animate-spin" />
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Chargement du devis...</h2>
            <p className="text-slate-500 text-sm">Veuillez patienter pendant que nous récupérons les détails de votre devis.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-red-500 mt-10">
            <div className="bg-red-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-red-600 mb-6">
              <AlertTriangle size={50} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Lien Invalide ou Expiré</h2>
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



        {status === 'form' && devis && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            
            {/* Left Column: Summary */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Calendar className="text-[#004B93]" size={20} />
                  Récapitulatif du Séjour
                </h3>

                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Dates de séjour</span>
                    <span className="text-sm font-bold text-slate-700 block mt-1">
                      Du {formatDate(devis.dateDebut)}
                    </span>
                    <span className="text-sm font-bold text-slate-700 block">
                      au {formatDate(devis.dateFin)}
                    </span>
                    <span className="inline-block mt-2 bg-blue-50 text-[#004B93] text-xs font-bold px-2.5 py-1 rounded-full">
                      {getNuitsCount()} nuit(s)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Chambres réservées</span>
                    <div className="space-y-1.5">
                      {devis.chambres.map(chId => {
                        const info = CHAMBRES_INFO[chId];
                        return (
                          <div key={chId} className="flex justify-between items-center text-xs font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                            <span>{info ? info.name : `Chambre ${chId}`} (Ch. {chId})</span>
                            <span className="text-slate-500">{info ? info.etage : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {devis.options && (Object.values(devis.options).some(Boolean)) && (
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">Options incluses</span>
                      <div className="flex flex-wrap gap-2">
                        {devis.options.litsFaits && <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">Lits faits à l'arrivée</span>}
                        {devis.options.lingeFourni && <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">Linge de toilette fourni</span>}
                        {devis.options.menage && <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">Forfait ménage fin de séjour</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Info Card */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Users className="text-[#004B93]" size={20} />
                  Coordonnées Client
                </h3>

                <div className="space-y-3.5 text-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Nom du client / Structure</span>
                    <span className="font-bold text-slate-800 mt-1 block">
                      {devis.client.nom} {devis.structure ? `(${devis.structure})` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Mail size={16} className="text-slate-400" />
                    <span className="font-medium text-slate-600">{devis.client.email}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Phone size={16} className="text-slate-400" />
                    <span className="font-medium text-slate-600">{devis.client.telephone}</span>
                  </div>
                </div>
              </div>

              {/* Price Details */}
              <div className="bg-[#004B93]/5 rounded-2xl border border-[#004B93]/10 p-6 space-y-4">
                <h3 className="text-lg font-black text-[#004B93] uppercase tracking-tight pb-3 border-b border-[#004B93]/10 flex items-center gap-2">
                  <CreditCard className="text-[#004B93]" size={20} />
                  Détails Financiers
                </h3>

                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                    <span>Montant total du séjour</span>
                    <span>{devis.prixTotal.toFixed(2)} €</span>
                  </div>

                  <div className="flex justify-between items-center text-sm font-black text-[#004B93] bg-[#004B93]/10 p-3 rounded-xl">
                    <span>Acompte à payer (30%)</span>
                    <span>{(devis.prixTotal * 0.3).toFixed(2)} €</span>
                  </div>

                  <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                    <span>Solde restant (70%)</span>
                    <span>{(devis.prixTotal * 0.7).toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Occupants Form */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Liste des Occupants</h3>
                    <p className="text-slate-500 text-xs mt-1">Veuillez compléter l'identité de l'ensemble des voyageurs de votre groupe.</p>
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
                                placeholder={occ.estAdulte ? "Nom de famille" : "Nom (optionnel)"} 
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
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Âge <span className="text-red-500">*</span></label>
                              <input 
                                required 
                                type="number" 
                                min="0" 
                                max={occ.estAdulte ? "120" : "17"} 
                                placeholder="Âge" 
                                value={occ.age} 
                                onChange={(e) => {
                                  const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                  handleOccupantChange(idx, 'age', val);
                                }} 
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] bg-white outline-none text-sm transition-all" 
                              />
                            </div>
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
                        Redirection vers le paiement...
                      </>
                    ) : (
                      <>
                        <CreditCard size={20} />
                        Valider et payer l'acompte ({(devis.prixTotal * 0.3).toFixed(2)} €)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
          </form>
        )}
      </div>
      {status === 'success' && (
        <div className="fixed inset-0 w-screen h-screen bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-100">
            <div className="bg-green-100 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-green-600 mb-5">
              <CheckCircle size={44} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">Devis Validé !</h2>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Votre devis a été validé avec succès. Votre séjour est maintenant officiellement enregistré et planifié dans notre gîte. Un e-mail de confirmation contenant les détails vous a été envoyé.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevisValidate;

