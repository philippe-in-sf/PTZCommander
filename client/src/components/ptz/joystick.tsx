import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  onStop: () => void;
  className?: string;
}

export function Joystick({ onMove, onStop, className }: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const controls = useAnimation();
  const [active, setActive] = useState(false);

  // Loop to constantly send values while active
  useEffect(() => {
    let animationFrameId: number;

    const updateLoop = () => {
      if (active) {
        // Normalize values to -1 to 1 range
        // Assuming joystick radius is approx 60px (container w/2 - handle w/2)
        const maxDist = 60; 
        const currentX = x.get();
        const currentY = y.get();
        
        // Clamp normalized values
        const normX = Math.max(-1, Math.min(1, currentX / maxDist));
        const normY = Math.max(-1, Math.min(1, currentY / maxDist));
        
        onMove(normX, -normY); // Invert Y for standard "up is positive" control logic
        animationFrameId = requestAnimationFrame(updateLoop);
      }
    };

    if (active) {
      updateLoop();
    } else {
      onStop();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [active, onMove, onStop, x, y]);

  return (
    <div 
      className={cn(
        "relative flex items-center justify-center w-64 h-64 rounded-full bg-slate-900 border-2 border-slate-800 shadow-[inset_0_4px_10px_rgba(0,0,0,0.5)]",
        className
      )}
      ref={containerRef}
    >
      {/* Grid Lines for visual reference */}
      <div className="absolute inset-0 rounded-full opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-500" />
        <div className="absolute inset-[25%] border border-cyan-500 rounded-full opacity-50" />
      </div>

      <motion.div
        drag
        dragConstraints={containerRef}
        dragElastic={0.1}
        onDragStart={() => setActive(true)}
        onDragEnd={() => {
          setActive(false);
          x.set(0);
          y.set(0);
          controls.start({ x: 0, y: 0 });
        }}
        animate={controls}
        style={{ x, y }}
        className={cn(
          "w-24 h-24 rounded-full shadow-2xl z-10 cursor-grab active:cursor-grabbing flex items-center justify-center transition-colors",
          active 
            ? "bg-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.6)]" 
            : "bg-slate-700 border-t border-slate-600"
        )}
      >
        <div className={cn(
          "w-8 h-8 rounded-full bg-slate-900/50 backdrop-blur-sm",
          active && "scale-90"
        )} />
      </motion.div>

      {/* Glow effect under the joystick base */}
      <div className="absolute inset-0 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-none -z-10" />
    </div>
  );
}
