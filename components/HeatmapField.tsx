import React, { useRef, useEffect } from 'react';
import { HeatmapPoint } from '../types';
import { RefreshCcw } from 'lucide-react';

interface HeatmapFieldProps {
  points: HeatmapPoint[];
  onChange?: (points: HeatmapPoint[]) => void;
  readOnly?: boolean;
  className?: string;
  label?: string;
  perspective?: boolean; // New prop for 3D view
}

const HeatmapField: React.FC<HeatmapFieldProps> = ({ 
  points, 
  onChange, 
  readOnly = false,
  className = '',
  label = 'Mapa de Calor (Posicionamento)',
  perspective = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click to add point
  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onChange || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Limit coords to 0-100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    onChange([...points, { x: clampedX, y: clampedY }]);
  };

  const handleClear = () => {
    if (onChange) onChange([]);
  };

  // Draw heatmap effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution to match display size
    const rect = canvas.getBoundingClientRect();
    // We increase resolution for smoother rendering
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (points.length === 0) return;

    if (readOnly) {
       // --- HEATMAP MODE (Display) ---
       // Draw soft glowing circles
       points.forEach(p => {
           const px = (p.x / 100) * rect.width;
           const py = (p.y / 100) * rect.height;
           
           const radius = 25; 
           const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
           
           // Heatmap colors (Red/Orange center to transparent)
           // Using low opacity to allow stacking
           gradient.addColorStop(0, 'rgba(255, 69, 0, 0.4)'); // Red-Orange center
           gradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.2)'); // Orange mid
           gradient.addColorStop(1, 'rgba(255, 140, 0, 0)'); // Transparent edge

           ctx.fillStyle = gradient;
           ctx.beginPath();
           ctx.arc(px, py, radius, 0, Math.PI * 2);
           ctx.fill();
       });
    } else {
        // --- INPUT MODE ---
        // Draw distinct markers
        points.forEach(p => {
           const px = (p.x / 100) * rect.width;
           const py = (p.y / 100) * rect.height;

           // White border
           ctx.beginPath();
           ctx.arc(px, py, 6, 0, 2 * Math.PI);
           ctx.fillStyle = 'white';
           ctx.fill();

           // Red center
           ctx.beginPath();
           ctx.arc(px, py, 4, 0, 2 * Math.PI);
           ctx.fillStyle = '#ef4444';
           ctx.fill();
        });
    }

  }, [points, readOnly]); // Redraw when points change

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
         <h4 className="text-sm font-bold text-gray-700 uppercase">{label}</h4>
         {!readOnly && points.length > 0 && (
             <button 
               type="button"
               onClick={handleClear} 
               className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-semibold"
             >
                 <RefreshCcw size={12} /> Limpar
             </button>
         )}
      </div>
      
      {/* Perspective Container Wrapper */}
      <div className="w-full flex justify-center perspective-container" style={{ perspective: '600px' }}>
        {/* Field Container matching Dashboard style */}
        <div 
            ref={containerRef}
            onClick={handleFieldClick}
            className={`relative w-full aspect-[16/10] bg-green-600 rounded-lg overflow-hidden border-4 border-green-700 shadow-inner ${!readOnly ? 'cursor-crosshair' : ''}`}
            style={perspective ? {
                transform: 'rotateX(35deg) scale(0.85)', // Increased tilt, reduced scale
                transformStyle: 'preserve-3d',
                boxShadow: '0 25px 30px rgba(0,0,0,0.3), inset 0 0 40px rgba(0,0,0,0.2)'
            } : {}}
        >
                {/* Field Markings */}
                <div className="absolute inset-4 border-2 border-white/40 rounded-sm pointer-events-none"></div>
                {/* Center Line */}
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/40 transform -translate-x-1/2 pointer-events-none"></div>
                {/* Center Circle */}
                <div className="absolute top-1/2 left-1/2 w-20 h-20 border-2 border-white/40 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                {/* Penalty Areas (Horizontal orientation for input) */}
                <div className="absolute top-1/2 left-4 w-16 h-32 border-2 border-white/40 border-l-0 transform -translate-y-1/2 bg-transparent pointer-events-none"></div>
                <div className="absolute top-1/2 right-4 w-16 h-32 border-2 border-white/40 border-r-0 transform -translate-y-1/2 bg-transparent pointer-events-none"></div>

                {/* Canvas for Points/Heatmap */}
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                
                {/* Helper Text */}
                <div className="absolute top-2 left-2 text-white/30 text-[10px] font-bold uppercase tracking-widest pointer-events-none">Defesa</div>
                <div className="absolute top-2 right-2 text-white/30 text-[10px] font-bold uppercase tracking-widest pointer-events-none">Ataque</div>
                
                {!readOnly && points.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-white/50 text-sm font-medium bg-black/20 px-3 py-1 rounded">Toque para marcar posição</span>
                    </div>
                )}
        </div>
      </div>
    </div>
  );
};

export default HeatmapField;