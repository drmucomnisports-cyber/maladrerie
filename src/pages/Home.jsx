import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mountain, Users, ArrowRight, MapPin, Calendar, CheckCircle2, Bed, Train, Car, Bike, Info, Sparkles, Trash2, Waves, Compass, Utensils, Presentation } from 'lucide-react';
import { Link } from 'react-router-dom';

gsap.registerPlugin(ScrollTrigger);

const Home = () => {
  const heroRef = useRef(null);
  const sectionsRef = useRef([]);

  const addToRefs = (el) => {
    if (el && !sectionsRef.current.includes(el)) {
      sectionsRef.current.push(el);
    }
  };

  useEffect(() => {
    let ctx = gsap.context(() => {
      // Animation Hero
      gsap.from(heroRef.current, {
        opacity: 0,
        y: 50,
        duration: 1.5,
        ease: "power4.out"
      });

      // Animation au défilement pour toutes les sections
      // Animation par défaut des sections
      sectionsRef.current.forEach((section) => {
        gsap.from(section, {
          scrollTrigger: {
            trigger: section,
            start: "top bottom-=100",
            toggleActions: "play none none reverse"
          },
          opacity: 0,
          y: 40,
          duration: 0.8,
          ease: "power3.out"
        });
      });

      // Animations spécifiques par direction (data-reveal)
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
        if (direction === 'top') vars.y = -80;

        gsap.from(el, vars);
      });
    });

    return () => ctx.revert();
  }, []);

  // Smooth scroll for anchor links
  const handleScroll = (e, targetId) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 20, // Plus besoin de gros offset pour le nav fixe
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="min-h-screen mesh-bg text-slate-900 font-sans selection:bg-muc-blue/20">
      {/* Overlay de grain de film subtil (Bruit) */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-50 mix-blend-overlay" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }}></div>
      
      {/* Navigation Flottante Style MUC Formation */}
      <nav className="relative mt-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border-b-4 border-muc-yellow px-8 py-0 rounded-xl flex items-center shadow-lg w-11/12 max-w-6xl h-20">
        {/* Menu Gauche */}
        <div className="hidden lg:flex gap-8 text-[13px] font-black uppercase tracking-wider text-slate-700 flex-1 justify-end">
          <a href="#presentation" onClick={(e) => handleScroll(e, 'presentation')} className="hover:text-muc-blue transition-colors">Le Gîte</a>
          <a href="#gite" onClick={(e) => handleScroll(e, 'gite')} className="hover:text-muc-blue transition-colors">Hébergement</a>
        </div>

        {/* Logo Central */}
        <div className="mx-12 shrink-0 flex flex-col items-center">
            <div className="bg-white p-2 rounded-b-2xl shadow-md -mt-1 mb-1 flex items-center justify-center">
              <img src="/logo-muc.jpg" alt="MUC Omnisports" className="h-10 w-auto object-contain" />
            </div>
          <span className="text-[10px] font-bold text-muc-blue tracking-[0.2em] uppercase">Gîte de la Maladrerie</span>
        </div>

        {/* Menu Droite */}
        <div className="hidden lg:flex gap-8 text-[13px] font-black uppercase tracking-wider text-slate-700 flex-1 items-center">
          <a href="#activites" onClick={(e) => handleScroll(e, 'activites')} className="hover:text-muc-blue transition-colors">Activités</a>
          <a href="#infos" onClick={(e) => handleScroll(e, 'infos')} className="hover:text-muc-blue transition-colors">Infos</a>
          <Link to="/planning" className="bg-muc-yellow text-muc-blue px-6 py-2 rounded-lg text-sm font-black hover:bg-[#E5A600] transition-all ml-4 shadow-sm">
            RÉSERVER
          </Link>
        </div>

        {/* Mobile menu toggle simplified */}
        <div className="lg:hidden flex-1 flex justify-end">
           <Link to="/planning" className="bg-muc-yellow text-muc-blue px-4 py-2 rounded-lg text-xs font-black">RÉSERVER</Link>
        </div>
      </nav>

      {/* Hero Section Style MUC Formation */}
      <section className="relative h-[85vh] flex items-center justify-center overflow-hidden slanted-bottom bg-slate-900">
        <img 
          src="/photos/Extérieur 1.jpg" 
          className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105"
          alt="Extérieur du Gîte de la Maladrerie"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-muc-blue/80 to-transparent"></div>
        <div ref={heroRef} className="relative z-10 text-center px-4">
          <div className="bg-muc-yellow text-muc-blue inline-block px-4 py-1 font-black text-sm uppercase tracking-widest mb-6 skew-x-[-15deg]">
            <span className="inline-block skew-x-[15deg]">Millau, Aveyron</span>
          </div>
          <h1 className="text-6xl md:text-9xl font-black text-white mb-6 uppercase tracking-tighter drop-shadow-2xl">
            Gîte de la Maladrerie
          </h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-md">
            Centre d'hébergement & Base de sports de pleine nature.
          </p>
        </div>
      </section>

      {/* Présentation */}
      <section id="presentation" className="py-32 px-6 max-w-5xl mx-auto" ref={addToRefs}>
        <div className="flex flex-col items-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black uppercase text-muc-blue text-center leading-tight tracking-tighter" data-reveal="top">Un lieu d'exception à Millau</h2>
          <div className="h-2 w-24 bg-muc-yellow mt-6" data-reveal="bottom"></div>
        </div>
        <div className="bg-white p-10 md:p-16 rounded-[2.5rem] shadow-2xl border-t-8 border-muc-blue relative overflow-hidden group hover-lift" data-reveal="bottom">
          <div className="absolute top-0 right-0 w-64 h-64 bg-muc-blue/5 rounded-full -mr-32 -mt-32 group-hover:scale-110 transition-transform duration-700"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-muc-yellow/10 rounded-full -ml-24 -mb-24 group-hover:scale-110 transition-transform duration-700"></div>
          <div className="space-y-6 text-lg text-slate-700 leading-relaxed font-medium relative z-10">
            <p>
              Le Gîte de la Maladrerie est une ancienne bâtisse de charme située au bord du Tarn. Ce lieu paisible se prête aussi bien à la détente qu'à la pratique d'activités sportives.
            </p>
            <p>
              Surnommée la <strong className="text-muc-blue font-black">capitale des sports de pleine nature</strong>, Millau offre un terrain de jeu idéal pour le parapente, l'escalade, l'équitation, le VTT, la randonnée, le trail, ou encore le canoë-kayak.
            </p>
            <p>
              Sur le plan culturel, les visiteurs peuvent découvrir le célèbre <strong className="text-muc-blue font-black">Viaduc de Millau</strong>, explorer les Gorges du Tarn ou visiter le musée local consacré à la tradition historique de la ganterie en cuir.
            </p>
            <p>
              Sa situation est particulièrement avantageuse : en quelques minutes à pied seulement, il est possible de rejoindre le centre-ville et de profiter de cette commune aveyronnaise reconnue pour ses paysages remarquables. Le site est également proche d'aménagements agréables comme un parc, les quais, des espaces conviviaux et des pistes cyclables.
            </p>
          </div>
        </div>
      </section>

      {/* Hébergement & Commodités */}
      <section id="gite" className="py-24 px-6 max-w-7xl mx-auto" ref={addToRefs}>
        <div className="flex flex-col md:flex-row items-end gap-4 mb-16">
          <h2 className="text-5xl font-black uppercase text-muc-blue leading-none">Hébergement</h2>
          <div className="h-2 w-24 bg-muc-yellow mb-2 hidden md:block"></div>
        </div>
        <div className="grid md:grid-cols-3 gap-12">
          
          <div className="p-10 rounded-[2.5rem] bg-white border-l-8 border-muc-blue shadow-lg hover-lift relative overflow-hidden" data-reveal="left">
            <Users className="text-muc-blue mb-6" size={32} />
            <h3 className="text-2xl font-black mb-4 text-muc-blue uppercase tracking-tight">38 Lits</h3>
            <p className="text-slate-600 leading-relaxed font-medium">
              6 chambres spacieuses (5, 6 ou 8 lits) dont une chambre PMR de 5 lits. Idéal pour groupes et sportifs.
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-white border-l-8 border-muc-yellow shadow-lg hover-lift relative overflow-hidden" data-reveal="bottom">
            <Bed className="text-muc-blue mb-6" size={32} />
            <h3 className="text-2xl font-black mb-4 text-muc-blue uppercase tracking-tight">Équipements</h3>
            <p className="text-slate-600 leading-relaxed font-medium">
              Accès à une grande cuisine équipée, des sanitaires adaptés, un jardin agréable et connexion Wi-Fi.
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-white border-l-8 border-muc-blue shadow-lg hover-lift relative overflow-hidden" data-reveal="right">
            <Bike className="text-muc-blue mb-6" size={32} />
            <h3 className="text-2xl font-black mb-4 text-muc-blue uppercase tracking-tight">Stockage</h3>
            <p className="text-slate-600 leading-relaxed font-medium">
              Garage sécurisé pour entreposer VTT, kayaks, parapentes ou tout équipement volumineux.
            </p>
          </div>
        </div>
      </section>

      {/* Galerie Photos */}
      <section id="galerie" className="py-24 px-6 max-w-7xl mx-auto" ref={addToRefs}>
        <div className="flex flex-col items-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black uppercase text-muc-blue text-center leading-tight tracking-tighter" data-reveal="top">Découvrez les lieux</h2>
          <div className="h-2 w-24 bg-muc-yellow mt-6" data-reveal="bottom"></div>
        </div>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
          {[
            { src: "/photos/Extérieur 2.jpg", alt: "Extérieur 2" },
            { src: "/photos/Intérieur 1.jpg", alt: "Intérieur 1" },
            { src: "/photos/Chambre 1.jpg", alt: "Chambre 1" },
            { src: "/photos/Vue 1.jpg", alt: "Vue 1" },
            { src: "/photos/Cuisine.jpg", alt: "Cuisine" },
            { src: "/photos/Extérieur 3.jpg", alt: "Extérieur 3" },
            { src: "/photos/Chambre 2.jpg", alt: "Chambre 2" },
            { src: "/photos/Sanitaire.jpg", alt: "Sanitaire" },
            { src: "/photos/Vue 2.jpg", alt: "Vue 2" },
          ].map((img, index) => (
            <div key={index} className="relative overflow-hidden rounded-[2.5rem] shadow-lg hover-lift group cursor-pointer border-4 border-white bg-white break-inside-avoid" data-reveal="bottom">
              <img src={img.src} alt={img.alt} className="w-full h-auto object-cover transform group-hover:scale-110 transition-transform duration-500" loading="lazy" />
              <div className="absolute inset-0 bg-muc-blue/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          ))}
        </div>
      </section>

      {/* Activités & Services */}
      <section id="activites" className="py-32 px-6 bg-muc-blue text-white slanted-both relative overflow-hidden" ref={addToRefs}>
        <div className="absolute inset-0 opacity-10 bg-[url('/photos/Extérieur 3.jpg')] bg-cover bg-center pointer-events-none"></div>
        <div className="max-w-7xl mx-auto py-12 relative z-10">
          <div className="flex flex-col items-center mb-16 text-center max-w-4xl mx-auto" data-reveal="top">
            <h2 className="text-5xl font-black uppercase mb-6 tracking-tighter">Activités & Services</h2>
            <div className="h-2 w-32 bg-muc-yellow mb-8"></div>
            <p className="text-xl text-blue-100 font-medium leading-relaxed mb-6">
              Nous proposons des séjours et stages clé en main, conçus en partenariat avec des associations locales spécialisées. En plus des activités de pleine nature plutôt sportives, nous proposons également des activités de découverte de l'environnement. Chaque projet peut être construit sur mesure afin de s'adapter aux objectifs pédagogiques, aux publics et aux contraintes des groupes accueillis.
            </p>
            <p className="text-xl text-blue-100 font-medium leading-relaxed">
              Nous pouvons accueillir vos classes de découverte et voyages scolaires pour les enfants de plus de six ans.
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-10 items-start">
            {/* Restauration (Haut Gauche) */}
            <div className="bg-muc-blue border-t-8 border-muc-yellow p-10 rounded-[2.5rem] flex flex-col h-full shadow-2xl hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden group" data-reveal="left">
              <h3 className="text-3xl font-black mb-10 text-muc-yellow flex items-center gap-4 uppercase tracking-tight">
                <div className="bg-muc-yellow/20 p-3 rounded-2xl text-muc-yellow">
                  <Utensils size={32} />
                </div>
                Restauration
              </h3>
              <p className="text-white text-lg font-medium leading-relaxed mb-8">
                Un service de repas de qualité adapté à vos séjours :
              </p>
              <ul className="space-y-8 text-lg">
                <li className="flex items-start gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform mt-1 shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Alimentation saine</strong> : menus élaborés en privilégiant les produits bruts, locaux et à 63 % bio.</span>
                </li>
                <li className="flex items-start gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform mt-1 shrink-0">
                    <Info size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Menus en ligne</strong> : repas consultables directement sur le site de la cantine de la Ville de Millau.</span>
                </li>
              </ul>
            </div>

            {/* Pleine Nature (Haut Milieu) */}
            <div className="bg-muc-blue border-t-8 border-muc-yellow p-10 rounded-[2.5rem] flex flex-col h-full shadow-2xl hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden group" data-reveal="bottom">
              <h3 className="text-3xl font-black mb-10 text-muc-yellow flex items-center gap-4 uppercase tracking-tight">
                <div className="bg-muc-yellow/20 p-3 rounded-2xl text-muc-yellow">
                  <Mountain size={32} />
                </div>
                Pleine Nature
              </h3>
              <ul className="space-y-8 text-lg">
                <li className="flex items-center gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Waves size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Canoë-kayak</strong> : location et descentes sur le Tarn</span>
                </li>
                <li className="flex items-center gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <CheckCircle2 size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Escalade & Via Ferrata</strong> : sites naturels d'exception</span>
                </li>
                <li className="flex items-center gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Compass size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Spéléologie & Parapente</strong> : l'aventure totale</span>
                </li>
                <li className="flex items-center gap-5">
                  <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Bike size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">VTT & Randonnée</strong> : sentiers du PNR des Grands Causses</span>
                </li>
              </ul>
            </div>

            {/* Pack Confort (Haut Droite) */}
            <div className="bg-muc-blue border-t-8 border-muc-yellow p-10 rounded-[2.5rem] flex flex-col h-full shadow-2xl hover:-translate-y-2 transition-transform duration-300 relative overflow-hidden group" data-reveal="right">
              <h3 className="text-3xl font-black mb-10 text-muc-yellow flex items-center gap-4 uppercase tracking-tight">
                <div className="bg-muc-yellow/20 p-3 rounded-2xl text-muc-yellow">
                  <Sparkles size={32} />
                </div>
                Pack Confort
              </h3>
              <p className="text-white text-lg font-medium leading-relaxed mb-10">
                Construisez votre séjour « à la carte » :
              </p>
              <ul className="space-y-8 text-lg">
                <li className="flex items-center gap-5">
                   <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Bed size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Lits faits</strong> : confort immédiat à l'arrivée</span>
                </li>
                <li className="flex items-center gap-5">
                   <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Info size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Linge de toilette</strong> fourni à la demande</span>
                </li>
                <li className="flex items-center gap-5">
                   <div className="bg-muc-yellow p-1.5 rounded-lg text-muc-blue group-hover:translate-x-2 transition-transform">
                    <Trash2 size={20} />
                  </div>
                  <span className="text-white text-lg font-medium leading-relaxed"><strong className="text-white">Ménage inclus</strong> : partez l'esprit tranquille</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Salles de réunion */}
          <div className="mt-20 bg-white text-slate-900 p-10 md:p-16 rounded-[2.5rem] shadow-2xl relative overflow-hidden border-b-8 border-muc-yellow" data-reveal="bottom">
            <div className="absolute top-0 right-0 w-64 h-64 bg-muc-blue/5 rounded-full -mr-32 -mt-32 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
              <div className="space-y-6 lg:max-w-2xl">
                <div className="bg-muc-blue text-white inline-block px-4 py-1 font-black text-sm uppercase tracking-widest skew-x-[-15deg]">
                  <span className="inline-block skew-x-[15deg]">Espace Travail & Séminaires</span>
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-muc-blue uppercase tracking-tight">Location de Salles de Réunion</h3>
                <p className="text-lg text-slate-600 font-medium leading-relaxed">
                  Nous mettons à votre disposition <strong className="text-muc-blue font-black">2 salles de réunion</strong> pouvant accueillir respectivement <strong className="text-muc-blue font-black">15 et 12 personnes</strong>. Parfaitement adaptées pour vos réunions, séminaires ou sessions de travail.
                </p>
                <div className="grid sm:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <p className="font-bold text-muc-blue uppercase text-xs tracking-wider flex items-center gap-2">
                      <Presentation size={18} className="text-muc-yellow" /> Équipement complet
                    </p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Tables, chaises, écran numérique ou vidéoprojecteur, WC et lavabo.</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-muc-blue uppercase text-xs tracking-wider flex items-center gap-2">
                      <Calendar size={18} className="text-muc-yellow" /> Conditions d'accès
                    </p>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">Vendredi (hors vac.) : dès 17h jusqu'à 9h le samedi. Week-ends et vacances (zone C) : de 9h à 9h le lendemain.</p>
                  </div>
                </div>
              </div>
              <div className="bg-muc-blue text-white p-8 rounded-[2rem] text-center shrink-0 lg:w-80 shadow-lg flex flex-col justify-center border-t-4 border-muc-yellow">
                <p className="text-xs uppercase font-black tracking-widest text-muc-yellow mb-4">Tarifs de location</p>
                <div className="space-y-6">
                  <div>
                    <span className="block text-4xl font-black text-white">100 € <span className="text-sm font-bold opacity-75">/ jour</span></span>
                    <span className="text-xs text-blue-200 mt-1 block">si réservé avec le gîte</span>
                  </div>
                  <div className="border-t border-white/10 pt-4">
                    <span className="block text-4xl font-black text-white">150 € <span className="text-sm font-bold opacity-75">/ jour</span></span>
                    <span className="text-xs text-blue-200 mt-1 block">en location seule</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tarifs, Infos, Localisation */}
      <section id="infos" className="py-24 px-6 max-w-7xl mx-auto" ref={addToRefs}>
        <div className="grid md:grid-cols-2 gap-20">
          
          {/* Tarifs et Périodes */}
          <div className="space-y-12">
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-black uppercase text-muc-blue leading-none">Tarifs & Ouverture</h2>
              <div className="h-1.5 flex-1 bg-muc-blue/10"></div>
            </div>
            
            <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border-l-8 border-muc-blue relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-muc-blue/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
              <h3 className="text-2xl font-black mb-6 text-muc-blue flex items-center gap-3 uppercase tracking-tight">
                <Calendar size={28} /> Ouverture
              </h3>
              <p className="text-slate-600 font-medium text-lg leading-relaxed">
                Le Gîte de la Maladrerie est ouvert à tous, tout au long de l'année. Que vous soyez un groupe constitué, une association sportive, une structure scolaire, une entreprise ou des voyageurs individuels, nous vous accueillons en toutes saisons.
              </p>
            </div>

            <div className="bg-muc-blue text-white p-10 rounded-[2.5rem] shadow-2xl hover-lift relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tight">Tarifs d'hébergement</h3>
              <div className="text-6xl font-black mt-4 text-muc-yellow tracking-tighter">22 € <span className="text-2xl font-bold opacity-60 text-white uppercase tracking-normal">à</span> 25 €</div>
              <p className="mt-4 text-blue-100 text-lg font-medium italic">Par personne et par nuit.</p>
              <ul className="mt-4 space-y-1.5 text-sm font-medium text-blue-100/80">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muc-yellow opacity-75 shrink-0"></div>
                  <span><strong className="text-white">22 €</strong> si la chambre est complète</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muc-yellow opacity-75 shrink-0"></div>
                  <span><strong className="text-white">25 €</strong> si la chambre n'est pas complète</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Localisation et Accès */}
          <div className="space-y-12">
            <div className="flex items-center gap-4">
              <h2 className="text-4xl font-black uppercase text-muc-blue leading-none">Accès & Contact</h2>
              <div className="h-1.5 flex-1 bg-muc-blue/10"></div>
            </div>
            
            <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border-l-8 border-muc-yellow relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-muc-yellow/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
              <h3 className="text-2xl font-black mb-6 text-muc-blue flex items-center gap-3 uppercase tracking-tight">
                <MapPin size={28} /> Localisation
              </h3>
              <p className="text-slate-700 mb-8 font-bold text-xl">Av. Louis Balsan, 12100 Millau</p>
              <ul className="space-y-4 text-slate-600 font-medium">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Bord du Tarn</strong> : à 300 mètres</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Stade d'eau vive et terrain sportif en herbe</strong> : à 400 mètres</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Centre-ville</strong> : accessible en quelques minutes à pied</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Parc de loisirs de la Maladrerie</strong> : à 500 mètres</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Commodités</strong> : supermarché à 500 mètres</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-muc-yellow rounded-full mt-2 shrink-0"></div>
                  <span><strong className="text-slate-800">Terrain de jeux « La Plage » et plage du Gourd de Bade</strong> : à 600 mètres</span>
                </li>
              </ul>
            </div>

            <div className="space-y-6" data-reveal="right">
              <div className="bg-white p-6 rounded-[2rem] flex flex-col sm:flex-row items-center sm:items-start gap-6 hover-lift shadow-lg border-l-8 border-muc-blue">
                <div className="bg-muc-blue/10 p-4 rounded-2xl text-muc-blue shrink-0">
                  <Train size={32} />
                </div>
                <div className="text-center sm:text-left">
                  <h4 className="font-black uppercase text-muc-blue mb-1 tracking-tight text-xl">Train</h4>
                  <p className="text-slate-600 font-medium">Gare SNCF de Millau à 2,5 km</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-[2rem] flex flex-col sm:flex-row items-center sm:items-start gap-6 hover-lift shadow-lg border-l-8 border-muc-yellow">
                <div className="bg-muc-yellow/20 p-4 rounded-2xl text-muc-yellow shrink-0">
                  <Car size={32} />
                </div>
                <div className="text-center sm:text-left">
                  <h4 className="font-black uppercase text-muc-yellow mb-1 tracking-tight text-xl">Route</h4>
                  <p className="text-slate-600 font-medium">Accès rapide à l'autoroute A75</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-[2rem] flex flex-col sm:flex-row items-center sm:items-start gap-6 hover-lift shadow-lg border-l-8 border-muc-blue">
                <div className="bg-muc-blue/10 p-4 rounded-2xl text-muc-blue shrink-0">
                  <Bike size={32} />
                </div>
                <div className="text-center sm:text-left">
                  <h4 className="font-black uppercase text-muc-blue mb-1 tracking-tight text-xl">Cyclotourisme</h4>
                  <p className="text-slate-600 font-medium">Établissement recommandé comme hébergement sur la GTMC (Grande Traversée du Massif Central)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer / Contact */}
      <footer className="bg-muc-blue py-32 px-6 text-center slanted-top relative overflow-hidden mt-12">
        <div className="absolute inset-0 opacity-10 bg-[url('/photos/Vue 2.jpg')] bg-cover bg-center pointer-events-none"></div>
        <div className="relative z-10 max-w-7xl mx-auto">
          <h2 className="text-5xl md:text-8xl font-black uppercase text-white mb-10 tracking-tighter drop-shadow-2xl" data-reveal="bottom">
            Prêt pour l'aventure ?
          </h2>
          
          <div className="flex justify-center mb-20" data-reveal="bottom">
             <Link to="/planning" className="bg-muc-yellow text-muc-blue px-10 py-4 rounded-xl text-xl font-black uppercase tracking-wider hover:bg-[#E5A600] hover:scale-105 transition-all shadow-2xl">
               Réserver votre séjour
             </Link>
          </div>
          
          <div className="grid md:grid-cols-2 gap-16 max-w-4xl mx-auto mb-20">
            <div className="bg-white/5 backdrop-blur-sm p-8 rounded-[2rem] border border-white/10 hover:bg-white/10 transition-colors" data-reveal="left">
              <p className="font-black text-2xl mb-4 text-muc-yellow uppercase tracking-tight">David Roujet</p>
              <p className="text-lg font-medium text-blue-100 mb-2">david.roujet@mucomnisports.fr</p>
              <p className="text-2xl font-black text-white">06 67 99 36 81</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm p-8 rounded-[2rem] border border-white/10 hover:bg-white/10 transition-colors" data-reveal="right">
              <p className="font-black text-2xl mb-4 text-muc-yellow uppercase tracking-tight">Philippe Morereau</p>
              <p className="text-lg font-medium text-blue-100 mb-2">philippe.morereau@mucomnisports.fr</p>
              <p className="text-2xl font-black text-white">07 52 62 79 62</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-6 mb-20" data-reveal="bottom">
            <a href="https://www.millau-viaduc-tourisme.fr/" target="_blank" rel="noreferrer" className="bg-muc-blue text-white border-2 border-white/30 hover:border-white hover:bg-muc-blue/80 px-8 py-3 rounded-full hover:scale-105 transition-all font-black uppercase tracking-widest text-sm shadow-xl">
              Office de Tourisme de Millau
            </a>
            <a href="https://www.parc-grands-causses.fr/" target="_blank" rel="noreferrer" className="bg-muc-blue text-white border-2 border-white/30 hover:border-white hover:bg-muc-blue/80 px-8 py-3 rounded-full hover:scale-105 transition-all font-black uppercase tracking-widest text-sm shadow-xl">
              PNR des Grands Causses
            </a>
            <a href="https://www.mucformation.fr/" target="_blank" rel="noreferrer" className="bg-muc-blue text-white border-2 border-white/30 hover:border-white hover:bg-muc-blue/80 px-8 py-3 rounded-full hover:scale-105 transition-all font-black uppercase tracking-widest text-sm shadow-xl">
              MUC Formation
            </a>
            <a href="https://www.mucomnisports.fr/" target="_blank" rel="noreferrer" className="bg-muc-blue text-white border-2 border-white/30 hover:border-white hover:bg-muc-blue/80 px-8 py-3 rounded-full hover:scale-105 transition-all font-black uppercase tracking-widest text-sm shadow-xl">
              MUC Omnisports
            </a>
          </div>

          <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 opacity-60 pb-8">
             <div className="flex flex-col items-start">
               <span className="font-black text-white tracking-tighter text-2xl">MUC</span>
               <span className="text-[10px] font-black text-muc-yellow tracking-[0.2em] uppercase">La Maladrerie</span>
             </div>
             <p className="text-xs text-white uppercase tracking-[0.3em] font-medium">
               © {new Date().getFullYear()} MUCOmnisports - Gîte de La Maladrerie
             </p>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-wrap justify-center gap-x-8 gap-y-4">
             <Link to="/mentions-legales" className="text-[10px] text-white/40 hover:text-muc-yellow transition-colors font-bold uppercase tracking-[0.2em]">
                Mentions Légales
             </Link>
             <Link to="/politique-confidentialite" className="text-[10px] text-white/40 hover:text-muc-yellow transition-colors font-bold uppercase tracking-[0.2em]">
                Confidentialité
             </Link>
             <Link to="/cgv" className="text-[10px] text-white/40 hover:text-muc-yellow transition-colors font-bold uppercase tracking-[0.2em]">
                CGV
             </Link>
             <Link to="/login" className="text-[10px] text-white/40 hover:text-muc-yellow transition-colors font-bold uppercase tracking-[0.2em]">
                Espace Pro
             </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
