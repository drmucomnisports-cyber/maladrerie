import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Link } from 'react-router-dom';

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

function PlanningIntervenants() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // States controlled for calendar navigation
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(Views.MONTH);

  useEffect(() => {
    fetchPlanning();
  }, []);

  const fetchPlanning = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/equipe/planning`);
      if (!res.ok) throw new Error('Erreur lors du chargement du planning');
      const data = await res.json();
      
      // Convert date strings back to Date objects
      const formattedEvents = data.map(ev => ({
        ...ev,
        start: new Date(ev.start),
        end: new Date(ev.end)
      }));
      
      setEvents(formattedEvents);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
    setLoading(false);
  };

  const eventStyleGetter = (event, start, end, isSelected) => {
    let backgroundColor = '#3174ad';
    let borderColor = '#204d74';
    
    if (event.type === 'dispo') {
      backgroundColor = '#22c55e'; // green-500
      borderColor = '#166534'; // green-800
    } else if (event.type === 'reservation') {
      if (event.statut === 'EN_ATTENTE') {
        backgroundColor = '#f59e0b'; // amber-500
        borderColor = '#b45309'; // amber-700
      } else {
        backgroundColor = '#004B93'; // muc-blue
        borderColor = '#003366';
      }
    }

    const style = {
      backgroundColor,
      borderRadius: '5px',
      opacity: 0.9,
      color: 'white',
      border: `1px solid ${borderColor}`,
      display: 'block',
      fontWeight: 'bold',
      padding: '2px 5px',
      fontSize: '0.8rem'
    };
    return { style };
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-[#004B93] text-white py-6 shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Planning Équipe</h1>
            <p className="text-blue-200 text-sm mt-1">Disponibilités et Réservations du Gîte de la Maladrerie</p>
          </div>
          <Link to="/" className="text-white hover:text-blue-200 transition-colors font-bold uppercase text-sm">
            Retour à l'accueil
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-green-500 inline-block border border-green-800"></span>
              <span className="text-sm text-slate-600 font-medium">Disponibilité Intervenant</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-[#004B93] inline-block border border-[#003366]"></span>
              <span className="text-sm text-slate-600 font-medium">Réservation Validée</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-amber-500 inline-block border border-amber-700"></span>
              <span className="text-sm text-slate-600 font-medium">Réservation En attente</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-[600px]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-muc-blue"></div>
            </div>
          ) : (
            <div className="h-[700px]">
              <Calendar
                localizer={localizer}
                events={events}
                date={currentDate}
                view={currentView}
                onNavigate={(newDate) => setCurrentDate(newDate)}
                onView={(newView) => setCurrentView(newView)}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                messages={{
                  next: "Suivant",
                  previous: "Précédent",
                  today: "Aujourd'hui",
                  month: "Mois",
                  week: "Semaine",
                  day: "Jour",
                  agenda: "Agenda",
                  date: "Date",
                  time: "Heure",
                  event: "Événement",
                  noEventsInRange: "Aucun événement dans cette période."
                }}
                eventPropGetter={eventStyleGetter}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default PlanningIntervenants;
