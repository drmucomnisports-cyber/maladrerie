import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Send, X, CheckCircle, AlertTriangle, Phone, UtensilsCrossed, Info } from 'lucide-react';
import { API_URL } from '../config';

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 7, etage: '2e étage' },
  5: { num: 5, name: 'Grande chambre', lits: 7, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const ReservationForm = ({ events = [], isAdmin = false, isDevis = false, onCreated = () => {}, adminUser = null, existingReservation = null }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    structure: '',
    devisAdultes: 0,
    devisMineurs: 0,
    email: '',
    telephone: '',
    adressePostale: '',
    dateDebut: '',
    dateFin: '',
    chambres: [],
    chambresDetails: {},
    options: {
      litsFaits: false,
      lingeFourni: false,
      menage: false
    },
    salles: {
      salle15: false,
      salle12: false,
      dateDebut: '',
      dateFin: ''
    },
    occupants: [],
    repas: {},
    modeRestauration: 'global',
    repasGlobal: {
      PETIT_DEJ: false,
      DEJEUNER: false,
      DINER: false
    },
    sendEmail: true,
    collectOccupantsEmail: false
  });

  // Grille tarifaire restauration
  const TARIFS_REPAS = {
    PETIT_DEJ: { ADULTE: 6, ENFANT_MOINS_12: 5, ENFANT_MOINS_5: 4, label: 'Petit-déjeuner' },
    DEJEUNER:  { ADULTE: 11.5, ENFANT_MOINS_12: 9.5, ENFANT_MOINS_5: 8, label: 'Déjeuner' },
    DINER:     { ADULTE: 14, ENFANT_MOINS_12: 12, ENFANT_MOINS_5: 10, label: 'Dîner' }
  };

  const [showPromoMessage, setShowPromoMessage] = useState(false);

  useEffect(() => {
    if (existingReservation) {
      // Split "nom" to prenom and nom if client exists
      let prenom = '';
      let nom = '';
      let structure = existingReservation.structure || '';
      
      if (existingReservation.client) {
        if (isAdmin && !isDevis) {
          nom = existingReservation.client.nom || '';
          if (nom.includes(' - ')) {
            const splitNom = nom.split(' - ');
            nom = splitNom[0];
            structure = splitNom[1];
          }
        } else {
          const parts = (existingReservation.client.nom || '').split(' ');
          prenom = parts[0] || '';
          nom = parts.slice(1).join(' ') || '';
          if (nom.includes(' - ')) {
            const splitNom = nom.split(' - ');
            nom = splitNom[0];
            structure = splitNom[1];
          }
        }
      }

      let deducedMode = existingReservation.modeRestauration || 'global';
      let deducedGlobal = existingReservation.repasGlobal || { PETIT_DEJ: false, DEJEUNER: false, DINER: false };
      
      if (!existingReservation.modeRestauration && existingReservation.repas && Object.keys(existingReservation.repas).length > 0) {
        const datesRepas = Object.keys(existingReservation.repas);
        const firstDay = existingReservation.repas[datesRepas[0]];
        
        const hasPetitDej = !!firstDay.PETIT_DEJ;
        const hasDejeuner = !!firstDay.DEJEUNER;
        const hasDiner = !!firstDay.DINER;
        
        let isUniform = true;
        for (let i = 1; i < datesRepas.length; i++) {
          const day = existingReservation.repas[datesRepas[i]];
          if (!!day.PETIT_DEJ !== hasPetitDej || !!day.DEJEUNER !== hasDejeuner || !!day.DINER !== hasDiner) {
            isUniform = false;
            break;
          }
        }
        
        if (isUniform && (hasPetitDej || hasDejeuner || hasDiner)) {
          deducedMode = 'global';
          deducedGlobal = { PETIT_DEJ: hasPetitDej, DEJEUNER: hasDejeuner, DINER: hasDiner };
        } else {
          deducedMode = 'carte';
        }
      } else if (!existingReservation.modeRestauration && (!existingReservation.repas || Object.keys(existingReservation.repas).length === 0)) {
        deducedMode = 'global';
      }

      setFormData({
        nom,
        prenom,
        structure,
        devisAdultes: existingReservation.chambres?.length === 0 ? (existingReservation.chambresDetails ? Object.values(existingReservation.chambresDetails).reduce((acc, curr) => acc + parseInt(curr.adultes || 0), 0) : 0) : 0,
        devisMineurs: existingReservation.chambres?.length === 0 ? (existingReservation.chambresDetails ? Object.values(existingReservation.chambresDetails).reduce((acc, curr) => acc + parseInt(curr.mineurs || curr.enfants || 0), 0) : 0) : 0,
        email: existingReservation.client?.email || '',
        telephone: existingReservation.client?.telephone || '',
        adressePostale: existingReservation.client?.adressePostale || '',
        dateDebut: new Date(existingReservation.dateDebut).toISOString().split('T')[0],
        dateFin: new Date(existingReservation.dateFin).toISOString().split('T')[0],
        chambres: existingReservation.chambres || [],
        chambresDetails: Object.keys(existingReservation.chambresDetails || {}).reduce((acc, chId) => {
          const d = existingReservation.chambresDetails[chId];
          acc[chId] = {
            adultes: d.adultes || 0,
            mineurs: d.mineurs || d.enfants || 0,
            enfants: d.mineurs || d.enfants || 0
          };
          return acc;
        }, {}),
        options: existingReservation.options || { litsFaits: false, lingeFourni: false, menage: false },
        salles: existingReservation.salles || { salle15: false, salle12: false, dateDebut: '', dateFin: '' },
        occupants: existingReservation.occupants || [],
        repas: existingReservation.repas || {},
        modeRestauration: deducedMode,
        repasGlobal: deducedGlobal,
        sendEmail: true
      });
      // Skip the dates step if we are editing
      setStep(1); 
    }
  }, [existingReservation]);

  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'success', title: '', message: '' });
  const [isLastMinute, setIsLastMinute] = useState(false);
  const [lastMinuteWarning, setLastMinuteWarning] = useState('');

  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [devisWarningRooms, setDevisWarningRooms] = useState([]);

  useEffect(() => {
    if (formData.dateDebut && formData.dateFin && events.length > 0) {
      const start = new Date(formData.dateDebut);
      const end = new Date(formData.dateFin);
      
      const overlappingDevis = events.filter(e => {
        // Assume events mapped from backend include 'statut'
        if (e.statut !== 'DEVIS_EN_ATTENTE') return false;
        const eStart = new Date(e.start);
        const eEnd = new Date(e.end);
        return (start < eEnd && end > eStart);
      });

      const rooms = [...new Set(overlappingDevis.flatMap(e => e.chambres || []))];
      // Filter only rooms currently selected
      const selectedOverlappingRooms = rooms.filter(r => formData.chambres.includes(r));
      setDevisWarningRooms(selectedOverlappingRooms);
    } else {
      setDevisWarningRooms([]);
    }
  }, [formData.dateDebut, formData.dateFin, events, formData.chambres]);

  useEffect(() => {
    setFormData(prev => {
      if (prev.dateDebut && prev.dateFin && !prev.salles.dateDebut && !prev.salles.dateFin) {
        return {
          ...prev,
          salles: {
            ...prev.salles,
            dateDebut: prev.dateDebut,
            dateFin: prev.dateFin
          }
        };
      }
      return prev;
    });
  }, [formData.dateDebut, formData.dateFin]);

  const [unavailableRooms, setUnavailableRooms] = useState([]);

  // Check availability when dates change
  useEffect(() => {
    if (formData.dateDebut && formData.dateFin) {
      const start = new Date(formData.dateDebut);
      const end = new Date(formData.dateFin);
      
      const unavailable = new Set();
      events.forEach(event => {
        if (existingReservation && (event.id === existingReservation.id || event.id === `res-${existingReservation.id}`)) return;
        
        const evStart = new Date(event.start);
        const evEnd = new Date(event.end);

        if (start < evEnd && end > evStart) {
           if (event.chambres && Array.isArray(event.chambres)) {
             event.chambres.forEach(ch => unavailable.add(ch));
           }
        }
      });

      setUnavailableRooms(Array.from(unavailable));

      // Remove selected rooms that became unavailable
      setFormData(prev => {
        const validChambres = prev.chambres.filter(ch => !unavailable.has(ch));
        if (validChambres.length === prev.chambres.length) return prev; // no change

        const newDetails = { ...prev.chambresDetails };
        prev.chambres.forEach(ch => {
          if (unavailable.has(ch)) {
            delete newDetails[ch];
          }
        });

        return { ...prev, chambres: validChambres, chambresDetails: newDetails };
      });
    } else {
      setUnavailableRooms([]);
    }
  }, [formData.dateDebut, formData.dateFin, events]);

  const isVacancesScolairesZoneC = (date) => {
    const time = date.getTime();
    const range = (startStr, endStr) => {
      return time >= new Date(startStr).getTime() && time <= new Date(endStr).getTime();
    };
    return (
      // 2025
      range('2025-10-18', '2025-11-03') ||
      range('2025-12-20', '2026-01-05') ||
      // 2026
      range('2026-02-14', '2026-03-02') ||
      range('2026-04-18', '2026-05-04') ||
      range('2026-07-04', '2026-09-07') ||
      range('2026-10-17', '2026-11-02') ||
      range('2026-12-19', '2027-01-04') ||
      // 2027
      range('2027-02-13', '2027-03-01') ||
      range('2027-04-17', '2027-05-03') ||
      range('2027-07-03', '2027-09-06') ||
      range('2027-10-23', '2027-11-08') ||
      range('2027-12-18', '2028-01-03')
    );
  };

  const areDatesValidForSalles = (checkSpecificDates = false) => {
    if (isAdmin) return true; // Admins can bypass date validations for salles!
    const startStr = checkSpecificDates ? (formData.salles?.dateDebut || formData.dateDebut) : formData.dateDebut;
    const endStr = checkSpecificDates ? (formData.salles?.dateFin || formData.dateFin) : formData.dateFin;
    if (!startStr || !endStr) return false;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (start >= end) return false;
    const current = new Date(start);
    while (current < end) {
      const day = current.getDay(); // 0=dim, 1=lun, ..., 6=sam
      const isWeekend = (day === 5 || day === 6 || day === 0);
      const isHoliday = isVacancesScolairesZoneC(current);
      if (!isWeekend && !isHoliday) {
        return false;
      }
      current.setDate(current.getDate() + 1);
    }
    return true;
  };

  const handleSalleToggle = (salleKey) => {
    setFormData(prev => ({
      ...prev,
      salles: {
        ...prev.salles,
        [salleKey]: !prev.salles?.[salleKey]
      }
    }));
  };

  useEffect(() => {
    if (formData.dateDebut && formData.dateFin) {
      const valid = areDatesValidForSalles();
      if (!valid) {
        setFormData(prev => {
          if (prev.salles?.salle15 || prev.salles?.salle12) {
            return {
              ...prev,
              salles: { salle15: false, salle12: false }
            };
          }
          return prev;
        });
      }
    } else {
      setFormData(prev => {
        if (prev.salles?.salle15 || prev.salles?.salle12) {
          return {
            ...prev,
            salles: { salle15: false, salle12: false }
          };
        }
        return prev;
      });
    }
  }, [formData.dateDebut, formData.dateFin]);

  const getChambresDetailsDistribues = () => {
    const mapped = {};
    if (formData.chambresDetails) {
      Object.entries(formData.chambresDetails).forEach(([chId, details]) => {
        mapped[chId] = {
          ...details,
          enfants: details.mineurs || 0
        };
      });
    }
    return mapped;
  };

  const generateFakeOccupants = () => {
    const list = [];
    const totalAdults = formData.chambres.length > 0 
      ? Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + (parseInt(curr.adultes) || 0), 0)
      : (parseInt(formData.devisAdultes) || 0);
    const totalMineurs = formData.chambres.length > 0 
      ? Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + (parseInt(curr.mineurs) || 0), 0)
      : (parseInt(formData.devisMineurs) || 0);

    for (let i = 1; i <= totalAdults; i++) {
      list.push({ nom: formData.nom, prenom: `Adulte ${i}`, estAdulte: true, age: 30, nationalite: true });
    }
    for (let i = 1; i <= totalMineurs; i++) {
      list.push({ nom: formData.nom, prenom: `Mineur ${i}`, estAdulte: false, age: 10, nationalite: true });
    }
    return list;
  };

  const calculerTotalSalles = () => {
    if (!formData.salles?.salle15 && !formData.salles?.salle12) return 0;
    const startStr = formData.salles?.dateDebut || formData.dateDebut;
    const endStr = formData.salles?.dateFin || formData.dateFin;
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const nuitsSalles = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    
    const aDesChambres = formData.chambres.length > 0;
    const tarifSalleParJour = aDesChambres ? 100 : 150;
    let total = 0;
    if (formData.salles?.salle15) total += tarifSalleParJour * nuitsSalles;
    if (formData.salles?.salle12) total += tarifSalleParJour * nuitsSalles;
    return total;
  };

  const calculerPrix = () => {
    if (!formData.dateDebut || !formData.dateFin) return 0;
    const start = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (nuits <= 0) return 0;

    let total = 0;
    let totalAdultes = 0;
    let totalMineurs = 0;

    const detailsSource = isDevis ? getChambresDetailsDistribues() : formData.chambresDetails;

    formData.chambres.forEach(chId => {
      const details = detailsSource[chId] || { adultes: 0, mineurs: 0 };
      const info = CHAMBRES_INFO[chId];
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.mineurs || 0);
      const occupants = nbAdultes + nbMineurs;
      
      totalAdultes += nbAdultes;
      totalMineurs += nbMineurs;

      const tarifPers = occupants >= info.lits ? 22 : 25;
      total += occupants * tarifPers * nuits;
      
      // Taxe de séjour : 4% du prix de la nuitée par adulte (+18 ans) + 10% part départementale = 4.4%
      // Note: Adultes dans chambresDetails sont ≥13 ans pour le tarif, 
      // mais ici on applique 4.4% sur le prix de la nuitée par adulte.
      total += nbAdultes * tarifPers * nuits * 0.044;
    });

    const totalPersonnes = totalAdultes + totalMineurs;
    if (formData.options.litsFaits) total += totalPersonnes * 5;
    if (formData.options.lingeFourni) total += totalPersonnes * 5;
    if (formData.options.menage) total += formData.chambres.length * 50;

    // Calcul du prix des salles de réunion
    total += calculerTotalSalles();

    // Appliquer Promo
    if (promoApplied) {
      if (promoApplied.type === 'pourcentage') {
        total = total * (1 - promoApplied.valeur / 100);
      } else {
        total = Math.max(0, total - promoApplied.valeur);
      }
    }

    return total;
  };

  const calculerTaxeSejour = () => {
    if (!formData.dateDebut || !formData.dateFin) return 0;
    const start = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    const nuits = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (nuits <= 0) return 0;

    let taxeTotal = 0;
    const detailsSource = isDevis ? getChambresDetailsDistribues() : formData.chambresDetails;

    formData.chambres.forEach(chId => {
      const details = detailsSource[chId] || { adultes: 0, mineurs: 0 };
      const info = CHAMBRES_INFO[chId];
      const nbAdultes = parseInt(details.adultes || 0);
      const nbMineurs = parseInt(details.mineurs || 0);
      const occupants = nbAdultes + nbMineurs;
      
      const tarifPers = occupants >= info.lits ? 22 : 25;
      taxeTotal += nbAdultes * tarifPers * nuits * 0.044;
    });

    return taxeTotal;
  };

  // Vérifie si la commande de repas est encore ouverte (avant le jeudi S-1)
  const isRepasCommandeOuverte = () => {
    if (isAdmin) return true; // Admins can bypass meal booking windows!
    if (!formData.dateDebut) return false;
    const debut = new Date(formData.dateDebut);
    const dayOfWeek = debut.getDay(); // 0=dim
    const mondayOfSejourWeek = new Date(debut);
    mondayOfSejourWeek.setDate(debut.getDate() - ((dayOfWeek + 6) % 7));
    const jeudiPrecedent = new Date(mondayOfSejourWeek);
    jeudiPrecedent.setDate(mondayOfSejourWeek.getDate() - 7 + 3);
    jeudiPrecedent.setHours(23, 59, 59, 999);
    return new Date() <= jeudiPrecedent;
  };

  // Génère la liste des dates du séjour (pour le sélecteur de repas)
  const getDatesSejour = () => {
    if (!formData.dateDebut || !formData.dateFin) return [];
    const dates = [];
    let current = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    while (current < end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const getComputedRepas = () => {
    if (formData.modeRestauration === 'global') {
      const dates = getDatesSejour();
      const computed = {};
      
      let nbAdultes = 0;
      let nbMineurs12 = 0;
      let nbMineurs5 = 0;

      if (isDevis) {
        if (formData.chambres.length > 0) {
          Object.values(formData.chambresDetails || {}).forEach(ch => {
            nbAdultes += parseInt(ch.adultes) || 0;
            nbMineurs12 += parseInt(ch.mineurs) || 0;
          });
        } else {
          nbAdultes = parseInt(formData.devisAdultes) || 0;
          nbMineurs12 = parseInt(formData.devisMineurs) || 0;
        }
      } else {
        if (formData.occupants && formData.occupants.length > 0) {
          formData.occupants.forEach(occ => {
            if (occ.estAdulte) {
              nbAdultes++;
            } else {
              const age = parseInt(occ.age);
              if (!isNaN(age) && age < 5) nbMineurs5++;
              else nbMineurs12++;
            }
          });
        } else {
          Object.values(formData.chambresDetails || {}).forEach(ch => {
            nbAdultes += parseInt(ch.adultes) || 0;
            nbMineurs12 += parseInt(ch.mineurs) || 0;
          });
        }
      }

      dates.forEach(d => {
        const dateStr = d.toISOString().split('T')[0];
        computed[dateStr] = {};
        Object.keys(formData.repasGlobal).forEach(type => {
          if (formData.repasGlobal[type]) {
            computed[dateStr][type] = {
              ADULTE: nbAdultes,
              ENFANT_MOINS_12: nbMineurs12,
              ENFANT_MOINS_5: nbMineurs5
            };
          }
        });
      });
      return computed;
    }
    return formData.repas || {};
  };

  const calculerTotalRepas = () => {
    let total = 0;
    Object.values(getComputedRepas()).forEach(dayRepas => {
      Object.entries(dayRepas).forEach(([typeRepas, counts]) => {
        const tarifs = TARIFS_REPAS[typeRepas];
        if (tarifs && counts && typeof counts === 'object') {
          total += (tarifs.ADULTE * (parseInt(counts.ADULTE) || 0)) + 
                   (tarifs.ENFANT_MOINS_12 * (parseInt(counts.ENFANT_MOINS_12) || 0)) + 
                   (tarifs.ENFANT_MOINS_5 * (parseInt(counts.ENFANT_MOINS_5) || 0));
        }
      });
    });
    return Math.round(total * 100) / 100;
  };

  const handleRepasCarteChange = (dateStr, typeRepas, typeOccupant, value) => {
    setFormData(prev => {
      const newRepas = { ...prev.repas };
      if (!newRepas[dateStr]) newRepas[dateStr] = {};
      if (!newRepas[dateStr][typeRepas]) newRepas[dateStr][typeRepas] = { ADULTE: 0, ENFANT_MOINS_12: 0, ENFANT_MOINS_5: 0 };
      
      newRepas[dateStr][typeRepas][typeOccupant] = parseInt(value) || 0;
      
      // Nettoyage si tous les compteurs d'un repas sont à 0
      const totalRepasCount = (newRepas[dateStr][typeRepas].ADULTE || 0) + (newRepas[dateStr][typeRepas].ENFANT_MOINS_12 || 0) + (newRepas[dateStr][typeRepas].ENFANT_MOINS_5 || 0);
      if (totalRepasCount === 0) {
          delete newRepas[dateStr][typeRepas];
      }
      if (Object.keys(newRepas[dateStr]).length === 0) {
          delete newRepas[dateStr];
      }
      
      return { ...prev, repas: newRepas };
    });
  };

  const handleApplyPromo = async () => {
    if (!promoCode) return;
    setValidatingPromo(true);
    setPromoError('');
    try {
      const res = await fetch(`${API_URL}/api/promo-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode,
          date: formData.dateDebut
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPromoApplied(data);
      } else {
        setPromoError(data.error || 'Code invalide');
      }
    } catch (err) {
      setPromoError('Erreur de validation');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox' && name === 'chambres') {
      const chambreId = parseInt(value);
      setFormData(prev => {
        const newChambres = checked 
          ? [...prev.chambres, chambreId]
          : prev.chambres.filter(id => id !== chambreId);
        
        const newDetails = { ...prev.chambresDetails };
        if (!checked) delete newDetails[chambreId];
        else newDetails[chambreId] = { adultes: 0, mineurs: 0, enfants: 0 };

        return { ...prev, chambres: newChambres, chambresDetails: newDetails };
      });
    } else if (type === 'checkbox' && name.startsWith('opt_')) {
      const optName = name.replace('opt_', '');
      setFormData(prev => ({
        ...prev,
        options: { ...prev.options, [optName]: checked }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'number' ? (parseInt(value) || 0) : value }));
    }
  };

  const handleRoomDetailsChange = (chambreId, field, value) => {
    setFormData(prev => ({
      ...prev,
      chambresDetails: {
        ...prev.chambresDetails,
        [chambreId]: {
          ...prev.chambresDetails[chambreId],
          [field]: parseInt(value) || 0
        }
      }
    }));
  };

  const handleOccupantChange = (index, field, value) => {
    setFormData(prev => {
      const newOccupants = [...prev.occupants];
      newOccupants[index] = { ...newOccupants[index], [field]: value };
      return { ...prev, occupants: newOccupants };
    });
  };

  const goToStep2 = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!formData.nom || !formData.email || !formData.telephone) {
      triggerError("Veuillez renseigner toutes les informations de contact obligatoires (Nom, Email, Téléphone).");
      return;
    }
    if (!formData.dateDebut || !formData.dateFin) {
      triggerError("Veuillez sélectionner des dates.");
      return;
    }
    const start = new Date(formData.dateDebut);
    const end = new Date(formData.dateFin);
    if (start >= end) {
      triggerError("La date de départ doit être après la date d'arrivée.");
      return;
    }
    
    if (formData.chambres.length === 0 && !formData.salles?.salle15 && !formData.salles?.salle12) {
      triggerError("Veuillez sélectionner au moins une chambre ou une salle de réunion.");
      return;
    }
    
    if ((formData.salles?.salle15 || formData.salles?.salle12) && !areDatesValidForSalles(true)) {
      triggerError("Les dates spécifiques sélectionnées pour la salle de réunion ne sont pas valides (uniquement WE ou vacances).");
      return;
    }
    
    let totalExpectedOccupants = 0;
    for (let chId of formData.chambres) {
      const details = formData.chambresDetails[chId];
      const occupantsCount = (details?.adultes || 0) + (details?.mineurs || 0);
      const capacite = CHAMBRES_INFO[chId].lits;
      if (occupantsCount === 0) {
        triggerError(`Veuillez indiquer le nombre d'occupants pour la chambre ${chId}.`);
        return;
      }
      if (occupantsCount > capacite) {
        triggerError(`La capacité de la chambre ${chId} est dépassée (${occupantsCount} occupants pour ${capacite} lits).`);
        return;
      }
      totalExpectedOccupants += occupantsCount;
    }

    // Générer automatiquement les occupants en fonction des adultes/enfants renseignés
    const newOccupants = [];
    const existingAdults = formData.occupants.filter(o => o.estAdulte);
    const existingMineurs = formData.occupants.filter(o => !o.estAdulte);
    let nextAdultIdx = 0;
    let nextMineurIdx = 0;

    for (const chId of formData.chambres) {
      const details = formData.chambresDetails[chId];
      const nbAdultes = parseInt(details?.adultes || 0);
      const nbMineurs = parseInt(details?.mineurs || 0);
      
      // Ajouter les adultes
      for (let i = 0; i < nbAdultes; i++) {
        if (nextAdultIdx < existingAdults.length) {
          newOccupants.push(existingAdults[nextAdultIdx++]);
        } else {
          newOccupants.push({ nom: '', prenom: '', estAdulte: true, age: '', nationalite: true });
        }
      }
      // Ajouter les mineurs
      for (let i = 0; i < nbMineurs; i++) {
        if (nextMineurIdx < existingMineurs.length) {
          newOccupants.push(existingMineurs[nextMineurIdx++]);
        } else {
          newOccupants.push({ nom: '', prenom: '', estAdulte: false, age: '', nationalite: true });
        }
      }
    }
    const computedRepas = getComputedRepas();
    const hasRepasChecked = Object.keys(computedRepas).some(date => Object.keys(computedRepas[date]).length > 0);
    if (hasRepasChecked && !isAdmin) { // Bypassed for admins!
      let maxLunchOrDinner = 0;
      let invalidService = false;
      
      Object.values(computedRepas).forEach(dayRepas => {
        let lunchCount = 0;
        if (dayRepas.DEJEUNER) {
          lunchCount = (parseInt(dayRepas.DEJEUNER.ADULTE) || 0) + (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5) || 0);
          if (lunchCount > 0 && lunchCount < 5) invalidService = true;
        }
        
        let dinnerCount = 0;
        if (dayRepas.DINER) {
          dinnerCount = (parseInt(dayRepas.DINER.ADULTE) || 0) + (parseInt(dayRepas.DINER.ENFANT_MOINS_12) || 0) + (parseInt(dayRepas.DINER.ENFANT_MOINS_5) || 0);
          if (dinnerCount > 0 && dinnerCount < 5) invalidService = true;
        }
        
        if (lunchCount > maxLunchOrDinner) maxLunchOrDinner = lunchCount;
        if (dinnerCount > maxLunchOrDinner) maxLunchOrDinner = dinnerCount;
      });

      if (maxLunchOrDinner < 5) {
        triggerError("L'ouverture du service de restauration nécessite la commande d'un minimum de 5 repas (déjeuners ou dîners) sur une même journée.");
        return;
      }
      
      if (invalidService) {
        triggerError("Il n'est pas possible de commander pour moins de 5 personnes par repas. Veuillez renseigner au moins 5 repas pour chaque service sélectionné.");
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, occupants: newOccupants }));
    setStep(2);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const errorRef = useRef(null);

  const triggerError = (msg) => {
    setErrorMsg(msg);
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (isDevis) {
      if (!formData.nom || !formData.prenom || !formData.email || !formData.telephone || !formData.adressePostale) {
        triggerError("Veuillez remplir toutes les informations du demandeur.");
        return;
      }
      if (!formData.dateDebut || !formData.dateFin) {
        triggerError("Veuillez sélectionner des dates.");
        return;
      }
      const start = new Date(formData.dateDebut);
      const end = new Date(formData.dateFin);
      if (start >= end) {
        triggerError("La date de départ doit être après la date d'arrivée.");
        return;
      }
      if (formData.chambres.length === 0 && !formData.salles?.salle15 && !formData.salles?.salle12) {
        triggerError("Veuillez sélectionner au moins une chambre ou une salle de réunion.");
        return;
      }
      if ((formData.salles?.salle15 || formData.salles?.salle12) && !areDatesValidForSalles(true)) {
        triggerError("Les dates spécifiques sélectionnées pour la salle de réunion ne sont pas valides (uniquement WE ou vacances).");
        return;
      }
      if (formData.chambres.length > 0) {
        const totalAdults = Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + (parseInt(curr.adultes) || 0), 0);
        const totalMineurs = Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + (parseInt(curr.mineurs) || 0), 0);
        const totalOccupants = totalAdults + totalMineurs;
        if (totalOccupants <= 0) {
          triggerError("Veuillez indiquer le nombre d'adultes et de mineurs pour chaque chambre sélectionnée.");
          return;
        }
        const totalCapacite = formData.chambres.reduce((acc, chId) => acc + CHAMBRES_INFO[chId].lits, 0);
        if (totalOccupants > totalCapacite) {
          triggerError(`La capacité totale des chambres sélectionnées est dépassée (${totalOccupants} occupants pour ${totalCapacite} lits maximum).`);
          return;
        }
      }
    } else {
      if (!formData.collectOccupantsEmail) {
        for (let occ of formData.occupants) {
          if (occ.estAdulte) {
            if (!occ.nom?.trim() || !occ.prenom?.trim()) {
              triggerError("Veuillez remplir les noms et prénoms de tous les adultes.");
              return;
            }
          } else {
            // Nom et prénom optionnels pour les mineurs, mais l'âge est obligatoire
            if (occ.age === '' || occ.age === undefined || occ.age === null || isNaN(occ.age) || occ.age < 0 || occ.age >= 18) {
              triggerError("Veuillez indiquer un âge valide pour tous les mineurs (moins de 18 ans).");
              return;
            }
          }
        }
      }
    }

    const computedRepas = getComputedRepas();
    const hasRepasCommandes = Object.keys(computedRepas).some(date => Object.keys(computedRepas[date]).length > 0);

    if (hasRepasCommandes && !isAdmin) { // Bypassed for admins!
      let maxLunchOrDinner = 0;
      Object.values(computedRepas).forEach(dayRepas => {
        let lunchCount = 0;
        if (dayRepas.DEJEUNER) {
          lunchCount = (parseInt(dayRepas.DEJEUNER.ADULTE) || 0) + (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_12) || 0) + (parseInt(dayRepas.DEJEUNER.ENFANT_MOINS_5) || 0);
        }
        let dinnerCount = 0;
        if (dayRepas.DINER) {
          dinnerCount = (parseInt(dayRepas.DINER.ADULTE) || 0) + (parseInt(dayRepas.DINER.ENFANT_MOINS_12) || 0) + (parseInt(dayRepas.DINER.ENFANT_MOINS_5) || 0);
        }
        if (lunchCount > maxLunchOrDinner) maxLunchOrDinner = lunchCount;
        if (dinnerCount > maxLunchOrDinner) maxLunchOrDinner = dinnerCount;
      });

      if (maxLunchOrDinner < 5) {
        triggerError("L'ouverture du service de restauration nécessite la commande d'un minimum de 5 repas (déjeuners ou dîners) sur une même journée.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Map mineurs to enfants in non-devis mode to maintain backend compatibility
      const mappedChambresDetails = {};
      if (formData.chambresDetails) {
        Object.entries(formData.chambresDetails).forEach(([chId, details]) => {
          mappedChambresDetails[chId] = {
            ...details,
            enfants: details.mineurs || 0
          };
        });
      }

      const totalRepas = calculerTotalRepas();
      const prixHebergement = calculerPrix();
      const prixTotalGlobal = prixHebergement + totalRepas;

      const payload = isDevis ? {
        ...formData,
        nom: `${formData.prenom} ${formData.nom}${formData.structure ? ' - ' + formData.structure : ''}`,
        chambresDetails: getChambresDetailsDistribues(),
        occupants: generateFakeOccupants(),
        prixTotal: prixTotalGlobal,
        prixHebergement,
        totalRepas,
        repas: computedRepas,
        promoCode: promoApplied?.code,
        adminEmail: adminUser?.email,
        adminName: adminUser?.nom,
        sendEmail: formData.sendEmail
      } : {
        ...formData,
        chambresDetails: mappedChambresDetails,
        prixTotal: prixTotalGlobal,
        prixHebergement,
        totalRepas,
        repas: computedRepas,
        promoCode: promoApplied?.code,
        adminEmail: adminUser?.email,
        adminName: adminUser?.nom,
        sendEmail: formData.sendEmail
      };
      
      let url = `${API_URL}/api/reservations`;
      let method = 'POST';

      if (existingReservation) {
        if (isDevis) {
          url = `${API_URL}/api/admin/devis/${existingReservation.id}`;
        } else {
          url = `${API_URL}/api/admin/reservations/${existingReservation.id}/full`;
        }
        method = 'PUT';
      } else if (isDevis) {
        url = `${API_URL}/api/admin/devis`;
      } else if (isAdmin) {
        url = `${API_URL}/api/admin/reservations`;
      }

      const headers = { 'Content-Type': 'application/json' };
      if (isAdmin || isDevis || existingReservation) {
        const token = localStorage.getItem('adminToken');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        const roomNames = formData.chambres.map(id => CHAMBRES_INFO[id]?.name || `Chambre ${id}`).join(', ');
        let message = '';
        if (existingReservation) {
          message = 'La réservation a été mise à jour avec succès.';
        } else if (isDevis) {
          message = `Le devis pour ${roomNames} a été généré et envoyé à ${formData.email}. Il est valable pendant 48 heures.`;
        } else if (isAdmin) {
          message = 'La réservation a bien été enregistrée.';
        } else {
          message = 'Demande de réservation envoyée avec succès. Vous recevrez une confirmation prochainement.';
        }
        
        setSuccessMsg(message);
        if (data.isLastMinute) {
          setIsLastMinute(true);
          setLastMinuteWarning(data.lastMinuteWarning);
        } else {
          setIsLastMinute(false);
          setLastMinuteWarning('');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setFormData({ nom: '', prenom: '', structure: '', devisAdultes: 0, devisMineurs: 0, email: '', telephone: '', adressePostale: '', dateDebut: '', dateFin: '', chambres: [], chambresDetails: {}, options: {litsFaits: false, lingeFourni: false, menage: false}, salles: {salle15: false, salle12: false, dateDebut: '', dateFin: ''}, occupants: [], repas: {}, modeRestauration: 'global', repasGlobal: { PETIT_DEJ: false, DEJEUNER: false, DINER: false }, sendEmail: true });
        setStep(1);
        
        if (onCreated) {
          onCreated();
        }

        setTimeout(() => {
          if (isDevis || isAdmin || existingReservation) {
            navigate('/admin');
          } else {
            navigate('/');
          }
        }, 3000);
      } else {
        const errData = await res.json();
        triggerError(errData.error || "Une erreur est survenue lors de l'envoi.");
      }
    } catch (err) {
      triggerError("Erreur réseau. Impossible de contacter le serveur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const datesValidesSalles = areDatesValidForSalles();
  
  let nombreTotalOccupants = 0;
  if (isDevis) {
    if (formData.chambres.length > 0) {
      nombreTotalOccupants = Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + parseInt(curr.adultes || 0) + parseInt(curr.mineurs || 0), 0);
    } else {
      nombreTotalOccupants = (parseInt(formData.devisAdultes) || 0) + (parseInt(formData.devisMineurs) || 0);
    }
  } else {
    nombreTotalOccupants = Object.values(formData.chambresDetails || {}).reduce((acc, curr) => acc + parseInt(curr.adultes || 0) + parseInt(curr.mineurs || 0), 0) || formData.occupants?.length || 0;
  }

  return (
    <div className="w-full">
      <form noValidate onSubmit={isDevis ? handleSubmit : (step === 1 ? goToStep2 : handleSubmit)} className="space-y-6 relative">
      <div ref={errorRef} className="scroll-mt-24">
        {errorMsg && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline font-bold">{errorMsg}</span>
          </div>
        )}
      </div>
      {step === 1 && (
        <>
          {isDevis ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Nom <span className="text-red-500">*</span></label>
                  <input required type="text" name="nom" value={formData.nom} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Dupont" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Prénom <span className="text-red-500">*</span></label>
                  <input required type="text" name="prenom" value={formData.prenom} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Jean" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Structure</label>
                <input type="text" name="structure" value={formData.structure} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: MUC OMNISPORTS" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">{isAdmin ? 'Nom Client / Groupe' : 'Nom Complet du Client'} <span className="text-red-500">*</span></label>
                <input required type="text" name="nom" value={formData.nom} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: Jean Dupont" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Structure (optionnel)</label>
                <input type="text" name="structure" value={formData.structure} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: MUC OMNISPORTS" />
              </div>
            </>
          )}
          
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">E-mail <span className="text-red-500">*</span></label>
            <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="jean@exemple.com" />
            {((isAdmin && !isDevis) || (isDevis && existingReservation)) && (
              <label className="flex items-center gap-2 mt-2 ml-1 cursor-pointer w-max">
                <input 
                  type="checkbox" 
                  checked={formData.sendEmail !== false}
                  onChange={(e) => setFormData(prev => ({...prev, sendEmail: e.target.checked}))}
                  className="w-4 h-4 rounded accent-[#004B93]" 
                />
                <span className="text-xs font-semibold text-slate-600">
                  {isDevis ? 'Envoyer un e-mail avec le devis' : (existingReservation ? 'Notifier le client de cette modification par e-mail' : "Envoyer l'e-mail de confirmation d'enregistrement au client")}
                </span>
              </label>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Téléphone <span className="text-red-500">*</span></label>
            <input required type="tel" name="telephone" value={formData.telephone} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="06 00 00 00 00" />
          </div>

          {isDevis && (
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Adresse Postale Complète <span className="text-red-500">*</span></label>
              <textarea required name="adressePostale" value={formData.adressePostale} onChange={handleChange} rows="2" className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: 123 rue de la Paix, 75000 Paris" />
            </div>
          )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="space-y-1">
          <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Arrivée (à partir de 17h) <span className="text-red-500">*</span></label>
          <input required type="date" name="dateDebut" value={formData.dateDebut} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Départ (avant 11h) <span className="text-red-500">*</span></label>
          <input required type="date" name="dateFin" value={formData.dateFin} onChange={handleChange} className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-4 block">Sélection des Chambres</label>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(num => {
            const info = CHAMBRES_INFO[num];
            const isChecked = formData.chambres.includes(num);
            const isUnavailable = unavailableRooms.includes(num);
            const isOriginal = existingReservation?.chambres?.includes(num);

            return (
              <div key={num} className={`p-4 rounded-xl border-2 transition-all ${isUnavailable ? 'opacity-50 bg-slate-100 border-slate-200 grayscale cursor-not-allowed' : isChecked ? (isOriginal ? 'border-muc-blue bg-muc-blue/5' : 'border-muc-yellow bg-muc-yellow/5') : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                <label className={`flex items-center gap-3 w-full ${isUnavailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input type="checkbox" name="chambres" value={num} checked={isChecked} onChange={handleChange} disabled={isUnavailable} className="hidden" />
                  <div className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${isChecked ? (isOriginal ? 'bg-muc-blue border-muc-blue' : 'bg-muc-yellow border-muc-yellow') : 'bg-white border-slate-300'}`}>
                    {isChecked && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-black text-slate-700 uppercase tracking-tight block">
                        Ch. {num} - {info.name} {isUnavailable && <span className="text-red-500 text-xs ml-2">(Indisponible)</span>}
                    </span>
                    <span className="text-xs font-medium text-slate-500">{info.lits} lits • {info.etage}</span>
                  </div>
                </label>
                
                {isChecked && !isUnavailable && (
                  <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Adultes (≥13 ans)</label>
                      <input type="number" min="0" max={info.lits} value={formData.chambresDetails[num]?.adultes || 0} onChange={(e) => handleRoomDetailsChange(num, 'adultes', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1 block">Mineurs</label>
                      <input type="number" min="0" max={info.lits} value={formData.chambresDetails[num]?.mineurs || 0} onChange={(e) => handleRoomDetailsChange(num, 'mineurs', e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-4 block">Salles de réunion (optionnel)</label>
        
        {!formData.dateDebut || !formData.dateFin ? (
          <p className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-xl border border-slate-200">
            Veuillez d'abord sélectionner vos dates de séjour pour réserver une salle de réunion.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
            {/* Salle 15 personnes */}
            <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${formData.salles?.salle15 ? 'border-muc-yellow bg-muc-yellow/5' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                 onClick={() => handleSalleToggle('salle15')}>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${formData.salles?.salle15 ? 'bg-muc-yellow border-muc-yellow' : 'bg-white border-slate-300'}`}>
                  {formData.salles?.salle15 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-tight block">Salle 15 personnes</span>
                  <span className="text-xs font-medium text-slate-500">
                    {formData.chambres.length > 0 ? '100 €' : '150 €'} / jour
                  </span>
                </div>
              </div>
            </div>

            {/* Salle 12 personnes */}
            <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${formData.salles?.salle12 ? 'border-muc-yellow bg-muc-yellow/5' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                 onClick={() => handleSalleToggle('salle12')}>
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${formData.salles?.salle12 ? 'bg-muc-yellow border-muc-yellow' : 'bg-white border-slate-300'}`}>
                  {formData.salles?.salle12 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-tight block">Salle 12 personnes</span>
                  <span className="text-xs font-medium text-slate-500">
                    {formData.chambres.length > 0 ? '100 €' : '150 €'} / jour
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {(formData.salles?.salle15 || formData.salles?.salle12) && (
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-1 block">Dates de réservation pour la salle</label>
              <p className="text-[11px] text-slate-500 mb-3 italic ml-1">Note : La location prend effet de 9h à 9h le lendemain (sauf le vendredi hors vacances : dès 17h).</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col justify-end gap-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Arrivée Salle</label>
                  <input type="date" name="salleDateDebut" value={formData.salles?.dateDebut || ''} onChange={(e) => setFormData(prev => ({ ...prev, salles: { ...prev.salles, dateDebut: e.target.value } }))} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm font-medium" />
                </div>
                <div className="flex flex-col justify-end gap-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Départ Salle (jusqu'à 9h le lendemain)</label>
                  <input type="date" name="salleDateFin" value={formData.salles?.dateFin || ''} onChange={(e) => setFormData(prev => ({ ...prev, salles: { ...prev.salles, dateFin: e.target.value } }))} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-muc-yellow outline-none text-sm font-medium" />
                </div>
              </div>
              {!areDatesValidForSalles(true) && (
                 <p className="text-xs text-red-500 font-bold mt-2">Les dates sélectionnées pour la salle ne sont pas valides (week-ends et vacances de la zone C uniquement).</p>
              )}
            </div>
          )}
        </>
        )}
      </div>

      {isDevis && formData.chambres.length === 0 && (
        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Nombre d'adultes</label>
            <input 
              required 
              type="number" 
              min="0" 
              name="devisAdultes" 
              value={formData.devisAdultes} 
              onChange={handleChange} 
              className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" 
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Nombre de mineurs</label>
            <input 
              required 
              type="number" 
              min="0" 
              name="devisMineurs" 
              value={formData.devisMineurs} 
              onChange={handleChange} 
              className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" 
            />
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-slate-100">
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-4 block">Options Complémentaires</label>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_litsFaits" checked={formData.options.litsFaits} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Lits faits à l'arrivée (5 € / pers)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_lingeFourni" checked={formData.options.lingeFourni} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Linge de toilette fourni (5 € / pers)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" name="opt_menage" checked={formData.options.menage} onChange={handleChange} className="w-4 h-4 text-muc-blue border-slate-300 rounded" />
            <span className="text-sm font-medium text-slate-700">Ménage fin de séjour (50 € / chambre)</span>
          </label>
        </div>
      </div>

      {/* ── BLOC RESTAURATION ── */}
      {formData.dateDebut && formData.dateFin && (formData.chambres.length > 0 || formData.salles?.salle15 || formData.salles?.salle12) && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <UtensilsCrossed size={18} className="text-muc-blue" />
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Restauration (optionnel)</label>
          </div>

          {!isRepasCommandeOuverte() ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800 mb-1">Commande de repas indisponible</p>
                  <p className="text-xs text-amber-700 leading-relaxed">Les commandes de repas doivent être passées <strong>avant le jeudi de la semaine précédant votre séjour</strong>. La date limite pour votre réservation est dépassée.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-800 leading-relaxed">
                    <p className="font-bold mb-1">Service de restauration — Cuisine Centrale de la Ville de Millau</p>
                    <p>Menus consultables sur le site de la cantine de la Ville de Millau (63% bio, circuit court, producteurs locaux). Les repas sont <strong>livrés le matin avant 10h</strong> (le vendredi pour les week-ends), en bacs inox. Ni pique-nique ni panier repas. <strong className="text-blue-900 block mt-2">⚠️ Un minimum de 5 personnes est requis pour pouvoir commander des repas.</strong></p>
                  </div>
                </div>
              </div>

              {/* MODE DE RESTAURATION */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6 mt-6">
                <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                  <input
                    type="radio"
                    name="modeRestauration"
                    value="global"
                    checked={formData.modeRestauration === 'global'}
                    onChange={() => setFormData(prev => ({ ...prev, modeRestauration: 'global' }))}
                    className="accent-muc-blue w-4 h-4"
                  />
                  <span className="text-sm font-bold text-slate-700">Formule globale</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                  <input
                    type="radio"
                    name="modeRestauration"
                    value="carte"
                    checked={formData.modeRestauration === 'carte'}
                    onChange={() => setFormData(prev => ({ ...prev, modeRestauration: 'carte' }))}
                    className="accent-muc-blue w-4 h-4"
                  />
                  <span className="text-sm font-bold text-slate-700">À la carte (jour par jour)</span>
                </label>
              </div>

              {formData.modeRestauration === 'global' ? (
                <div className="bg-white rounded-2xl border-2 border-slate-100 p-6">
                   <p className="text-sm text-slate-600 mb-6">Sélectionnez les repas que vous souhaitez pour <strong>l'ensemble de votre séjour</strong>. Cette sélection s'appliquera automatiquement à tous les jours et pour tous les occupants.</p>
                   <div className="flex flex-col gap-4">
                     {Object.entries(TARIFS_REPAS).map(([typeRepas, tarifs]) => {
                       const isChecked = formData.repasGlobal[typeRepas];
                       return (
                          <label key={typeRepas} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${isChecked ? 'border-muc-blue bg-blue-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!isAdmin && nombreTotalOccupants < 5}
                              onChange={() => setFormData(prev => ({
                                ...prev,
                                repasGlobal: { ...prev.repasGlobal, [typeRepas]: !prev.repasGlobal[typeRepas] }
                              }))}
                              className="hidden"
                            />
                            <div className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${isChecked ? 'bg-muc-blue border-muc-blue text-white' : 'bg-white border-slate-300'}`}>
                              {isChecked && <CheckCircle size={14} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`block font-black text-sm mb-2 truncate ${isChecked ? 'text-muc-blue' : 'text-slate-700'}`}>{tarifs.label}</span>
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center border-b border-slate-200/50 pb-1">
                                  <span className="text-xs font-bold text-slate-500">Adulte</span>
                                  <span className="text-xs font-black text-slate-700">{tarifs.ADULTE} €</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-200/50 pb-1">
                                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Enf. &lt;12</span>
                                  <span className="text-xs font-black text-slate-700">{tarifs.ENFANT_MOINS_12} €</span>
                                </div>
                                <div className="flex justify-between items-center pb-1">
                                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Enf. &lt;5</span>
                                  <span className="text-xs font-black text-slate-700">{tarifs.ENFANT_MOINS_5} €</span>
                                </div>
                              </div>
                            </div>
                          </label>
                       );
                     })}
                   </div>
                </div>
              ) : (
              <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
                <div className="flex flex-col gap-0">
                  {/* Lignes jour par jour */}
                  {getDatesSejour().map((date, idx) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const jourLabel = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                    return (
                      <div key={dateStr} className={`flex flex-col gap-4 p-5 border-b border-slate-100 last:border-b-0`}>
                        <div className="text-sm font-bold text-slate-700 capitalize bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100 shadow-sm">{jourLabel}</div>
                        <div className="flex flex-col gap-3">
                          {Object.entries(TARIFS_REPAS).map(([typeRepas, tarifs]) => {
                            const repasData = formData.repas[dateStr]?.[typeRepas] || {};
                            return (
                              <div key={typeRepas} className="flex flex-col gap-2 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
                                <div className="font-black text-muc-blue text-sm mb-1.5 text-center">{tarifs.label}</div>
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-100">
                                    <span className="font-bold text-slate-600 whitespace-nowrap">Adultes <span className="font-normal text-slate-400">({tarifs.ADULTE} €)</span></span>
                                    <input
                                      type="number"
                                      min="0"
                                      disabled={!isAdmin && nombreTotalOccupants < 5}
                                      value={repasData.ADULTE || ''}
                                      onChange={(e) => handleRepasCarteChange(dateStr, typeRepas, 'ADULTE', e.target.value)}
                                      className="w-16 p-1.5 text-center text-sm font-bold border border-slate-200 rounded-lg outline-none focus:border-muc-blue bg-white shadow-inner"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-100">
                                    <span className="font-bold text-slate-600 whitespace-nowrap">Enf. &lt;12 <span className="font-normal text-slate-400">({tarifs.ENFANT_MOINS_12} €)</span></span>
                                    <input
                                      type="number"
                                      min="0"
                                      disabled={!isAdmin && nombreTotalOccupants < 5}
                                      value={repasData.ENFANT_MOINS_12 || ''}
                                      onChange={(e) => handleRepasCarteChange(dateStr, typeRepas, 'ENFANT_MOINS_12', e.target.value)}
                                      className="w-16 p-1.5 text-center text-sm font-bold border border-slate-200 rounded-lg outline-none focus:border-muc-blue bg-white shadow-inner"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded border border-slate-100">
                                    <span className="font-bold text-slate-600 whitespace-nowrap">Enf. &lt;5 <span className="font-normal text-slate-400">({tarifs.ENFANT_MOINS_5} €)</span></span>
                                    <input
                                      type="number"
                                      min="0"
                                      disabled={!isAdmin && nombreTotalOccupants < 5}
                                      value={repasData.ENFANT_MOINS_5 || ''}
                                      onChange={(e) => handleRepasCarteChange(dateStr, typeRepas, 'ENFANT_MOINS_5', e.target.value)}
                                      className="w-16 p-1.5 text-center text-sm font-bold border border-slate-200 rounded-lg outline-none focus:border-muc-blue bg-white shadow-inner"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {calculerTotalRepas() > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex justify-between items-center">
                  <span className="text-sm font-bold text-orange-800">Total Restauration</span>
                  <span className="text-lg font-black text-orange-900">{calculerTotalRepas().toFixed(2)} €</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {formData.dateDebut && formData.dateFin && (formData.chambres.length > 0 || formData.salles?.salle15 || formData.salles?.salle12) && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1 mb-2 block">Code Promo</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={promoCode} 
                onChange={e => setPromoCode(e.target.value.toUpperCase())}
                placeholder="VOTRE CODE"
                className="w-full sm:flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-muc-blue font-bold text-sm uppercase min-w-0"
                disabled={promoApplied}
              />
              {!promoApplied ? (
                <button 
                  type="button" 
                  onClick={handleApplyPromo}
                  disabled={validatingPromo || !promoCode}
                  className="whitespace-nowrap px-6 py-2 bg-muc-blue text-white rounded-xl font-bold text-sm hover:bg-blue-800 disabled:opacity-50 transition-all shadow-md"
                >
                  {validatingPromo ? '...' : 'Appliquer'}
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={() => { setPromoApplied(null); setPromoCode(''); }}
                  className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold text-sm hover:bg-red-200 transition-all"
                >
                  Retirer
                </button>
              )}
            </div>
            {promoError && <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">{promoError}</p>}
            {promoApplied && <p className="text-green-600 text-[10px] font-bold mt-1 ml-1">Code appliqué : -{promoApplied.type === 'pourcentage' ? `${promoApplied.valeur}%` : `${promoApplied.valeur} €`}</p>}
          </div>

          <div className="bg-muc-blue/5 p-6 rounded-2xl border-2 border-muc-blue/10">
            <h3 className="text-sm font-black uppercase text-muc-blue tracking-widest mb-4">Récapitulatif</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-sm text-slate-700">
                <div className="flex flex-col">
                  <span className="font-medium">Hébergement</span>
                  {calculerTaxeSejour() > 0 && <span className="text-[10px] text-slate-500 italic">dont taxe de séjour : {calculerTaxeSejour().toFixed(2)} €</span>}
                </div>
                <span className="font-bold">{(calculerPrix() - calculerTotalSalles()).toFixed(2)} €</span>
              </div>
              {calculerTotalSalles() > 0 && (
                <div className="flex justify-between items-center text-sm text-slate-700">
                  <span className="font-medium">Salles de réunion</span>
                  <span className="font-bold">{calculerTotalSalles().toFixed(2)} €</span>
                </div>
              )}
              {calculerTotalRepas() > 0 && (
                <div className="flex justify-between items-center text-sm text-slate-700">
                  <span className="font-medium">Restauration</span>
                  <span className="font-bold">{calculerTotalRepas().toFixed(2)} €</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xl font-black text-slate-900">
                <span>Total</span>
                <div className="text-right">
                  {promoApplied && <span className="text-sm text-slate-400 line-through mr-2 font-normal">{(calculerPrix() / (promoApplied.type === 'pourcentage' ? (1 - promoApplied.valeur / 100) : 1) + (promoApplied.type === 'fixe' ? promoApplied.valeur : 0) + calculerTotalRepas()).toFixed(2)} €</span>}
                  <span>{(calculerPrix() + calculerTotalRepas()).toFixed(2)} €</span>
                </div>
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-3 border border-muc-blue/10">
              <p className="text-xs font-black uppercase text-muc-blue tracking-wider mb-1">Arrhes à régler</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{calculerTotalRepas() > 0 ? "30% hébergement + 100% restauration" : "Acompte (30%)"}</span>
                <span className="text-lg font-black text-muc-blue">{(calculerPrix() * 0.3 + calculerTotalRepas()).toFixed(2)} €</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3">* Inclut la taxe de séjour (4% + 10% part départementale, soit 4.4% du prix de la nuitée / adulte)</p>
          </div>
        </div>
      )}

          <button disabled={isSubmitting} type="submit" className="w-full bg-muc-blue text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-muc-blue/90 hover:scale-[1.02] transition-all shadow-xl mt-8 disabled:opacity-70 disabled:cursor-not-allowed">
            {isDevis ? (
              isSubmitting ? (
                <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Traitement en cours...</>
              ) : (
                <><Send size={20} /> Générer le devis</>
              )
            ) : (
              <><Send size={20} /> Valider</>
            )}
          </button>
        </>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          <button type="button" onClick={() => setStep(1)} className="text-sm font-bold text-muc-blue hover:underline mb-4 inline-block">
            ← Retour à la sélection
          </button>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Adresse Postale Complète <span className="text-red-500">*</span></label>
              <textarea required name="adressePostale" value={formData.adressePostale} onChange={handleChange} rows="3" className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-muc-yellow focus:bg-white transition-all outline-none font-medium" placeholder="Ex: 123 rue de la Paix, 75000 Paris" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 mb-4 uppercase tracking-tight">Détails des occupants</h3>
            
            {isAdmin && (
              <label className="flex items-center gap-2 mb-6 p-4 bg-blue-50/50 border border-blue-100 rounded-xl cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  name="collectOccupantsEmail"
                  checked={formData.collectOccupantsEmail || false}
                  onChange={(e) => setFormData(prev => ({ ...prev, collectOccupantsEmail: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[#004B93]" 
                />
                <span className="text-xs font-bold text-slate-700">
                  Laisser le client renseigner les occupants lui-même (envoie un e-mail avec un lien sécurisé)
                </span>
              </label>
            )}

            {formData.collectOccupantsEmail ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
                ℹ️ Un lien de saisie sécurisé sera envoyé par e-mail à <strong>{formData.email}</strong> pour qu'il puisse compléter les informations de son groupe.
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                let adultCount = 0;
                let childCount = 0;
                return formData.occupants.map((occ, idx) => {
                  const label = occ.estAdulte ? `Adulte ${++adultCount}` : `Mineur ${++childCount}`;
                  return (
                    <div key={idx} className={`p-5 rounded-2xl border-2 ${occ.estAdulte ? 'bg-slate-50/50 border-slate-100' : 'bg-amber-50/30 border-amber-100/50'} space-y-4`}>
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">{label}</h4>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${occ.estAdulte ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                          {occ.estAdulte ? 'Adulte (+18 ans)' : 'Mineur (-18 ans)'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className={`space-y-1 ${occ.estAdulte ? 'md:col-span-6' : 'md:col-span-5'}`}>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Nom {occ.estAdulte && <span className="text-red-500">*</span>}</label>
                          <input 
                            required={occ.estAdulte} 
                            type="text" 
                            placeholder={occ.estAdulte ? "Nom" : "Nom (optionnel)"} 
                            value={occ.nom} 
                            onChange={(e) => handleOccupantChange(idx, 'nom', e.target.value)} 
                            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:border-muc-yellow bg-white outline-none text-sm transition-all" 
                          />
                        </div>
                        <div className={`space-y-1 ${occ.estAdulte ? 'md:col-span-6' : 'md:col-span-4'}`}>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Prénom {occ.estAdulte && <span className="text-red-500">*</span>}</label>
                          <input 
                            required={occ.estAdulte} 
                            type="text" 
                            placeholder={occ.estAdulte ? "Prénom" : "Prénom (optionnel)"} 
                            value={occ.prenom} 
                            onChange={(e) => handleOccupantChange(idx, 'prenom', e.target.value)} 
                            className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:border-muc-yellow bg-white outline-none text-sm transition-all" 
                          />
                        </div>
                        {!occ.estAdulte && (
                          <div className="space-y-1 md:col-span-3">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Âge <span className="text-red-500">*</span></label>
                            <input 
                              required 
                              type="number" 
                              min="0" 
                              max="17" 
                              placeholder="Âge" 
                              value={occ.age} 
                              onChange={(e) => {
                                const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                handleOccupantChange(idx, 'age', val);
                              }} 
                              className="w-full px-2 py-2.5 rounded-xl border border-slate-200 focus:border-muc-yellow bg-white outline-none text-sm transition-all" 
                            />
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-dashed border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-600">Nationalité française :</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                            <input 
                              type="radio" 
                              name={`nationalite-${idx}`} 
                              checked={occ.nationalite === true} 
                              onChange={() => handleOccupantChange(idx, 'nationalite', true)} 
                              className="accent-muc-blue w-4 h-4"
                            />
                            Oui
                          </label>
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                            <input 
                              type="radio" 
                              name={`nationalite-${idx}`} 
                              checked={occ.nationalite === false} 
                              onChange={() => handleOccupantChange(idx, 'nationalite', false)} 
                              className="accent-muc-blue w-4 h-4"
                            />
                            Non
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
            )}
          </div>

          <div className="bg-muc-blue/5 p-6 rounded-2xl border-2 border-muc-blue/10">
            <h3 className="text-sm font-black uppercase text-muc-blue tracking-widest mb-3">Récapitulatif final</h3>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center text-sm text-slate-700">
                <div className="flex flex-col">
                  <span className="font-medium">Hébergement</span>
                  {calculerTaxeSejour() > 0 && <span className="text-[10px] text-slate-500 italic">dont taxe de séjour : {calculerTaxeSejour().toFixed(2)} €</span>}
                </div>
                <span className="font-bold">{(calculerPrix() - calculerTotalSalles()).toFixed(2)} €</span>
              </div>
              {calculerTotalSalles() > 0 && (
                <div className="flex justify-between items-center text-sm text-slate-700">
                  <span className="font-medium">Salles de réunion</span>
                  <span className="font-bold">{calculerTotalSalles().toFixed(2)} €</span>
                </div>
              )}
              {calculerTotalRepas() > 0 && (
                <div className="flex justify-between items-center text-sm text-slate-700">
                  <span className="font-medium">Restauration</span>
                  <span className="font-bold">{calculerTotalRepas().toFixed(2)} €</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-xl font-black text-slate-900">
                <span>Total</span>
                <span>{(calculerPrix() + calculerTotalRepas()).toFixed(2)} €</span>
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-3 border border-muc-blue/10">
              <p className="text-xs font-black uppercase text-muc-blue tracking-wider mb-1">Arrhes à régler</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{calculerTotalRepas() > 0 ? "30% hébergement + 100% restauration" : "Acompte (30%)"}</span>
                <span className="text-lg font-black text-muc-blue">{(calculerPrix() * 0.3 + calculerTotalRepas()).toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <button disabled={isSubmitting} type="submit" className={`w-full bg-muc-yellow text-muc-blue py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl mt-8 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#FCD34D] hover:scale-[1.02]'}`}>
            {isSubmitting ? (
              <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-muc-blue"></div> Traitement en cours...</>
            ) : (
              <><Send size={20} /> {isAdmin ? 'Valider' : 'Confirmer la demande'}</>
            )}
          </button>
        </div>
      )}

      </form>

      {/* Pop-up de Confirmation de Succès / Alerte avec avertissement de dernière minute */}
      {successMsg && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 w-screen h-screen">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4 animate-bounce shrink-0">
              <CheckCircle size={40} />
            </div>
            
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">
              {isDevis ? "Devis Envoyé" : isAdmin ? "Réservation Enregistrée" : "Demande enregistrée !"}
            </h3>
            
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed animate-fade-in">
              {isDevis || isAdmin ? successMsg : "Votre demande de réservation pour le gîte a bien été transmise. L'équipe va l'étudier rapidement."}
            </p>

            {isLastMinute && lastMinuteWarning && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left w-full">
                <div className="flex items-start gap-3 text-amber-800">
                  <AlertTriangle className="shrink-0 text-amber-600 mt-0.5 animate-pulse" size={18} />
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider block mb-1 text-amber-700">Avertissement de dernière minute</span>
                    <p className="text-xs font-semibold leading-relaxed">{lastMinuteWarning}</p>
                  </div>
                </div>
              </div>
            )}
            
            <button 
              onClick={() => {
                setSuccessMsg('');
                setIsLastMinute(false);
                setLastMinuteWarning('');
                if (isAdmin) {
                  onCreated();
                  navigate('/admin');
                } else {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  navigate('/');
                }
              }} 
              className="bg-[#004B93] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-800 transition-colors w-full uppercase tracking-wider"
            >
              D'accord
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ReservationForm;
