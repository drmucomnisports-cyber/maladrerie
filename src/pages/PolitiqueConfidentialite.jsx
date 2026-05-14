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
            <p>Dans le cadre de la gestion du Gîte de la Maladrerie, le MUC Omnisports traite des données à caractère personnel. Nous nous engageons à ce que la collecte et le traitement de vos données soient conformes au Règlement Général sur la Protection des Données (RGPD).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Données collectées</h2>
            <p>Nous collectons uniquement les données nécessaires à la gestion de vos réservations et séjours :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Identité (nom, prénom) et coordonnées (e-mail, téléphone) du responsable.</li>
              <li>Informations de paiement et données relatives à l'empreinte bancaire pour la caution de 500 €.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Finalités du traitement</h2>
            <p>Vos données sont utilisées exclusivement pour :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>La gestion administrative des réservations et la facturation.</li>
              <li>Le suivi des états des lieux et la gestion de la garantie (caution).</li>
              <li>La communication liée à votre séjour.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Destinataires et Transfert des données</h2>
            <p>Les données sont destinées aux services habilités du MUC Omnisports (notamment l'administration et la gestion du gîte par David Roujet).</p>
            <p className="mt-4 text-xs italic">Le site étant hébergé par Railway Corp. aux États-Unis, les transferts de données hors Union Européenne sont encadrés par des clauses contractuelles types afin de garantir un niveau de protection conforme au RGPD.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Durée de conservation</h2>
            <p>Vos données sont conservées pendant la durée de la relation contractuelle et selon les obligations légales de conservation des pièces comptables.</p>
            <p className="mt-4">Les données concernant l'empreinte bancaire de 500 € sont libérées dans un délai maximal de 30 jours après l'état des lieux de sortie.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">Vos droits</h2>
            <p>Conformément à la loi « Informatique et Libertés », vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données. Vous pouvez exercer ces droits en contactant : <strong>administration@mucomnisports.fr</strong>.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PolitiqueConfidentialite;
