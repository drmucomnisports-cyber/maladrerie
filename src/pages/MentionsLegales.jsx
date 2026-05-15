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
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Éditeur du site</h2>
            <p>Le présent site internet est édité par l'association MUC Omnisports.</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Siège social :</strong> 150 rue François Joseph Gossec - Complexe Sportif Albert Batteux, 34070 Montpellier.</li>
              <li><strong>Téléphone :</strong> 04 99 58 35 35.</li>
              <li><strong>Email :</strong> administration@mucomnisports.fr.</li>
              <li><strong>SIRET :</strong> 38820857100025.</li>
              <li><strong>N° d'Activité :</strong> 91-34-05799-34.</li>
              <li><strong>Directeur de la publication :</strong> David Roujet.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Hébergement</h2>
            <p>Le site est hébergé par la société Railway Corp.</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Siège social :</strong> 2261 Market Street #4659, San Francisco, CA 94114, États-Unis.</li>
              <li><strong>Site web :</strong> <a href="https://railway.com" className="text-muc-yellow hover:underline" target="_blank" rel="noreferrer">https://railway.com</a>.</li>
              <li><strong>Contact :</strong> support@railway.app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Assurance</h2>
            <p>L'activité de l'association est couverte par une police d'assurance responsabilité civile souscrite auprès de la MAIF sous le numéro 132 48 45 M.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MentionsLegales;
