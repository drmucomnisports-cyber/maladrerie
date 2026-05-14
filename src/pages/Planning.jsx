import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, Calendar as CalendarIcon } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ReservationForm from '../components/ReservationForm';

gsap.registerPlugin(ScrollTrigger);

const locales = {
  'fr': fr,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const CHAMBRES_INFO = {
  1: { num: 1, name: 'Chambre PMR', lits: 5, etage: 'RDC' },
  2: { num: 2, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  3: { num: 3, name: 'Chambre standard', lits: 6, etage: '1er étage' },
  4: { num: 4, name: 'Grande chambre', lits: 8, etage: '2e étage' },
  5: { num: 5, name: 'Chambre standard', lits: 6, etage: '2e étage' },
  6: { num: 6, name: 'Chambre standard', lits: 5, etage: '2e étage' }
};

const Planning = () => {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('month');

  const sectionsRef = useRef([]);

  const addToRefs = (el) => {
    if (el && !sectionsRef.current.includes(el)) {
      sectionsRef.current.push(el);
    }
  };

  const fetchReservations = () => {
    fetch(`${API_URL}/api/reservations`)
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) {
          const formattedEvents = data.map(r => ({
            title: r.statut === 'RESERVE' 
              ? `Réservé (Ch. ${r.chambres.join(', ')})` 
              : r.statut === 'DEVIS_EN_ATTENTE'
                ? `Devis en cours (Ch. ${r.chambres.join(', ')})`
                : `Attente (Ch. ${r.chambres.join(', ')})`,
            start: new Date(r.dateDebut),
            end: new Date(r.dateFin),
            allDay: true,
            statut: r.statut,
            chambres: r.chambres
          }));
          setEvents(formattedEvents);
        }
      })
      .catch(err => console.error("Erreur chargement reservations:", err));
  };

  React.useEffect(() => {
    fetchReservations();

    let ctx = gsap.context(() => {
      // Animation Hero
      gsap.from(".planning-header", {
        opacity: 0,
        y: 50,
        duration: 1.2,
        ease: "power4.out"
      });

      // Reveal elements
      const elements = document.querySelectorAll('[data-reveal]');
      elements.forEach((el) => {
        const direction = el.dataset.reveal;
        const vars = {
          scrollTrigger: {
            trigger: el,
            start: "top bottom-=50",
            toggleActions: "play none none reverse"
          },
          opacity: 0,
          duration: 1,
          ease: "power4.out"
        };

        if (direction === 'left') vars.x = -80;
        if (direction === 'right') vars.x = 80;
        if (direction === 'bottom') vars.y = 80;

        gsap.from(el, vars);
      });
    });

    return () => ctx.revert();
  }, []);

  const eventStyleGetter = (event) => {
    const isReserved = event.statut === 'RESERVE';
    const isDevis = event.statut === 'DEVIS_EN_ATTENTE';
    return {
      style: {
        backgroundColor: isReserved ? '#0068B3' : isDevis ? '#F59E0B' : '#F9B233',
        borderRadius: '10px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontWeight: '900',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        padding: '2px 8px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
      }
    };
  };



  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans text-slate-900">
      {/* Navigation Style MUC Formation - Identique Home */}
      <nav className="bg-white/95 backdrop-blur-md border-b-4 border-muc-yellow px-8 py-0 rounded-xl flex items-center shadow-lg w-11/12 max-w-6xl h-20 mx-auto mt-6">
        <div className="hidden lg:flex gap-8 text-[13px] font-black uppercase tracking-wider text-slate-700 flex-1 justify-end">
          <Link to="/" className="hover:text-muc-blue transition-colors">Accueil</Link>
        </div>
        
        <div className="mx-12 shrink-0 flex flex-col items-center">
          <Link to="/" className="flex flex-col items-center">
            <div className="bg-muc-blue p-3 rounded-b-2xl shadow-md -mt-1 mb-1">
              <span className="font-black text-white tracking-tighter text-xl">MUC</span>
            </div>
            <span className="text-[10px] font-black text-muc-blue tracking-[0.2em] uppercase">Gîte de la Maladrerie</span>
          </Link>
        </div>

        <div className="hidden lg:flex gap-8 text-[13px] font-black uppercase tracking-wider text-slate-700 flex-1 items-center">
          <span className="text-muc-blue border-b-2 border-muc-blue pb-1">Planning</span>
        </div>

        {/* Mobile toggle (simplified) */}
        <div className="lg:hidden flex-1 flex justify-end">
           <Link to="/" className="bg-muc-blue text-white px-4 py-2 rounded-lg text-xs font-black">ACCUEIL</Link>
        </div>
      </nav>

      <header className="planning-header pt-24 pb-24 bg-muc-blue text-white slanted-bottom relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('/photos/Vue 1.jpg')] bg-cover bg-center pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="bg-muc-yellow text-muc-blue inline-block px-4 py-1 font-black text-sm uppercase tracking-widest mb-6 skew-x-[-15deg]">
            <span className="inline-block skew-x-[15deg]">Disponibilités</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter mb-4 drop-shadow-xl">
            RÉSERVATIONS
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl font-medium leading-relaxed">
            Consultez le planning en temps réel et envoyez votre demande de séjour.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-1/3 h-full bg-white/5 skew-x-[-20deg] transform translate-x-1/2"></div>
      </header>

      <div className="px-6 max-w-7xl mx-auto pb-24 -mt-12 relative z-20">
        <div className="grid lg:grid-cols-3 gap-12">
          {/* Calendrier */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-2xl border-t-8 border-muc-blue" data-reveal="left">
            <div className="h-[650px]">
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                culture="fr"
                date={currentDate}
                view={currentView}
                onNavigate={setCurrentDate}
                onView={setCurrentView}
                eventPropGetter={eventStyleGetter}
                messages={{
                  next: "Suivant",
                  previous: "Précédent",
                  today: "Aujourd'hui",
                  month: "Mois",
                  week: "Semaine",
                  day: "Jour"
                }}
                className="font-sans"
              />
            </div>
          </div>

          {/* Formulaire */}
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl h-fit sticky top-32 border-t-8 border-muc-yellow" data-reveal="right">
            <h2 className="text-3xl font-black text-muc-blue mb-8 uppercase tracking-tight">
              {new URLSearchParams(window.location.search).get('mode') === 'devis' ? 'Générer un Devis' : 'Réservation'}
            </h2>
            <ReservationForm 
              events={events} 
              isAdmin={!!localStorage.getItem('adminToken')} 
              isDevis={new URLSearchParams(window.location.search).get('mode') === 'devis'}
              onCreated={fetchReservations} 
            />
          </div>
        </div>
      </div>

      <footer className="bg-muc-blue py-20 px-6 text-center slanted-top relative overflow-hidden mt-12">
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 opacity-80 border-t border-white/10 pt-12 pb-8">
             <div className="flex flex-col items-start">
               <span className="font-black text-white tracking-tighter text-2xl">MUC</span>
               <span className="text-[10px] font-black text-muc-yellow tracking-[0.2em] uppercase">La Maladrerie</span>
             </div>
             <p className="text-xs text-white uppercase tracking-[0.3em] font-medium">
               © {new Date().getFullYear()} MUCOmnisports - Gîte de La Maladrerie
             </p>
          </div>
          <div className="pt-8 border-t border-white/5">
             <Link to="/login" className="text-[10px] text-white/40 hover:text-muc-yellow transition-colors font-bold uppercase tracking-[0.2em]">
                Espace Pro
             </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Planning;
