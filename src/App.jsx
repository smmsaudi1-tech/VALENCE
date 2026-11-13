import { useState, useEffect, useCallback, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCw, X, Check } from 'lucide-react';
import { GARMENTS } from './data/garments';

const RACK_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 0.85,
};

export default function App() {
  const [activeIndex, setActiveIndex] = useState(4);
  const [isInspecting, setIsInspecting] = useState(false);
  const [selectedColorMap, setSelectedColorMap] = useState(() =>
    Object.fromEntries(GARMENTS.map((g) => [g.id, 0]))
  );
  const [colorSpinMap, setColorSpinMap] = useState(() =>
    Object.fromEntries(GARMENTS.map((g) => [g.id, 0]))
  );
  const [viewSide, setViewSide] = useState('front');
  const [showSizes, setShowSizes] = useState(false);
  const [selectedSize, setSelectedSize] = useState('M');
  const [hoveredSideIdx, setHoveredSideIdx] = useState(null);

  // GPU-only motion values for zero-rerender mouse parallax on center garment
  const rawTiltX = useMotionValue(0);
  const rawTiltY = useMotionValue(0);
  const rawSwayZ = useMotionValue(0);
  const tiltX = useSpring(rawTiltX, { stiffness: 180, damping: 24, mass: 0.5 });
  const tiltY = useSpring(rawTiltY, { stiffness: 180, damping: 24, mass: 0.5 });
  const swayZ = useSpring(rawSwayZ, { stiffness: 150, damping: 18, mass: 0.6 });

  const wheelLockRef = useRef(0);
  const dragStartXRef = useRef(null);

  // Preload all garment images on mount
  useEffect(() => {
    GARMENTS.forEach((g) => {
      g.colorways.forEach((cw) => {
        if (cw.front) {
          const img = new Image();
          img.src = cw.front;
        }
        if (cw.back) {
          const img = new Image();
          img.src = cw.back;
        }
      });
    });
  }, []);

  const activeGarment = GARMENTS[activeIndex];
  const activeColorIndex = selectedColorMap[activeGarment.id] ?? 0;
  const activeColorway =
    activeGarment.colorways[activeColorIndex] ?? activeGarment.colorways[0];
  const hasBackView = Boolean(activeColorway?.back);

  const resetTilt = useCallback(() => {
    rawTiltX.set(0);
    rawTiltY.set(0);
    rawSwayZ.set(0);
  }, [rawTiltX, rawTiltY, rawSwayZ]);

  const navigate = useCallback(
    (dir) => {
      setIsInspecting(false);
      setViewSide('front');
      setShowSizes(false);
      setHoveredSideIdx(null);
      resetTilt();
      setActiveIndex((prev) => {
        const next = prev + dir;
        if (next < 0) return 0;
        if (next >= GARMENTS.length) return GARMENTS.length - 1;
        return next;
      });
    },
    [resetTilt]
  );

  const selectGarment = (index) => {
    if (index === activeIndex) {
      setIsInspecting((prev) => !prev);
      setViewSide('front');
      setShowSizes(false);
      resetTilt();
    } else {
      setIsInspecting(false);
      setViewSide('front');
      setShowSizes(false);
      setHoveredSideIdx(null);
      resetTilt();
      setActiveIndex(index);
    }
  };

  const setColorway = useCallback(
    (colorIdx) => {
      if (colorIdx < 0 || colorIdx >= activeGarment.colorways.length) return;
      if (colorIdx === activeColorIndex) return;
      const gid = activeGarment.id;
      setSelectedColorMap((prev) => ({
        ...prev,
        [gid]: colorIdx,
      }));
      setColorSpinMap((prev) => ({
        ...prev,
        [gid]: (prev[gid] ?? 0) + 1,
      }));
    },
    [activeGarment, activeColorIndex]
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        navigate(-1);
      } else if (e.key === 'ArrowRight') {
        navigate(1);
      } else if (e.key === 'Escape') {
        setIsInspecting(false);
        setViewSide('front');
        setShowSizes(false);
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (!isInspecting) {
          setIsInspecting(true);
        } else if (hasBackView) {
          setViewSide((s) => (s === 'front' ? 'back' : 'front'));
        }
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        setColorway(idx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, isInspecting, hasBackView, setColorway]);

  const handleWheel = (e) => {
    const now = Date.now();
    if (now - wheelLockRef.current < 260) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 20) {
      wheelLockRef.current = now;
      navigate(delta > 0 ? 1 : -1);
    }
  };

  const handlePointerDown = (e) => {
    dragStartXRef.current = e.clientX;
  };

  const handlePointerUp = (e) => {
    if (dragStartXRef.current === null) return;
    const diff = e.clientX - dragStartXRef.current;
    dragStartXRef.current = null;
    if (Math.abs(diff) > 45) {
      navigate(diff < 0 ? 1 : -1);
    }
  };

  const handleCenterMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    rawTiltX.set(-ny * 5);
    rawTiltY.set(nx * 9);
    rawSwayZ.set(nx * 2);
  };

  return (
    <div
      className="studio-bg relative w-screen h-screen flex flex-col items-center justify-between overflow-hidden select-none"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Top Studio Header */}
      <header className="relative z-40 w-full flex flex-col items-center pt-7 md:pt-8 pointer-events-none">
        <span className="font-['Space_Grotesk'] text-lg md:text-xl font-bold tracking-[0.26em] text-[#141414] uppercase">
          VALENCE
        </span>
        <span className="mt-1 text-[10px] tracking-[0.34em] text-neutral-400 uppercase font-medium">
          ARCHIVE CLOSET — 2026
        </span>
      </header>

      {/* Main Closet Rack Stage */}
      <main className="relative w-full flex-1 flex items-center justify-center">
        {isInspecting && (
          <div
            className="absolute inset-0 z-10 cursor-zoom-out"
            onClick={() => {
              setIsInspecting(false);
              setViewSide('front');
              setShowSizes(false);
            }}
          />
        )}

        {/* Hanging Garments + Closet Rod Stage (perspective-origin locked to rod at y=10px) */}
        <div
          className="relative w-full h-[440px] md:h-[460px] flex items-start justify-center mt-4"
          style={{
            perspective: '1600px',
            perspectiveOrigin: '50% 10px',
          }}
        >
          {/* Horizontal Closet Rod */}
          <div
            className="absolute z-20 left-1/2 -translate-x-1/2 w-[95vw] max-w-[1440px] pointer-events-none"
            style={{ top: '10px' }}
          >
            <div className="absolute left-0 -top-[5px] w-[1.5px] h-[11px] bg-neutral-700/80" />
            <div className="w-full h-[1.5px] bg-gradient-to-r from-neutral-500/60 via-neutral-800/85 to-neutral-500/60 shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />
            <div className="absolute right-0 -top-[5px] w-[1.5px] h-[11px] bg-neutral-700/80" />
          </div>

          {GARMENTS.map((garment, idx) => {
            const offset = idx - activeIndex;
            const isCenter = offset === 0;
            const isSideHovered = !isCenter && hoveredSideIdx === idx;
            const sign = Math.sign(offset);
            const abs = Math.abs(offset);

            const colorIdx = selectedColorMap[garment.id] ?? 0;
            const colorway = garment.colorways[colorIdx] ?? garment.colorways[0];
            const spinCount = colorSpinMap[garment.id] ?? 0;

            // Tight, cohesive closet spacing
            let x = 0;
            if (!isCenter) {
              x = isInspecting
                ? sign * (192 + (abs - 1) * 64)
                : sign * (148 + (abs - 1) * 58);
            }

            // Non-negative Z-depth keeps hooks locked to rod & prevents background clipping
            const z = isCenter ? 65 : 0;

            // Pure rack angle (never polluted by color spin)
            let rackRotateY = 0;
            if (!isCenter) {
              const baseAngle = offset < 0 ? 68 : -68;
              rackRotateY = isSideHovered && !isInspecting ? baseAngle * 0.72 : baseAngle;
            }

            // Inner flip & per-garment color spin
            const innerFlipY =
              (isCenter && isInspecting && viewSide === 'back' && colorway.back ? 180 : 0) +
              spinCount * 360;

            const scale = isCenter
              ? isInspecting
                ? 1.1
                : 1
              : isInspecting
              ? 0.9
              : isSideHovered
              ? 1.0
              : 0.96;

            const opacity = 1;
            const zIndex = isCenter ? 40 : 30 - abs;

            return (
              <motion.div
                key={garment.id}
                onClick={(e) => {
                  e.stopPropagation();
                  selectGarment(idx);
                }}
                onMouseEnter={() => {
                  if (!isCenter) setHoveredSideIdx(idx);
                }}
                onMouseLeave={() => {
                  if (!isCenter) {
                    setHoveredSideIdx((prev) => (prev === idx ? null : prev));
                  } else {
                    resetTilt();
                  }
                }}
                onMouseMove={isCenter ? handleCenterMouseMove : undefined}
                initial={false}
                animate={{
                  x,
                  z,
                  y: 0,
                  rotateY: rackRotateY,
                  rotateZ: isSideHovered && !isInspecting ? sign * -2.2 : 0,
                  scale,
                  opacity,
                }}
                transition={RACK_SPRING}
                style={{
                  zIndex,
                  transformOrigin: '50% 10px',
                  transformStyle: 'preserve-3d',
                }}
                className="absolute flex items-start justify-center cursor-pointer will-change-transform"
              >
                {/* Color-change studio aura pulse */}
                {isCenter && spinCount > 0 && (
                  <motion.div
                    key={`aura-${colorway.id}-${spinCount}`}
                    initial={{ opacity: 0.45, scale: 0.8 }}
                    animate={{ opacity: 0, scale: 1.3 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ backgroundColor: colorway.hex }}
                    className="absolute top-16 w-48 h-48 rounded-full blur-3xl pointer-events-none -z-10"
                  />
                )}

                {/* GPU-only Mouse Parallax + Flip/Spin Container */}
                <motion.div
                  animate={{ rotateY: innerFlipY }}
                  transition={{ type: 'spring', stiffness: 190, damping: 24, mass: 0.85 }}
                  style={{
                    rotateX: isCenter ? tiltX : 0,
                    rotateZ: isCenter ? swayZ : 0,
                    transformOrigin: '50% 10px',
                    transformStyle: 'preserve-3d',
                  }}
                  className="relative h-[375px] md:h-[410px] w-auto flex items-start justify-center"
                >
                  <motion.div
                    style={{
                      rotateY: isCenter ? tiltY : 0,
                      transformStyle: 'preserve-3d',
                    }}
                    className="relative h-full w-auto flex items-start justify-center"
                  >
                    {/* Front Face */}
                    <img
                      src={colorway.front}
                      alt={garment.title}
                      draggable={false}
                      style={
                        isCenter
                          ? { filter: 'drop-shadow(0 16px 20px rgba(0,0,0,0.12))' }
                          : undefined
                      }
                      className="backface-hidden h-full w-auto max-w-none object-contain object-top pointer-events-none"
                    />

                    {/* Back Face */}
                    {colorway.back && (
                      <img
                        src={colorway.back}
                        alt={`${garment.title} back`}
                        draggable={false}
                        style={{
                          transform: 'rotateY(180deg)',
                          ...(isCenter
                            ? { filter: 'drop-shadow(0 16px 20px rgba(0,0,0,0.12))' }
                            : {}),
                        }}
                        className="backface-hidden absolute inset-0 mx-auto h-full w-auto max-w-none object-contain object-top pointer-events-none"
                      />
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Left / Right Rack Arrows */}
        {!isInspecting && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(-1);
              }}
              disabled={activeIndex === 0}
              aria-label="Previous garment"
              className="hidden md:flex absolute left-6 lg:left-10 z-40 w-9 h-9 items-center justify-center rounded-full border border-neutral-300/80 bg-white/65 backdrop-blur-sm text-neutral-700 hover:bg-white hover:text-black transition disabled:opacity-20 disabled:cursor-default cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(1);
              }}
              disabled={activeIndex === GARMENTS.length - 1}
              aria-label="Next garment"
              className="hidden md:flex absolute right-6 lg:right-10 z-40 w-9 h-9 items-center justify-center rounded-full border border-neutral-300/80 bg-white/65 backdrop-blur-sm text-neutral-700 hover:bg-white hover:text-black transition disabled:opacity-20 disabled:cursor-default cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </main>

      {/* Bottom Controls */}
      <footer className="relative z-40 w-full pb-7 md:pb-10 flex flex-col items-center justify-end min-h-[130px]">
        <AnimatePresence mode="wait">
          {!isInspecting ? (
            <motion.div
              key="rack-controls"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3.5"
            >
              {activeGarment.colorways.length > 1 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/75 backdrop-blur-sm border border-neutral-200/80 shadow-xs">
                  {activeGarment.colorways.map((cw, cIdx) => {
                    const isSelected = cIdx === activeColorIndex;
                    return (
                      <button
                        key={cw.id}
                        onClick={() => setColorway(cIdx)}
                        title={cw.name}
                        className={`w-4 h-4 rounded-full transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-offset-1 ring-neutral-900 scale-110'
                            : 'opacity-65 hover:opacity-100 hover:scale-110'
                        }`}
                        style={{ backgroundColor: cw.hex }}
                      />
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setIsInspecting(true)}
                className="px-6 py-2.5 rounded-full border border-neutral-300 bg-white/75 backdrop-blur-sm text-[10px] md:text-[11px] font-semibold tracking-[0.22em] text-neutral-800 uppercase hover:bg-[#111111] hover:text-white hover:border-[#111111] transition-all duration-200 shadow-xs cursor-pointer"
              >
                SEE AVAILABILITY
              </button>

              <div className="flex items-center gap-1.5">
                {GARMENTS.map((g, idx) => (
                  <button
                    key={g.id}
                    onClick={() => selectGarment(idx)}
                    aria-label={`Select ${g.title}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === activeIndex
                        ? 'w-5 bg-neutral-800'
                        : 'w-1.5 bg-neutral-300 hover:bg-neutral-400'
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="inspect-controls"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.24 }}
              className="flex flex-col items-center gap-3.5"
            >
              <div className="flex flex-col items-center gap-0.5">
                <h1 className="text-xs md:text-sm font-extrabold tracking-[0.14em] text-[#111111] uppercase">
                  {activeGarment.title}
                </h1>
                <span className="text-[11px] font-medium tracking-[0.18em] text-neutral-500">
                  {activeGarment.price} — {activeColorway.name.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-2 p-1 rounded-full bg-white/90 backdrop-blur-md border border-neutral-200/90 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                {activeGarment.colorways.length > 1 && (
                  <div className="flex items-center gap-1.5 pl-2 pr-1.5 border-r border-neutral-200">
                    {activeGarment.colorways.map((cw, cIdx) => {
                      const isSelected = cIdx === activeColorIndex;
                      return (
                        <button
                          key={cw.id}
                          onClick={() => setColorway(cIdx)}
                          title={cw.name}
                          className={`w-5 h-5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'ring-2 ring-offset-1 ring-neutral-900 scale-110'
                              : 'opacity-70 hover:opacity-100 hover:scale-110'
                          }`}
                          style={{ backgroundColor: cw.hex }}
                        />
                      );
                    })}
                  </div>
                )}

                {hasBackView && (
                  <div className="flex items-center bg-neutral-100 rounded-full p-0.5">
                    <button
                      onClick={() => setViewSide('front')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase transition-all cursor-pointer ${
                        viewSide === 'front'
                          ? 'bg-[#111111] text-white shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      FRONT
                    </button>
                    <button
                      onClick={() => setViewSide('back')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase transition-all flex items-center gap-1 cursor-pointer ${
                        viewSide === 'back'
                          ? 'bg-[#111111] text-white shadow-xs'
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                      BACK
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setShowSizes((s) => !s)}
                  className={`px-3.5 py-1 rounded-full text-[10px] font-bold tracking-[0.14em] uppercase transition-all cursor-pointer ${
                    showSizes
                      ? 'bg-[#111111] text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {showSizes ? 'HIDE SIZES' : 'SIZES'}
                </button>

                <button
                  onClick={() => {
                    setIsInspecting(false);
                    setViewSide('front');
                    setShowSizes(false);
                  }}
                  aria-label="Back to rack"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-black hover:bg-neutral-100 transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <AnimatePresence>
                {showSizes && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 border border-neutral-200 shadow-sm"
                  >
                    {activeGarment.sizes.map((sz) => {
                      const active = selectedSize === sz.label && sz.inStock;
                      return (
                        <button
                          key={sz.label}
                          disabled={!sz.inStock}
                          onClick={() => setSelectedSize(sz.label)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider transition flex items-center gap-1 ${
                            !sz.inStock
                              ? 'text-neutral-300 line-through cursor-not-allowed'
                              : active
                              ? 'bg-[#111111] text-white cursor-pointer'
                              : 'text-neutral-700 hover:bg-neutral-100 cursor-pointer'
                          }`}
                        >
                          {sz.label}
                          {active && <Check className="w-2.5 h-2.5" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
