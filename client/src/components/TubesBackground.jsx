import React, { useEffect, useRef, useState } from 'react';

// Helper for random colors
const randomColors = (count) => {
  return new Array(count)
    .fill(0)
    .map(() => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
};

export function TubesBackground({ 
  children, 
  className = '',
  enableClickInteraction = true 
}) {
  const canvasRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const tubesRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let cleanup;

    const initTubes = async () => {
      if (!canvasRef.current) return;

      try {
        // Dynamic import from CDN
        const module = await import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js');
        const TubesCursor = module.default;

        if (!mounted) return;

        const app = TubesCursor(canvasRef.current, {
          tubes: {
            colors: ["#007AFF", "#5856d6", "#00d4ff"],
            lights: {
              intensity: 200,
              colors: ["#007AFF", "#5856d6", "#00d4ff", "#10b981"]
            }
          }
        });

        tubesRef.current = app;
        setIsLoaded(true);

        const handleResize = () => {
          // Library handles resize internally
        };

        window.addEventListener('resize', handleResize);
        
        cleanup = () => {
          window.removeEventListener('resize', handleResize);
        };

      } catch (error) {
        console.error("Failed to load TubesCursor:", error);
      }
    };

    initTubes();

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  const handleClick = () => {
    if (!enableClickInteraction || !tubesRef.current) return;
    
    const colors = randomColors(3);
    const lightsColors = randomColors(4);
    
    tubesRef.current.tubes.setColors(colors);
    tubesRef.current.tubes.setLightsColors(lightsColors);
  };

  return (
    <div 
      className={`tubes-background-container ${className}`}
      onClick={handleClick}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        overflow: 'hidden',
        background: '#05131B'
      }}
    >
      <canvas 
        ref={canvasRef} 
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          touchAction: 'none'
        }}
      />
      
      {/* Content Overlay */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default TubesBackground;
