import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

const DevisValidate = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setStatus('error');
        setMessage("Token de validation manquant.");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/devis/validate/${token}`);
        if (res.ok) {
          setStatus('success');
        } else {
          const text = await res.text();
          setStatus('error');
          setMessage(text || "Erreur lors de la validation du devis.");
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage("Erreur réseau. Impossible de contacter le serveur.");
      }
    };

    validateToken();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center border-t-8 border-muc-blue">
        {status === 'loading' && (
          <div className="space-y-6">
            <Loader2 size={60} className="mx-auto text-muc-blue animate-spin" />
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Validation en cours...</h2>
            <p className="text-slate-500">Veuillez patienter pendant que nous traitons votre devis.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="bg-green-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-green-600">
              <CheckCircle size={50} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Devis Validé !</h2>
            <p className="text-slate-600 leading-relaxed">
              Votre demande a été transmise avec succès. Nos administrateurs vont maintenant traiter votre dossier.
              Vous recevrez prochainement une confirmation par e-mail avec les instructions de paiement.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-muc-blue text-white font-black uppercase tracking-widest rounded-2xl hover:bg-blue-800 transition-all shadow-lg shadow-blue-200"
            >
              Retour à l'accueil
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="bg-red-100 p-6 rounded-full w-24 h-24 flex items-center justify-center mx-auto text-red-600">
              <AlertTriangle size={50} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Erreur</h2>
            <p className="text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-100">
              {message}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-4 bg-slate-100 text-slate-600 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
            >
              Retour à l'accueil
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DevisValidate;
