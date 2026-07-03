import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, CheckCircle, ShieldCheck, Calendar, FileText, Download, Check, AlertCircle } from 'lucide-react';
import { API_URL } from '../config';
import SignaturePad from '../components/SignaturePad';

const SignInventory = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading'); // loading, form, success, error
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reservation, setReservation] = useState(null);
  
  const [nomSignataire, setNomSignataire] = useState('');
  const [remarques, setRemarques] = useState('');
  const [certified, setCertified] = useState(false);
  const [signature, setSignature] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchLieuxInfo = async () => {
    if (!token) {
      setStatus('error');
      setMessage("Le lien de signature d'état des lieux est invalide ou expiré. Aucun jeton trouvé dans l'URL.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/reservation/lieux-info/${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
        if (data.signatureLieuxDate) {
          setStatus('success');
        } else {
          setNomSignataire(data.client?.nom || '');
          setStatus('form');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setStatus('error');
        setMessage(errData.error || `Erreur lors de la récupération des détails de l'état des lieux (HTTP ${res.status}).`);
      }
    } catch (err) {
      console.error("Erreur réseau chargement lieux info:", err);
      setStatus('error');
      setMessage("Impossible de contacter le serveur. Vérifiez votre connexion internet.");
    }
  };

  useEffect(() => {
    fetchLieuxInfo();
  }, [token]);

  const handleSubmitSignature = async (e) => {
    e.preventDefault();
    if (!certified) {
      setErrorMsg("Vous devez cocher la case d'acceptation de l'état des lieux et de l'inventaire.");
      return;
    }
    if (!nomSignataire.trim()) {
      setErrorMsg("Le nom du signataire est requis.");
      return;
    }
    if (!signature) {
      setErrorMsg("La signature manuscrite est obligatoire.");
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_URL}/api/reservation/lieux-sign/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomSignataire,
          signature,
          remarques
        })
      });

      if (res.ok) {
        const updatedRes = await res.json();
        setReservation(updatedRes);
        setStatus('success');
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || "Une erreur est survenue lors de l'enregistrement de votre signature.");
      }
    } catch (err) {
      console.error("Erreur réseau enregistrement lieux sign:", err);
      setErrorMsg("Erreur réseau : impossible de transmettre la signature.");
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
        <h1 className="text-3xl font-black tracking-tight uppercase">Émargement État des lieux & Inventaire</h1>
        <p className="text-slate-200 mt-2 font-medium max-w-xl mx-auto text-sm leading-relaxed">
          Veuillez relire l'état des lieux et l'inventaire en pièce jointe puis signer électroniquement ci-dessous pour confirmer votre entrée dans le gîte.
        </p>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto p-6 md:p-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 size={50} className="text-[#004B93] animate-spin" />
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Chargement du document...</h2>
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
                Votre Réservation
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Réservataire principal</span>
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

            {/* Document Download Section */}
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-left">
                <div className="bg-[#004B93]/10 p-3 rounded-xl text-[#004B93]">
                  <FileText size={28} />
                </div>
                <div>
                  <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">État des Lieux & Inventaire du Gîte</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Consultez et conservez le document officiel complet en format PDF.</p>
                </div>
              </div>
              <a 
                href={`${API_URL}/api/reservation/lieux-pdf/${token}`} 
                target="_blank" 
                rel="noreferrer"
                className="bg-[#004B93] text-white hover:bg-blue-800 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md cursor-pointer shrink-0"
              >
                <Download size={16} /> Télécharger le PDF
              </a>
            </div>

            {/* Discrepancy Alert */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3 text-amber-900">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs font-medium leading-relaxed">
                <span className="font-bold">Remarque importante :</span> Conformément à nos conditions de location, vous disposez d'un droit de signalement de toute différence constatée entre le gîte et l'état des lieux papier. Veuillez utiliser le champ de remarques ci-dessous si nécessaire.
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitSignature} className="bg-white rounded-2xl border border-slate-100 shadow-xl p-6 md:p-8 space-y-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight pb-4 border-b border-slate-100">
                Signature Électronique
              </h3>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800">
                  <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
                  <p className="text-xs font-bold">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Nom et Prénom du Signataire</label>
                  <input 
                    type="text" 
                    value={nomSignataire} 
                    onChange={(e) => setNomSignataire(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-bold"
                    placeholder="Saisissez votre nom"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">
                    Signaler des différences ou observations (facultatif)
                  </label>
                  <textarea 
                    value={remarques} 
                    onChange={(e) => setRemarques(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-[#004B93] focus:ring-1 focus:ring-[#004B93] outline-none text-sm font-medium h-24 resize-none"
                    placeholder="Ex: Une ampoule grillée dans le salon, une rayure sur le frigo..."
                  />
                </div>

                <div className="flex items-start gap-3 pt-2">
                  <input 
                    type="checkbox" 
                    id="certified"
                    checked={certified}
                    onChange={(e) => setCertified(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-[#004B93] focus:ring-[#004B93] mt-0.5 cursor-pointer"
                  />
                  <label htmlFor="certified" className="text-xs text-slate-600 font-bold leading-relaxed cursor-pointer select-none">
                    Je certifie sur l'honneur avoir pris connaissance de l'inventaire et de l'état des lieux du gîte en pièce jointe, et déclare les accepter et m'engager à respecter les consignes de sécurité et d'usage de la Maladrerie.
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <SignaturePad onSave={setSignature} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSaving || !signature || !certified}
                  className="w-full py-4 text-sm font-black uppercase tracking-wider text-[#004B93] bg-[#FFD700] hover:bg-[#FCD34D] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-2xl transition-all flex justify-center items-center gap-2 shadow-lg cursor-pointer"
                >
                  {isSaving ? 'Enregistrement de la signature...' : '📝 Valider mon émargement d\'état des lieux'}
                </button>
              </div>
            </form>
          </div>
        )}

        {status === 'success' && reservation && (
          <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-emerald-500 mt-10 space-y-6">
            <div className="bg-emerald-100 p-6 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-emerald-600">
              <Check size={40} strokeWidth={3} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Signature Enregistrée !</h2>
              <p className="text-slate-500 text-xs mt-1">L'émargement de l'état des lieux a bien été validé.</p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100 text-xs space-y-2 font-semibold">
              <div className="flex justify-between">
                <span className="text-slate-400">Signataire :</span>
                <span className="text-slate-800 font-bold">{reservation.signatureLieuxNom}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date et heure :</span>
                <span className="text-slate-800 font-bold">
                  {reservation.signatureLieuxDate ? new Date(reservation.signatureLieuxDate).toLocaleString('fr-FR') : ''}
                </span>
              </div>
              {reservation.signatureLieuxObs && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 block mb-1">Différences signalées :</span>
                  <span className="text-slate-800 block bg-white p-2 rounded border border-slate-100 italic">
                    {reservation.signatureLieuxObs}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <a 
                href={`${API_URL}/api/reservation/lieux-pdf/${token}`} 
                target="_blank" 
                rel="noreferrer"
                className="w-full py-3.5 bg-[#004B93] hover:bg-blue-800 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-xs"
              >
                <Download size={16} /> Télécharger le document signé
              </a>
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3 text-slate-500 hover:text-slate-800 font-black uppercase tracking-widest text-xs transition-colors"
              >
                Retourner sur le site
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignInventory;
