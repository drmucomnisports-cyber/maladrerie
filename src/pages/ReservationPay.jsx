import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Calendar, Users, CreditCard, Info, ShieldCheck, Mail, AlertTriangle, Landmark, CheckCircle2, Copy, Check } from 'lucide-react';
import { API_URL } from '../config';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 7, etage: '2e étage' },
  5: { num: 5, name: 'Grande chambre', lits: 7, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const ReservationPay = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const typeParam = searchParams.get('type') || 'acompte'; // acompte, solde, totalite

  const [status, setStatus] = useState('loading'); // loading, choice, virement_success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [reservation, setReservation] = useState(null);
  const [paymentType, setPaymentType] = useState(typeParam); // acompte, solde, totalite
  const [paymentMethod, setPaymentMethod] = useState('stripe'); // stripe, virement
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Virement details from server after confirmation
  const [virementInfo, setVirementInfo] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    const fetchReservationInfo = async () => {
      if (!token) {
        setStatus('error');
        setErrorMsg("Le lien de paiement est invalide ou incomplet.");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/payment/info/${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          setReservation(data);
          
          // Auto-adjust payment type based on current reservation status if type param is missing
          if (!searchParams.get('type')) {
            if (data.statutPaiement === 'ACOMPTE_PAYE') {
              setPaymentType('solde');
            } else {
              setPaymentType('acompte');
            }
          }
          setStatus('choice');
        } else {
          let msg = "Impossible de récupérer les détails de la réservation.";
          try {
            const errData = await res.json();
            msg = errData.error || msg;
          } catch (_) {}
          setStatus('error');
          setErrorMsg(msg);
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setErrorMsg("Une erreur réseau s'est produite. Veuillez réessayer.");
      }
    };

    fetchReservationInfo();
  }, [token, searchParams]);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      if (paymentMethod === 'stripe') {
        const res = await fetch(`${API_URL}/api/payment/stripe/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: paymentType })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            window.location.href = data.url;
          } else {
            throw new Error("URL de redirection Stripe manquante.");
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          setErrorMsg(errData.error || "Erreur lors de l'initialisation du paiement Stripe.");
          setIsSubmitting(false);
        }
      } else {
        // Virement bancaire
        const res = await fetch(`${API_URL}/api/payment/virement/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: paymentType })
        });
        if (res.ok) {
          const data = await res.json();
          setVirementInfo(data);
          setStatus('virement_success');
        } else {
          const errData = await res.json().catch(() => ({}));
          setErrorMsg(errData.error || "Erreur lors de l'enregistrement du virement.");
          setIsSubmitting(false);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Une erreur est survenue lors de l'opération. Veuillez vérifier votre connexion.");
      setIsSubmitting(false);
    }
  };

  const getAmountToPay = () => {
    if (!reservation) return 0;
    if (paymentType === 'acompte') {
      const repasTotal = calculerTotalRepas(reservation.repas);
      const montantHebergement = Math.max(0, (reservation.prixTotal || 0) - repasTotal);
      return reservation.montantAcompte || Math.round((montantHebergement * 0.3 + repasTotal) * 100) / 100;
    } else if (paymentType === 'solde') {
      return reservation.montantSolde || ((reservation.prixTotal || 0) - (reservation.montantAcompte || 0));
    } else {
      return reservation.prixTotal || 0;
    }
  };

  const calculerTotalRepas = (repas) => {
    if (!repas) return 0;
    let total = 0;
    Object.values(repas).forEach(r => {
      if (r) {
        total += (r.pensionComplete || 0) * 35;
        total += (r.demiPension || 0) * 25;
        total += (r.petitDejeuner || 0) * 8;
        total += (r.repasSeul || 0) * 15;
      }
    });
    return total;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getNuitsCount = () => {
    if (!reservation?.dateDebut || !reservation?.dateFin) return 0;
    const start = new Date(reservation.dateDebut);
    const end = new Date(reservation.dateFin);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  const getPaymentLabel = () => {
    if (paymentType === 'acompte') return "Acompte (30% Hébergement + 100% Repas)";
    if (paymentType === 'solde') return "Solde Restant (70%)";
    return "Totalité du Séjour (100%)";
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-[#004B93] text-white py-12 px-6 shadow-md">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <span className="bg-[#FFD700] text-[#004B93] text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-widest block w-fit mb-3">
              Gîte de la Maladrerie
            </span>
            <h1 className="text-3xl font-black tracking-tight uppercase">Règlement de votre Séjour</h1>
            <p className="text-slate-200 mt-2 font-medium max-w-xl text-sm leading-relaxed">
              Sécurisez vos dates de réservation en effectuant le règlement en ligne par carte bancaire ou par virement bancaire sans frais.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8">
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 size={60} className="text-[#004B93] animate-spin" />
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Récupération des détails...</h2>
          </div>
        )}

        {status === 'error' && (
          <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl p-10 text-center border-t-8 border-red-500 mt-10">
            <div className="bg-red-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-red-600 mb-6">
              <AlertTriangle size={50} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Lien Invalide</h2>
            <p className="text-red-600 font-medium bg-red-50/50 p-4 rounded-xl border border-red-100/50 text-sm mb-6 leading-relaxed">
              {errorMsg}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg text-xs"
            >
              Retour à l'accueil
            </button>
          </div>
        )}

        {status === 'choice' && reservation && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* Left side: Reservation Summary */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                <h3 className="text-md font-black text-slate-800 uppercase tracking-tight pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Calendar className="text-[#004B93]" size={18} />
                  Votre Réservation
                </h3>

                <div className="space-y-4 text-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Client / Organisme</span>
                    <span className="font-bold text-slate-700 block mt-0.5">
                      {reservation.clientNom} {reservation.structure ? `(${reservation.structure})` : ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Dates du séjour</span>
                    <span className="font-bold text-slate-700 block mt-0.5">
                      Du {formatDate(reservation.dateDebut)}
                    </span>
                    <span className="font-bold text-slate-700 block">
                      au {formatDate(reservation.dateFin)}
                    </span>
                    <span className="inline-block mt-1 bg-blue-50 text-[#004B93] text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                      {getNuitsCount()} nuit(s)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Chambres</span>
                    <div className="flex flex-wrap gap-1">
                      {reservation.chambres.map(chId => (
                        <span key={chId} className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-1 rounded-md">
                          Ch. {chId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Details card */}
              <div className="bg-[#004B93]/5 rounded-2xl border border-[#004B93]/10 p-6 space-y-4">
                <h3 className="text-md font-black text-[#004B93] uppercase tracking-tight pb-3 border-b border-[#004B93]/10 flex items-center gap-2">
                  <Info className="text-[#004B93]" size={18} />
                  Tarification du séjour
                </h3>
                <div className="space-y-3.5 text-sm">
                  <div className="flex justify-between items-center text-slate-600 font-medium">
                    <span>Montant total du séjour</span>
                    <span className="font-bold">{reservation.prixTotal?.toFixed(2)} €</span>
                  </div>

                  <div className="flex justify-between items-center text-[#004B93] bg-[#004B93]/10 p-3 rounded-xl font-bold">
                    <span>Règlement demandé :</span>
                    <span className="font-black text-md">{getAmountToPay().toFixed(2)} €</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold block text-right uppercase tracking-wider">
                    {getPaymentLabel()}
                  </span>
                </div>
              </div>
            </div>

            {/* Right side: Payment Method Choice */}
            <div className="lg:col-span-3">
              <form onSubmit={handlePay} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Moyens de paiement</h3>
                  <p className="text-xs text-slate-500 mt-1">Sélectionnez le mode de règlement de votre choix.</p>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800">
                    <AlertTriangle className="shrink-0 text-red-600 mt-0.5" size={18} />
                    <p className="text-xs font-bold">{errorMsg}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Option Stripe */}
                  <label className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${paymentMethod === 'stripe' ? 'bg-blue-50/40 border-[#004B93]' : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'}`}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="stripe"
                      checked={paymentMethod === 'stripe'}
                      onChange={() => setPaymentMethod('stripe')}
                      className="accent-[#004B93] w-5 h-5 mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CreditCard size={18} className="text-[#004B93]" />
                        <span className="font-black text-slate-800 text-sm uppercase tracking-tight">Carte Bancaire (Stripe)</span>
                      </div>
                      <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                        Règlement immédiat et sécurisé par carte bancaire. Votre séjour est validé instantanément dans notre système.
                      </span>
                    </div>
                  </label>

                  {/* Option Virement */}
                  <label className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${paymentMethod === 'virement' ? 'bg-blue-50/40 border-[#004B93]' : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'}`}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="virement"
                      checked={paymentMethod === 'virement'}
                      onChange={() => setPaymentMethod('virement')}
                      className="accent-[#004B93] w-5 h-5 mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Landmark size={18} className="text-[#004B93]" />
                        <span className="font-black text-slate-800 text-sm uppercase tracking-tight">Virement Bancaire (Sans Frais)</span>
                      </div>
                      <span className="block text-xs text-slate-500 mt-1 leading-relaxed">
                        Idéal pour les structures professionnelles, collectivités ou associations. Le RIB et une référence unique de paiement vous seront fournis.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex items-start gap-2.5 text-xs text-slate-500 font-medium leading-relaxed">
                    <ShieldCheck className="shrink-0 text-[#004B93] mt-0.5" size={16} />
                    <p>Vos données de réservation sont cryptées et stockées de manière sécurisée.</p>
                  </div>

                  <button 
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full py-4 bg-[#FFD700] hover:bg-[#FCD34D] text-[#004B93] font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-xl hover:scale-[1.01]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin text-[#004B93]" size={18} />
                        Traitement en cours...
                      </>
                    ) : paymentMethod === 'stripe' ? (
                      <>
                        <CreditCard size={18} />
                        Payer {getAmountToPay().toFixed(2)} € par Carte
                      </>
                    ) : (
                      <>
                        <Landmark size={18} />
                        Confirmer mon intention de virement
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {status === 'virement_success' && virementInfo && (
          <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl p-8 md:p-10 border-t-8 border-blue-600 mt-5">
            <div className="bg-blue-50 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-blue-600 mb-6 border border-blue-100">
              <Landmark size={36} />
            </div>
            
            <h2 className="text-2xl font-black text-center text-slate-800 uppercase tracking-tight mb-2">Virement Enregistré !</h2>
            <p className="text-slate-600 text-center text-sm mb-8 leading-relaxed max-w-md mx-auto">
              Votre intention de virement a bien été prise en compte. Pour valider définitivement votre paiement, effectuez le virement bancaire avec les coordonnées ci-dessous :
            </p>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-5 text-sm">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200 border-dashed">
                <span className="font-bold text-slate-500 uppercase text-xs">Montant à transférer</span>
                <span className="font-black text-xl text-[#004B93]">{virementInfo.amount?.toFixed(2)} €</span>
              </div>

              {/* Reference */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Libellé / Référence du virement</span>
                  <span className="text-slate-400 text-[10px] block italic leading-tight">⚠️ À insérer obligatoirement dans l'intitulé de votre virement</span>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-amber-800 font-black tracking-wider text-sm select-all">
                  <span>{virementInfo.reference}</span>
                  <button 
                    onClick={() => copyToClipboard(virementInfo.reference, 'ref')}
                    className="text-amber-600 hover:text-amber-800 transition-colors p-1"
                    title="Copier la référence"
                  >
                    {copiedField === 'ref' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Bank Details */}
              <div className="pt-3 border-t border-slate-200 border-dashed space-y-4">
                <span className="font-black text-slate-800 uppercase text-xs block">Coordonnées Bancaires</span>
                
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Titulaire du compte</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-bold text-slate-700">{virementInfo.bankDetails?.holder}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Nom de la Banque</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-bold text-slate-700">{virementInfo.bankDetails?.bankName}</span>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">IBAN</span>
                    <div className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono text-slate-800 font-bold mt-0.5 select-all">
                      <span>{virementInfo.bankDetails?.iban}</span>
                      <button 
                        onClick={() => copyToClipboard(virementInfo.bankDetails?.iban, 'iban')}
                        className="text-slate-500 hover:text-slate-800 transition-colors p-1"
                        title="Copier l'IBAN"
                      >
                        {copiedField === 'iban' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Code BIC / SWIFT</span>
                    <div className="flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-xl font-mono text-slate-800 font-bold mt-0.5 select-all">
                      <span>{virementInfo.bankDetails?.bic}</span>
                      <button 
                        onClick={() => copyToClipboard(virementInfo.bankDetails?.bic, 'bic')}
                        className="text-slate-500 hover:text-slate-800 transition-colors p-1"
                        title="Copier le BIC"
                      >
                        {copiedField === 'bic' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-500 font-medium leading-relaxed bg-blue-50/50 p-4 border border-blue-100/50 rounded-2xl">
                <Mail className="shrink-0 text-blue-600 mt-0.5" size={16} />
                <div>
                  <p className="font-bold text-blue-900">Un e-mail de confirmation vous a été envoyé !</p>
                  <p className="mt-0.5">Il contient ces coordonnées bancaires ainsi que le récapitulatif de votre virement pour que vous puissiez le faire à tout moment.</p>
                </div>
              </div>

              <button 
                onClick={() => navigate('/')}
                className="w-full py-4 bg-[#004B93] hover:bg-blue-800 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg text-xs"
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReservationPay;
