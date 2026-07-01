import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Users, AlertTriangle, CheckCircle, ShieldCheck, Calendar, FileText, Edit3, X, Check, Clock } from 'lucide-react';
import { API_URL } from '../config';
import SignaturePad from '../components/SignaturePad';

const FichePoliceSign = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading, form, success, error
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reservation, setReservation] = useState(null);
  
  // Occupant en cours de signature
  const [activeOccupant, setActiveOccupant] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [ficheForm, setFicheForm] = useState({
    nom: '',
    prenom: '',
    dateNaissance: '',
    lieuNaissance: '',
    nationalite: 'Française',
    domicile: '',
    telephone: '',
    email: '',
    dateArrivee: '',
    dateDepart: '',
    signature: null
  });

  const fetchPoliceInfo = async () => {
    if (!token) {
      setStatus('error');
      setMessage("Le lien de signature est invalide ou incomplet. Aucun token n'a été trouvé dans l'URL.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/reservation/police-info/${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
        setStatus('form');
      } else {
        const errData = await res.json().catch(() => ({}));
        setStatus('error');
        setMessage(errData.error || `Erreur lors de la récupération des détails (HTTP ${res.status}).`);
      }
    } catch (err) {
      console.error("Erreur réseau chargement police info:", err);
      setStatus('error');
      setMessage("Impossible de contacter le serveur. Vérifiez votre connexion internet.");
    }
  };

  useEffect(() => {
    fetchPoliceInfo();
  }, [token]);

  const handleSubmitFiche = async (e) => {
    e.preventDefault();
    if (!ficheForm.signature) {
      setErrorMsg("La signature manuscrite est obligatoire pour valider la fiche.");
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const isDummy = activeOccupant.id === 'client-dummy';
      const occupantIdVal = isDummy ? null : activeOccupant.id;

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

      const res = await fetch(`${API_URL}/api/reservation/police-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedRes = await res.json();
        setReservation(updatedRes);
        setActiveOccupant(null);
        alert("Votre fiche de police a été enregistrée avec succès !");
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || "Une erreur est survenue lors de la sauvegarde.");
      }
    } catch (err) {
      console.error("Erreur réseau enregistrement fiche police:", err);
      setErrorMsg("Erreur réseau : impossible de soumettre la fiche.");
    } finally {
      setIsSaving(false);
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
        <h1 className="text-3xl font-black tracking-tight uppercase">Fiches Individuelles de Police</h1>
        <p className="text-slate-200 mt-2 font-medium max-w-xl mx-auto text-sm leading-relaxed">
          Réglementation touristique obligatoire en France. Veuillez remplir et émarger une fiche pour chaque occupant étranger ou de votre groupe.
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
          <div className="space-y-6">
            {/* Stay Info Recap */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                <Calendar className="text-[#004B93]" size={20} />
                Votre Séjour
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Groupe / Réservataire</span>
                  <span className="text-slate-800 font-bold text-sm block mt-0.5">{reservation.client?.nom}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Dates du séjour</span>
                  <span className="text-slate-800 font-bold text-sm block mt-0.5">
                    Du {formatDate(reservation.dateDebut)} au {formatDate(reservation.dateFin)}
                  </span>
                </div>
              </div>
            </div>

            {activeOccupant ? (
              /* Signature Form */
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Remplir & Signer la Fiche</h3>
                    <p className="text-slate-500 text-xs mt-1">Voyageur : {activeOccupant.nom} {activeOccupant.prenom}</p>
                  </div>
                  <button 
                    onClick={() => { setActiveOccupant(null); setErrorMsg(''); }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={24} />
                  </button>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800">
                    <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
                    <p className="text-xs font-bold">{errorMsg}</p>
                  </div>
                )}

                <form onSubmit={handleSubmitFiche} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nom</label>
                      <input 
                        type="text" 
                        value={ficheForm.nom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, nom: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Prénom</label>
                      <input 
                        type="text" 
                        value={ficheForm.prenom} 
                        onChange={(e) => setFicheForm({ ...ficheForm, prenom: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Date de naissance</label>
                      <input 
                        type="date" 
                        value={ficheForm.dateNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, dateNaissance: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Lieu de naissance</label>
                      <input 
                        type="text" 
                        value={ficheForm.lieuNaissance} 
                        onChange={(e) => setFicheForm({ ...ficheForm, lieuNaissance: e.target.value })}
                        placeholder="Ex: Barcelone, Espagne"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
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
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Téléphone mobile</label>
                      <input 
                        type="tel" 
                        value={ficheForm.telephone} 
                        onChange={(e) => setFicheForm({ ...ficheForm, telephone: e.target.value })}
                        placeholder="+33..."
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Adresse e-mail</label>
                      <input 
                        type="email" 
                        value={ficheForm.email} 
                        onChange={(e) => setFicheForm({ ...ficheForm, email: e.target.value })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Domicile habituel</label>
                      <input 
                        type="text" 
                        value={ficheForm.domicile} 
                        onChange={(e) => setFicheForm({ ...ficheForm, domicile: e.target.value })}
                        placeholder="Adresse complète, Code postal, Ville, Pays"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium"
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
                      onClick={() => setActiveOccupant(null)}
                      className="flex-1 py-4 text-sm font-black uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !ficheForm.signature}
                      className="flex-1 py-4 text-sm font-black uppercase tracking-wider text-[#004B93] bg-[#FFD700] hover:bg-[#FCD34D] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-2xl transition-all flex justify-center items-center gap-2 shadow-lg"
                    >
                      {isSaving ? 'Enregistrement...' : 'Signer ma Fiche'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Occupants List */
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Liste des Voyageurs</h3>
                  <p className="text-slate-500 text-xs mt-1">Sélectionnez un voyageur pour remplir et signer sa fiche de police individuelle :</p>
                </div>

                <div className="space-y-4">
                  {((reservation.occupants || []).length > 0 ? reservation.occupants : [
                    { id: 'client-dummy', nom: reservation.client?.nom?.split(' ')[0] || 'Client', prenom: reservation.client?.nom?.split(' ')[1] || 'Réservataire', estAdulte: true }
                  ]).map((occ) => {
                    const existingFiche = (reservation.fichesPolice || []).find(
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
                            <div className="text-xs text-emerald-600 font-bold flex items-center gap-1 mt-1">
                              <CheckCircle size={14} className="text-emerald-500" /> Fiche signée le {new Date(existingFiche.signedAt).toLocaleDateString('fr-FR')}
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600 font-semibold flex items-center gap-1 mt-1">
                              <Clock size={14} className="text-amber-500" /> En attente de signature
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {existingFiche ? (
                            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold flex items-center gap-1">
                              <Check size={14} /> Signée
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setFicheForm({
                                  nom: occ.nom !== 'Mineur' ? occ.nom : '',
                                  prenom: occ.prenom,
                                  dateNaissance: '',
                                  lieuNaissance: '',
                                  nationalite: occ.nationalite === 'Française' ? 'Française' : (occ.nationalite === 'Étrangère' ? '' : 'Française'),
                                  domicile: reservation.client?.adressePostale || '',
                                  telephone: reservation.client?.telephone || '',
                                  email: reservation.client?.email || '',
                                  dateArrivee: reservation.dateDebut.split('T')[0],
                                  dateDepart: reservation.dateFin.split('T')[0],
                                  signature: null
                                });
                                setActiveOccupant(occ);
                              }}
                              className="px-3.5 py-2 bg-muc-blue text-white hover:bg-blue-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                            >
                              <Edit3 size={14} /> Remplir & Signer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500 font-medium leading-relaxed">
                  <ShieldCheck className="shrink-0 text-[#004B93] mt-0.5" size={16} />
                  <p>Vos données sont protégées et cryptées. Les informations d'identité sont récoltées uniquement à des fins administratives réglementaires.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FichePoliceSign;
