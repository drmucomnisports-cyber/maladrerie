import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const MentionsLegales = () => {
  return (
    <div className="min-h-screen bg-muc-blue text-white py-20 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all mb-8 font-bold uppercase tracking-widest text-sm">
          <ArrowLeft size={20} /> Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-black mb-12 uppercase tracking-tighter">Mentions Légales</h1>
        
        <div className="space-y-12 text-white/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Éditeur du site</h2>
            <p>Le présent site internet est édité par l'association <strong>MUC Omnisports</strong>.</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Siège social : 150 rue François Joseph Gossec - Complexe Sportif Albert Batteux, 34070 Montpellier.</li>
              <li>Téléphone : 04 99 58 35 35.</li>
              <li>Email : administration@mucomnisports.fr.</li>
              <li>SIRET : 38820857100025.</li>
              <li>N° d'Activité : 91-34-05799-34.</li>
              <li>Directeur de la publication : David Roujet.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Hébergement</h2>
            <p>Le site est hébergé par la société <strong>Railway Corp</strong>.</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Siège social : 2261 Market Street #4659, San Francisco, CA 94114, États-Unis.</li>
              <li>Site web : https://railway.com.</li>
              <li>Contact : support@railway.app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Assurance</h2>
            <p>L'activité de l'association est couverte par une police d'assurance responsabilité civile souscrite auprès de la <strong>MAIF</strong> sous le numéro 132 48 45 M.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MentionsLegales;
