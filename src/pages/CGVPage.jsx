import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const CGVPage = () => {
  return (
    <div className="min-h-screen bg-muc-blue text-white py-20 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl">
        <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all mb-8 font-bold uppercase tracking-widest text-sm">
          <ArrowLeft size={20} /> Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter">Conditions Générales de Vente et de Location</h1>
        <p className="text-slate-400 mb-12">Gîte de la Maladrerie - Version 1.9 - Mai 2026</p>
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">1. Réservation et Paiement de l'acompte</h2>
            <p>Pour valider toute réservation, un acompte de 30 % du montant total (incluant la totalité du montant des repas commandés) doit être réglé selon les modalités suivantes :</p>
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
              <li>Non-présentation (No-show) ou séjour écourté : la totalité du montant du séjour reste due à l'établissement.</li>
            </ul>
            <p className="mt-4">Si l'annulation est du fait de l'établissement, l'intégralité des sommes versées sera remboursée au client.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">4. Pénalités de retard</h2>
            <p>Tout retard de paiement des sommes dues à l'échéance entraînera de plein droit l'application de pénalités de retard. Celles-ci sont calculées sur la base de trois fois le taux d'intérêt légal en vigueur. En sus des indemnités de retard, une indemnité forfaitaire de 40 € pour frais de recouvrement sera exigée (Art. L441-6 du Code de commerce).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">5. Régime fiscal et tarifs</h2>
            <p>Les tarifs appliqués sont ceux indiqués sur le devis accepté par le client ou lors de la réservation en ligne effectuée par ce dernier. Les tarifs précis des nuitées ne sont pas détaillés dans les présentes conditions générales et figurent directement sur les outils de réservation.</p>
            <p className="mt-4"><strong>Taxe de séjour :</strong> en sus du prix de l'hébergement, une taxe de séjour est perçue pour le compte de la collectivité. Son montant est fixé à 4 % du prix de la nuitée par personne majeure, auquel s'ajoute la taxe additionnelle départementale de 10 % (soit un taux global de 4,4 % du prix de la nuitée par adulte). Elle sera calculée lors de la facturation finale.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">6. Location des salles de formation</h2>
            <p>L'établissement propose la location de deux salles de formation (une salle de 15 personnes et une salle de 12 personnes, équipées de tables, chaises, écran numérique ou vidéoprojecteur, WC et lavabo). Les conditions spécifiques suivantes s'appliquent :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Périodes de location :</strong> Hors vacances scolaires : la location est possible du vendredi au dimanche. Vacances scolaires (zone de Millau) : la location est possible tous les jours de la semaine.</li>
              <li><strong>Horaires et durée de location :</strong> la location d'une salle prend effet de 9h le matin jusqu'à 9h le lendemain matin. Exception faite pour le vendredi hors vacances scolaires, où la salle est disponible à partir de 17h jusqu'au lendemain 9h, comptant pour un jour de location.</li>
              <li><strong>Tarification :</strong> le tarif est fixé à 100 € par jour si les salles sont louées en complément de chambres du gîte. Dans le cas contraire (location des salles seules), le tarif est de 150 € par jour.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">7. Service de restauration</h2>
            <p>L'établissement propose un service de restauration optionnel en partenariat avec la cuisine centrale de la Ville de Millau (produits frais, 63 % bio, partenariats locaux). Les modalités de ce service sont strictes :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Tarifs adulte :</strong> 6 € par petit-déjeuner, 11,50 € par déjeuner, 14 € par dîner.</li>
              <li><strong>Tarifs enfant (&lt; 12 ans) :</strong> 5 € par petit-déjeuner, 9,50 € par déjeuner, 12 € par dîner.</li>
              <li><strong>Tarifs enfant (&lt; 5 ans) :</strong> 4 € par petit-déjeuner, 8 € par déjeuner, 10 € par dîner.</li>
              <li><strong>Organisation :</strong> les repas sont conditionnés en bacs inox et livrés le matin avant 10h (le vendredi pour l'ensemble du week-end). Ils comprennent une entrée, un plat et un dessert. Les paniers-repas et pique-niques ne sont pas proposés.</li>
              <li><strong>Modalités de commande :</strong> les commandes de repas doivent être impérativement transmises et validées au plus tard le jeudi pour la semaine suivante. Passé ce délai, aucune commande ne pourra être enregistrée.</li>
              <li><strong>Condition de validation :</strong> pour que la commande de repas soit transmise au prestataire, le client doit avoir réglé la totalité (100 %) du montant des repas commandés lors du paiement de l'acompte de la réservation. À défaut de paiement dans les délais impartis, la commande de repas est automatiquement annulée.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">8. Dépôt de garantie (Caution)</h2>
            <p>Une empreinte bancaire d'un montant de 500 € est requise avant l'entrée dans les lieux. Cette somme n'est pas débitée au moment de la saisie, mais bloquée temporairement. Cette caution est destinée à couvrir :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>D'éventuels dommages ou dégradations constatés sur le bâtiment ou le matériel.</li>
              <li>Les manquements au règlement intérieur.</li>
              <li>Les frais de remise en état ou de ménage si les locaux ne sont pas rendus propres.</li>
            </ul>
            <p className="mt-4">La direction se réserve le droit de conserver tout ou partie de cette somme en fonction de l'état des lieux de sortie. La caution sera intégralement libérée dans un délai de 30 jours après le départ, déduction faite des éventuels frais de réparation ou d'indemnisation.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">9. État des lieux et inventaire</h2>
            <p>Le présent contrat est complété par un état des lieux et un inventaire du matériel joint en annexe. Il appartient aux occupants de vérifier l'exactitude de ces documents dès leur arrivée. Tout écart ou anomalie constaté doit impérativement être signalé dans les premières heures de l'entrée dans les lieux. Passé ce délai, toute dégradation ou manque constaté lors du départ pourra faire l'objet d'une retenue sur le dépôt de garantie.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">10. Respect des lieux et voisinage</h2>
            <p>Le groupe s'engage à respecter la tranquillité des lieux. Les nuisances sonores excessives ou le non-respect des règles de vie commune sont strictement interdits et pourront donner lieu à une retenue sur la caution.</p>
          </section>
          
          <div className="pt-8 border-t border-white/10 italic text-white/60">
            <p>Le client reconnaît avoir pris connaissance des présentes conditions et les accepte sans réserve.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CGVPage;
