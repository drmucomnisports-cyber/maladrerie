import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const CGV = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#004B93] text-white pt-24 pb-32">
      <div className="max-w-4xl mx-auto px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-muc-yellow hover:gap-4 transition-all mb-8 font-bold uppercase tracking-widest text-sm">
          <ArrowLeft size={20} /> Retour à l'accueil
        </Link>
        
        <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter">Conditions Générales de Vente et de Location</h1>
        <p className="text-slate-400 mb-12">Gîte de la Maladrerie - Version 2.0 - Juin 2026</p>
        
        <div className="space-y-12 text-white/80 leading-relaxed text-sm">
          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">1. Réservation et Paiement de l'acompte</h2>
            <p>Pour valider toute réservation, un acompte de 30 % du montant total (incluant la totalité du montant des repas commandés) doit être réglé selon les modalités suivantes :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Lien de paiement en ligne :</strong> règlement à effectuer dans les 48 heures suivant la réception du lien.</li>
              <li><strong>Virement bancaire :</strong> règlement à effectuer dans les 48 heures (les coordonnées bancaires seront fournies sur demande).</li>
              <li><strong>Chèque :</strong> le chèque doit impérativement parvenir à l'établissement dans un délai de 72 heures après la réservation. Il doit être libellé à l'ordre du <strong>MUC</strong> et envoyé à l'adresse suivante :</li>
            </ul>
            <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 ml-6 max-w-sm font-medium">
              <p className="font-bold text-muc-yellow">MUC</p>
              <p>Gîte de la Maladrerie</p>
              <p>150 rue François Joseph Gossec</p>
              <p>34070 Montpellier</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">2. Règlement du solde</h2>
            <p>Le solde de la prestation peut être réglé par :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li>Carte bancaire (via lien de paiement en ligne).</li>
              <li>Virement bancaire (reçu au plus tard avant l'arrivée).</li>
              <li>Espèces (uniquement à l'arrivée sur les lieux).</li>
              <li>Chèque (libellé à l'ordre du <strong>MUC</strong> et envoyé à l'adresse mentionnée à l'article 1 suffisamment à l'avance pour être encaissé avant le séjour, ou remis à l'arrivée).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">3. Annulation</h2>
            <p>En cas d'annulation de la part du client, les conditions suivantes s'appliquent :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside">
              <li><strong>Plus de 30 jours avant l'arrivée :</strong> l'acompte de 30 % est restitué au client, déduction faite de 30 € pour frais de dossier et de gestion administrative. Ce montant de frais de dossier ne pourra en aucun cas excéder le montant total de l'acompte versé.</li>
              <li><strong>Moins de 30 jours avant l'arrivée :</strong> l'acompte de 30 % reste acquis à l'établissement et ne fera l'objet d'aucun remboursement.</li>
              <li><strong>Non-présentation (No-show) ou séjour écourté :</strong> la totalité du montant du séjour reste due à l'établissement.</li>
            </ul>
            <p className="mt-4">Si l'annulation est du fait de l'établissement, l'intégralité des sommes versées sera remboursée au client.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">4. Modification de séjour</h2>
            <ul className="space-y-3 list-none">
              <li><strong>Diminution du séjour :</strong> aucune demande de réduction de la durée du séjour ou de modification des dates à la baisse ne pourra être acceptée à moins de 30 jours de la date d’arrivée prévue. La totalité des nuitées initialement réservées restera exigible.</li>
              <li><strong>Ajout de prestations / voyageurs :</strong> toute demande d'ajout (voyageurs supplémentaires, options, repas) est réalisable sous réserve de disponibilité de l'établissement, jusqu'à 72 heures avant votre arrivée.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">5. Modalités d'arrivée et de départ</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Horaires d'arrivée :</strong> les chambres sont disponibles à partir de 17h. Les arrivées doivent s'effectuer avant 19h. En cas d'imprévu ou d'arrivée tardive, le client est tenu d'en informer la direction dès que possible.</li>
              <li><strong>Horaire de départ :</strong> les chambres doivent être impérativement libérées avant 11h le jour du départ.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">6. Dépôt de garantie (Caution)</h2>
            <p>Un dépôt de garantie d'un montant de 500 € est obligatoire et sera rigoureusement exigé à la remise des clés. Il peut être effectué selon deux modalités :</p>
            <ul className="mt-4 space-y-2 list-disc list-inside font-medium">
              <li><strong>Par empreinte bancaire :</strong> réalisée en ligne avant l'arrivée, la somme est bloquée temporairement sans débit immédiat.</li>
              <li><strong>Par chèque :</strong> remis en main propre lors de l'arrivée, libellé à l'ordre du <strong>MUC</strong>.</li>
            </ul>
            <p className="mt-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-300 font-bold">
              ⚠️ Condition stricte d'accès : à défaut de présentation de la caution (que ce soit par empreinte bancaire valide ou par chèque), la remise des clés sera automatiquement refusée et l'accès au gîte ne sera pas possible.
            </p>
            <p className="mt-4">Cette caution est destinée à couvrir d'éventuels dommages ou dégradations constatés sur le bâtiment ou le matériel, les manquements au règlement intérieur, ou les frais de remise en état si les locaux ne sont pas rendus propres. Elle sera intégralement libérée ou restituée dans un délai de 30 jours après le départ, déduction faite des éventuels frais de réparation ou d'indemnisation.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">7. Pénalités de retard</h2>
            <p>Tout retard de paiement des sommes dues à l'échéance entraînera de plein droit l'application de pénalités de retard. Celles-ci sont calculées sur la base de trois fois le taux d'intérêt légal en vigueur. En sus des indemnités de retard, une indemnité forfaitaire de 40 € pour frais de recouvrement sera exigée (Art. L441-6 du Code de commerce).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">8. Régime fiscal et tarifs</h2>
            <p>Les tarifs appliqués sont ceux indiqués sur le devis accepté par le client ou lors de la réservation en ligne effectuée par ce dernier. Les tarifs précis des nuitées ne sont pas détaillés dans les présentes conditions générales et figurent directement sur les outils de réservation.</p>
            <p className="mt-4 font-semibold text-muc-yellow">Conformément à l'article 293 B du Code Général des Impôts (CGI), la TVA est non applicable sur les prestations fournies par l'association.</p>
            <p className="mt-4"><strong>Taxe de séjour :</strong> en sus du prix de l'hébergement, une taxe de séjour est perçue pour le compte de la collectivité. Son montant est calculé sur la base de 4 % du prix de la nuitée par personne majeure (tarif applicable aux hébergements non classés par la Communauté de Communes de Millau Grands Causses), majoré de la taxe additionnelle départementale de 10 % instituée par le Conseil Départemental de l'Aveyron. Elle sera calculée et ajoutée lors de la facturation finale.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">9. Location des salles de formation</h2>
            <p>L'établissement propose la location de deux salles de formation (une salle de 15 personnes et une salle de 12 personnes, équipées de tables, chaises, écran numérique ou vidéoprojecteur, WC et lavabo). Les conditions spécifiques suivantes s'appliquent :</p>
            <p className="mt-4 font-semibold">Périodes de location :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong>Hors vacances scolaires :</strong> la location est possible du vendredi au dimanche.</li>
              <li><strong>Vacances scolaires (zone de Millau) :</strong> la location est possible tous les jours de la semaine.</li>
            </ul>
            <p className="mt-4"><strong>Horaires et durée de location :</strong> la location d'une salle prend effet de 9h le matin jusqu'à 9h le lendemain matin. Exception faite pour le vendredi hors vacances scolaires, où la salle est disponible à partir de 17h jusqu'au lendemain 9h, comptant pour un jour de location.</p>
            <p className="mt-4"><strong>Tarification :</strong> le tarif est fixé à 100 € par jour si les salles sont louées en complément de chambres du gîte. Dans le cas contraire (location des salles seules), le tarif est de 150 € par jour.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">10. Service de restauration</h2>
            <p>L'établissement propose un service de restauration optionnel en partenariat avec la cuisine centrale de la Ville de Millau (produits frais, 63 % bio, partenariats locaux). Les modalités de ce service sont strictes :</p>
            <p className="mt-4 font-semibold">Tarifs des repas (par personne) :</p>
            <ul className="mt-2 space-y-1.5 list-disc list-inside">
              <li><strong>Adulte :</strong> 6 € par petit-déjeuner, 11,50 € par déjeuner, 14 € par dîner.</li>
              <li><strong>Enfant (&lt; 12 ans) :</strong> 5 € par petit-déjeuner, 9,50 € par déjeuner, 12 € par dîner.</li>
              <li><strong>Enfant (&lt; 5 ans) :</strong> 4 € par petit-déjeuner, 8 € par déjeuner, 10 € par dîner.</li>
            </ul>
            <p className="mt-4"><strong>Organisation :</strong> les repas sont conditionnés en bacs inox et livrés le matin avant 10h (le vendredi pour l'ensemble du week-end). Ils comprennent une entrée, un plat et un dessert. Les paniers-repas et pique-niques ne sont pas proposés.</p>
            <p className="mt-4"><strong>Modalités de commande :</strong> les commandes de repas doivent être impérativement transmises et validées au plus tard le jeudi pour la semaine suivante. Passé ce délai, aucune commande ne pourra être enregistrée sur l'espace de réservation.</p>
            <p className="mt-4"><strong>Condition de validation :</strong> pour que la commande de repas soit transmise au prestataire, le client doit avoir réglé la totalité (100 %) du montant des repas commandés lors du paiement de l'acompte de la réservation. À défaut de paiement dans les délais impartis, la commande de repas est automatiquement annulée.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">11. État des lieux et inventaire</h2>
            <p>Le présent contrat est complété par un état des lieux et un inventaire du matériel joint en annexe. Il appartient aux occupants de vérifier l'exactitude de ces documents dès leur arrivée. Tout écart ou anomalie constaté doit impérativement être signalé dans les premières heures de l'entrée dans les lieux. Passé ce délai, toute dégradation ou manque constaté lors du départ pourra faire l'objet d'une retenue sur le dépôt de garantie.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-muc-yellow uppercase tracking-widest mb-4">12. Respect des lieux et voisinage</h2>
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

export default CGV;
