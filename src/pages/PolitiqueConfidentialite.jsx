import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const PolitiqueConfidentialite = () => {
  return (
    <div className="min-h-screen bg-muc-blue text-white py-20 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all mb-8 font-bold uppercase tracking-widest text-sm">
          <ArrowLeft size={20} /> Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-black mb-12 uppercase tracking-tighter">Politique de Confidentialité</h1>
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Introduction</h2>
            <p>Dans le cadre de la gestion du Gîte de la Maladrerie, le MUC Omnisports traite des données à caractère personnel. Nous nous engageons à ce que la collecte et le traitement de vos données soient conformes au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Collecte des Données</h2>
            <p>Nous collectons les informations nécessaires à la réservation, l'établissement de vos devis et de la facturation. Ces données incluent notamment vos noms, prénoms, adresses e-mail et numéros de téléphone.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Utilisation des Données</h2>
            <p>Les données personnelles recueillies sur notre site sont utilisées uniquement dans le cadre des finalités suivantes :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Traitement et suivi de vos demandes de réservation.</li>
              <li>Échanges administratifs et comptables.</li>
              <li>Amélioration de nos services.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Vos Droits</h2>
            <p>Conformément à la réglementation applicable, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données. Vous pouvez exercer ce droit en nous contactant à l'adresse e-mail suivante : administration@mucomnisports.fr.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PolitiqueConfidentialite;
