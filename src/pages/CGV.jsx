import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CGV = () => {
  return (
    <div className="min-h-screen bg-muc-blue text-white py-20 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all mb-8 font-bold uppercase tracking-widest text-sm">
          <ArrowLeft size={20} /> Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter">Conditions Générales de Vente et de Location</h1>
        <p className="text-slate-400 mb-12">Gîte de la Maladrerie - Version 1.7 - Mai 2026</p>
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">1. Réservation et Paiement de l'acompte</h2>
            <p>Pour valider toute réservation, un acompte de 30 % du montant total doit être réglé selon les modalités suivantes :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Lien de paiement en ligne : règlement à effectuer dans les 48 heures suivant la réception du lien.</li>
              <li>Chèque : en cas de paiement par chèque, celui-ci doit impérativement parvenir à l'établissement dans un délai de 72 heures après la réservation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">2. Règlement du solde</h2>
            <p>Le solde de la prestation peut être réglé par :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Carte bancaire (via lien de paiement).</li>
              <li>Chèque et espèces (à l'arrivée sur les lieux).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">3. Annulation</h2>
            <p>En cas d'annulation de la part du client, les conditions suivantes s'appliquent :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Plus de 30 jours avant l'arrivée : l'acompte de 30 % est restitué au client, déduction faite de 30 € pour frais de dossier et de gestion administrative. Ce montant de frais de dossier ne pourra en aucun cas excéder le montant total de l'acompte versé.</li>
              <li>Moins de 30 jours avant l'arrivée : l'acompte de 30 % reste acquis à l'établissement et ne fera l'objet d'aucun remboursement.</li>
              <li>Non-présentation ou séjour écourté : la totalité du montant du séjour reste due à l'établissement.</li>
            </ul>
            <p className="mt-4">Si l'annulation est du fait de l'établissement, l'intégralité des sommes versées sera remboursée au client.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">4. Pénalités de retard</h2>
            <p>Tout retard de paiement des sommes dues à l'échéance entraînera de plein droit l'application de pénalités de retard. Celles-ci sont calculées sur la base de trois fois le taux d'intérêt légal en vigueur. En sus des indemnités de retard, une indemnité forfaitaire de 40 € pour frais de recouvrement sera exigée (Art. L441-6 du Code de commerce).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">5. Régime fiscal et tarifs</h2>
            <p>Les tarifs appliqués sont ceux indiqués sur le devis accepté par le client ou lors de la réservation en ligne effectuée par ce dernier. Conformément à l'article 293 B du Code Général des Impôts (CGI), la TVA est non applicable sur les prestations fournies par l'association.</p>
            <p className="mt-4"><strong>Taxe de séjour :</strong> en sus du prix de l'hébergement, une taxe de séjour est perçue pour le compte de la collectivité. Son montant est fixé à 4% du prix de la nuitée par personne majeure (dans la limite du plafond légal). Elle sera calculée lors de la facturation finale.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">6. Dépôt de garantie (Caution)</h2>
            <p>Une empreinte bancaire d'un montant de 500 € est requise avant l'entrée dans les lieux. Cette somme n'est pas débitée au moment de la saisie, mais bloquée temporairement. Cette caution est destinée à couvrir :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>D'éventuels dommages ou dégradations constatés sur le bâtiment ou le matériel.</li>
              <li>Les manquements au règlement intérieur.</li>
              <li>Les frais de remise en état ou de ménage si les locaux ne sont pas rendus propres.</li>
            </ul>
            <p className="mt-4">La direction se réserve le droit de conserver tout ou partie de cette somme en fonction de l'état des lieux de sortie. La caution sera intégralement libérée dans un délai de 30 jours après le départ, déduction faite des éventuels frais de réparation ou d'indemnisation.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">7. État des lieux et inventaire</h2>
            <p>Le présent contrat est complété par un état des lieux et un inventaire du matériel joint en annexe. Il appartient aux occupants de vérifier l'exactitude de ces documents dès leur arrivée. Tout écart ou anomalie constaté doit impérativement être signalé dans les premières heures de l'entrée dans les lieux. Passé ce délai, toute dégradation ou manque constaté lors du départ pourra faire l'objet d'une retenue sur le dépôt de garantie.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">8. Respect des lieux et voisinage</h2>
            <p>Le groupe s'engage à respecter la tranquillité des lieux. Les nuisances sonores excessives ou le non-respect des règles de vie commune sont strictement interdits et pourront donner lieu à une retenue sur la caution.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">9. Restauration</h2>
            <p>Pour toute commande de repas, les conditions suivantes s'appliquent :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Les commandes de repas doivent être transmises au plus tard le jeudi pour la semaine suivante.</li>
              <li>La commande de repas est soumise à un minimum de 5 personnes par réservation.</li>
              <li>La commande n'est validée qu'à réception du paiement intégral des repas (100 %) en plus des 30 % d'arrhes de l'hébergement.</li>
              <li>Les repas sont livrés le matin avant 10h (le vendredi pour les week-ends), conditionnés en bacs inox. Ils comprennent une entrée, un plat et un dessert.</li>
              <li>Il n'est pas proposé de paniers repas ni de pique-niques.</li>
              <li><strong>Tarifs adulte :</strong> 6 € (petit-déjeuner), 11.5 € (déjeuner), 14 € (dîner).</li>
              <li><strong>Tarifs enfant moins de 12 ans :</strong> 5 € (petit-déjeuner), 9.5 € (déjeuner), 12 € (dîner).</li>
              <li><strong>Tarifs enfant moins de 5 ans :</strong> 4 € (petit-déjeuner), 8 € (déjeuner), 10 € (dîner).</li>
            </ul>
          </section>
          
          <div className="pt-8 border-t border-white/10 italic text-white/60">
            <p>Le client reconnaît avoir pris connaissance des présentes conditions et les accepte sans réserve.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CGV;
