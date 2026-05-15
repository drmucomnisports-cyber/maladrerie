import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';

const CGV = () => {
  return (
    <div className="min-h-screen bg-muc-blue text-white py-20 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
        <div className="flex justify-between items-start mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all font-bold uppercase tracking-widest text-sm">
            <ArrowLeft size={20} /> Retour à l'accueil
          </Link>
          <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all">
            <Download size={16} /> Version PDF
          </button>
        </div>
        
        <h1 className="text-4xl font-black mb-12 uppercase tracking-tighter">Conditions Générales de Vente</h1>
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">1. Réservation et Devis</h2>
            <p>Toute demande de réservation fait l'objet d'un devis valable 48 heures. La réservation devient ferme après acceptation du devis et versement d'un acompte de 30% du montant total du séjour.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">2. Conditions de Paiement</h2>
            <p>Le solde du séjour doit être réglé au plus tard à l'arrivée. Les paiements peuvent être effectués par carte bancaire (Stripe), chèque, espèces ou virement.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">3. Caution et Garantie</h2>
            <p>Une empreinte bancaire de 500 € est exigée via la plateforme sécurisée pour couvrir d'éventuels dommages. Cette caution est libérée après l'état des lieux de sortie, sous réserve de l'absence de dégradations.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">4. Annulation</h2>
            <p>En cas d'annulation par le client moins de 15 jours avant l'arrivée, l'acompte de 30% reste acquis à l'association MUC Omnisports.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">5. Obligations de l'Occupant</h2>
            <p>Le gîte est non-fumeur. Les animaux ne sont pas admis sans accord préalable. Le client s'engage à respecter le règlement intérieur et la tranquillité des lieux.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">6. Litiges</h2>
            <p>À défaut d'accord amiable, tout litige relatif à l'interprétation ou à l'exécution des présentes sera de la compétence exclusive des tribunaux de Montpellier.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CGV;
