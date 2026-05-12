import { useState, useEffect } from 'react';
import { API_URL } from '../config';

function IntervenantPortal() {
  const [email, setEmail] = useState('');
  const [intervenant, setIntervenant] = useState(null);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if already logged in via localStorage
  useEffect(() => {
    const storedIntervenant = localStorage.getItem('intervenant');
    if (storedIntervenant) {
      setIntervenant(JSON.parse(storedIntervenant));
    }
  }, []);

  useEffect(() => {
    if (intervenant) {
      fetchMissions();
    }
  }, [intervenant]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiUrl = API_URL;
      const response = await fetch(`${apiUrl}/api/intervenant/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur de connexion');
      
      setIntervenant(data.intervenant);
      localStorage.setItem('intervenant', JSON.stringify(data.intervenant));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = API_URL;
      const response = await fetch(`${apiUrl}/api/intervenant/${intervenant.id}/missions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la récupération des missions');
      
      setMissions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIntervenant(null);
    setMissions([]);
    localStorage.removeItem('intervenant');
  };

  const getStatusBadge = (statut) => {
    switch(statut) {
      case 'ACCEPTEE': return <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">Acceptée</span>;
      case 'REFUSEE': return <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">Refusée</span>;
      default: return <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded">En attente</span>;
    }
  };

  if (!intervenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Portail Intervenant
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Connectez-vous pour consulter vos missions.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border-t-4 border-[#004B93]">
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Adresse e-mail
                </label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#004B93] focus:border-[#004B93] sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#004B93] hover:bg-[#003870] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#004B93] disabled:opacity-50"
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-[100px] sm:pt-[120px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 border-b border-gray-200 sm:px-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-[#004B93]">
                Bienvenue, {intervenant.prenom} {intervenant.nom}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Voici le récapitulatif de vos missions
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#004B93]"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {loading && <p className="text-center text-gray-500 py-8">Chargement des missions...</p>}
        {error && <p className="text-center text-red-500 py-8">{error}</p>}

        {!loading && !error && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            {missions.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {missions.map((mission) => (
                  <li key={mission.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#004B93] truncate">
                          {mission.typeMission}
                        </p>
                        <div className="ml-2 flex-shrink-0 flex">
                          {getStatusBadge(mission.statut)}
                        </div>
                      </div>
                      <div className="mt-2 sm:flex sm:justify-between">
                        <div className="sm:flex">
                          <p className="flex items-center text-sm text-gray-500">
                            Réservation du {new Date(mission.reservation.dateDebut).toLocaleDateString('fr-FR')} 
                            au {new Date(mission.reservation.dateFin).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                          <p>Rémunération: <span className="font-semibold text-gray-900">{mission.montant.toFixed(2)} €</span></p>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-12 text-center sm:px-6">
                <p className="text-sm text-gray-500">Vous n'avez aucune mission assignée pour le moment.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default IntervenantPortal;
