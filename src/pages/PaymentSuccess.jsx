import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Calendar, ShieldCheck, Home, ArrowRight, Info, AlertCircle, FileText } from 'lucide-react';
import { API_URL } from '../config';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);

  useEffect(() => {
    const fetchPaymentStatus = async () => {
      if (!sessionId) {
        setError("Aucun identifiant de session de paiement n'a été fourni.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/stripe/session-status/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setPaymentInfo(data);
        } else {
          const errData = await response.json().catch(() => ({}));
          setError(errData.error || "Impossible de récupérer les détails du paiement.");
        }
      } catch (err) {
        console.error("Erreur récupération statut paiement:", err);
        setError("Une erreur réseau s'est produite lors de la validation du paiement.");
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentStatus();
  }, [sessionId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 font-sans">
        <Loader2 size={50} className="text-[#004B93] animate-spin mb-4" />
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Validation du paiement...</h2>
        <p className="text-slate-500 text-sm mt-1">Veuillez patienter pendant que nous confirmons la transaction auprès de Stripe.</p>
      </div>
    );
  }

  if (error || !paymentInfo) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border-t-8 border-red-500">
          <div className="bg-red-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto text-red-600 mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-3">Erreur de Confirmation</h2>
          <p className="text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-100 text-sm mb-6">
            {error || "Une erreur inconnue s'est produite."}
          </p>
          <button 
            onClick={() => navigate('/')}
            className="w-full py-4 bg-[#004B93] text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg text-sm"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const { paymentStatus, amountTotal, paymentType, customerDetails, reservation } = paymentInfo;
  const isPaid = paymentStatus === 'paid' || paymentStatus === 'no_payment_required';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Header Banner */}
      <div className="bg-[#004B93] text-white py-12 px-6 shadow-md text-center">
        <span className="bg-[#FFD700] text-[#004B93] text-xs font-black uppercase px-3 py-1.5 rounded-full tracking-widest inline-block mb-3">
          Gîte de la Maladrerie
        </span>
        <h1 className="text-3xl font-black tracking-tight uppercase">Confirmation de Paiement</h1>
        <p className="text-slate-200 mt-2 font-medium max-w-xl mx-auto text-sm leading-relaxed">
          Merci pour votre confiance. Retrouvez ci-dessous le détail et le statut de votre transaction.
        </p>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto p-6 md:p-8">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
          {/* Status Section */}
          <div className="p-8 text-center border-b border-slate-100">
            <div className="bg-green-100 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-green-600 mb-5">
              <CheckCircle2 size={44} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
              {paymentType === 'caution' ? "Empreinte Bancaire Enregistrée !" : "Paiement Validé avec Succès !"}
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">
              Transaction traitée en toute sécurité via Stripe.
            </p>
          </div>

          {/* Details & Messages based on Payment Type */}
          <div className="p-8 space-y-6">
            
            {paymentType === 'caution' ? (
              // Case 1: Caution (Security Deposit)
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-[#004B93]/5 border border-[#004B93]/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-[#004B93]/10">
                    <ShieldCheck className="text-[#004B93]" size={22} />
                    <h3 className="text-lg font-black text-[#004B93] uppercase tracking-tight">Dépôt de Garantie (Caution)</h3>
                  </div>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p className="font-bold text-slate-800 text-base">
                      Montant de la pré-autorisation : <span className="text-[#004B93] font-black">{(500).toFixed(2)} €</span>
                    </p>
                    <p className="bg-blue-50 text-[#004B93] p-3.5 rounded-xl border border-blue-100/50 text-xs font-bold leading-relaxed">
                      💡 <strong>Aucun débit immédiat :</strong> Cette somme n'est pas débitée de votre compte à ce jour, il s'agit uniquement d'une empreinte bancaire (autorisation temporaire de blocage de fonds).
                    </p>
                    <div className="pt-2">
                      <p className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Cette caution est destinée à couvrir :</p>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 font-medium">
                        <li>D'éventuels dommages ou dégradations constatés sur le bâtiment ou le matériel.</li>
                        <li>Les manquements au règlement intérieur du gîte.</li>
                        <li>Les frais de remise en état ou de ménage si les locaux ne sont pas rendus propres.</li>
                      </ul>
                    </div>
                    <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                      Conformément à l'Article 10 des CGV, l'empreinte bancaire sera intégralement libérée/annulée dans un délai de <strong>30 jours maximum après votre départ</strong>, déduction faite des éventuels frais de réparation ou d'indemnisation si nécessaire.
                    </p>
                  </div>
                </div>
              </div>
            ) : paymentType === 'solde' ? (
              // Case 2: Solde (Balance payment)
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-[#004B93]/5 border border-[#004B93]/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-[#004B93]/10">
                    <ShieldCheck className="text-[#004B93]" size={22} />
                    <h3 className="text-lg font-black text-[#004B93] uppercase tracking-tight">Règlement du Solde</h3>
                  </div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <p className="font-bold text-slate-800 text-base">
                      Montant réglé : <span className="text-[#004B93] font-black">{amountTotal.toFixed(2)} €</span>
                    </p>
                    <p className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl border border-emerald-100/50 text-xs font-bold leading-relaxed">
                      ✅ <strong>Séjour entièrement payé :</strong> Le solde de votre séjour a été validé. Votre réservation pour le Gîte de la Maladrerie est désormais entièrement soldée et confirmée !
                    </p>
                    <div className="pt-2">
                      <p className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Prochaine étape importante :</p>
                      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-bold text-amber-800">
                        <Info className="shrink-0 text-amber-600 mt-0.5" size={18} />
                        <p className="leading-relaxed">
                          Conformément à nos conditions de vente, une empreinte bancaire pour le dépôt de garantie (caution de 500 €) doit être enregistrée avant votre entrée dans les lieux. Si vous ne l'avez pas encore fait, vous recevrez un lien dédié par e-mail quelques jours avant votre arrivée.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Case 3: Acompte / Arrhes (30% deposit)
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-[#004B93]/5 border border-[#004B93]/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-[#004B93]/10">
                    <ShieldCheck className="text-[#004B93]" size={22} />
                    <h3 className="text-lg font-black text-[#004B93] uppercase tracking-tight">Validation de l'Acompte</h3>
                  </div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <p className="font-bold text-slate-800 text-base">
                      Acompte de 30% réglé : <span className="text-[#004B93] font-black">{amountTotal.toFixed(2)} €</span>
                    </p>
                    <p className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl border border-emerald-100/50 text-xs font-bold leading-relaxed">
                      ✅ <strong>Réservation Enregistrée :</strong> Votre acompte a été encaissé avec succès. Vos dates de séjour sont officiellement bloquées et réservées à votre nom !
                    </p>
                    <div className="pt-2">
                      <p className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Prochaines échéances importantes :</p>
                      <ul className="list-decimal pl-5 space-y-2 text-xs text-slate-600 font-medium">
                        <li>
                          <strong>Règlement du solde (70% restant) :</strong> Le solde doit impérativement être réglé au plus tard <strong>7 jours avant votre arrivée</strong>. Vous recevrez un lien de paiement automatique par e-mail à cette date.
                        </li>
                        <li>
                          <strong>Dépôt de garantie (Caution de 500 €) :</strong> Une empreinte bancaire temporaire vous sera demandée par e-mail avant votre entrée dans les lieux (non débitée, libérée sous 30 jours après le départ).
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* General Reservation Recap */}
            {reservation && (
              <div className="border border-slate-100 rounded-2xl p-6 space-y-4 bg-slate-50/50">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 pb-2 border-b border-slate-200/60">
                  <Calendar size={18} className="text-[#004B93]" />
                  Récapitulatif de la Réservation
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                  {reservation.numeroDevis && (
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Référence</span>
                      <span className="text-slate-800 font-bold text-sm block mt-0.5">{reservation.numeroDevis}</span>
                    </div>
                  )}
                  {customerDetails.name && (
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Client</span>
                      <span className="text-slate-800 font-bold text-sm block mt-0.5">{customerDetails.name}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">Date d'arrivée</span>
                    <span className="text-slate-800 font-bold text-sm block mt-0.5">{formatDate(reservation.dateDebut)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 block">Date de départ</span>
                    <span className="text-slate-800 font-bold text-sm block mt-0.5">{formatDate(reservation.dateFin)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Documents Section */}
            {paymentType !== 'caution' && (
              <div className="border border-green-100 rounded-2xl p-6 bg-green-50/20 space-y-4 animate-in fade-in duration-300">
                <h4 className="text-sm font-black text-green-800 uppercase tracking-tight flex items-center gap-2 pb-2 border-b border-green-100">
                  <FileText size={18} className="text-green-700" />
                  Documents de séjour obligatoires
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Votre réservation étant validée, veuillez télécharger et vérifier les documents ci-dessous. En cas d'écart constaté à votre arrivée, merci de nous le signaler rapidement.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <a
                    href={`${API_URL}/api/documents/inventaire`}
                    download
                    className="flex-1 py-3 px-4 bg-white border border-green-200 hover:bg-green-50/50 text-green-800 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    📥 Télécharger l'Inventaire
                  </a>
                  <a
                    href={`${API_URL}/api/documents/etat-des-lieux`}
                    download
                    className="flex-1 py-3 px-4 bg-white border border-green-200 hover:bg-green-50/50 text-green-800 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    📥 Télécharger l'État des lieux
                  </a>
                </div>
              </div>
            )}

            {/* Helpful Actions / Links */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => navigate('/cgv')}
                className="flex-1 py-3 px-4 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                <FileText size={16} />
                Consulter les CGV
              </button>
              <button 
                onClick={() => navigate('/')}
                className="flex-1 py-3 px-4 bg-[#FFD700] hover:bg-[#FCD34D] text-[#004B93] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Home size={16} />
                Retour au site
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
