import React, { useRef, useEffect, useState } from 'react';

const SignaturePad = ({ onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Paramètres du tracé
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Empêcher le défilement de l'écran lors du dessin sur mobile
    const preventDefault = (e) => {
      if (e.target === canvas) {
        e.preventDefault();
      }
    };
    document.body.addEventListener('touchstart', preventDefault, { passive: false });
    document.body.addEventListener('touchend', preventDefault, { passive: false });
    document.body.addEventListener('touchmove', preventDefault, { passive: false });

    // Ajuster la résolution interne du canvas par rapport à son affichage CSS
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Réinitialiser les paramètres après changement de taille du canvas
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    return () => {
      document.body.removeEventListener('touchstart', preventDefault);
      document.body.removeEventListener('touchend', preventDefault);
      document.body.removeEventListener('touchmove', preventDefault);
    };
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Gérer tactile vs souris
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    // Sauvegarder la signature
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSave(null); // Signaler que c'est vide
  };

  return (
    <div className="w-full space-y-3">
      <label className="text-xs font-black text-slate-400 uppercase tracking-wider block">Signature manuscrite</label>
      <div className="border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden bg-slate-50 relative group">
        <canvas
          ref={canvasRef}
          className="w-full h-[180px] cursor-crosshair touch-none bg-white"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <button
          type="button"
          onClick={clear}
          className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-all shadow-sm"
        >
          Effacer
        </button>
      </div>
      <p className="text-[10px] text-slate-400 font-medium italic">Signez à l'aide de votre doigt, stylet ou souris dans la zone ci-dessus.</p>
    </div>
  );
};

export default SignaturePad;
