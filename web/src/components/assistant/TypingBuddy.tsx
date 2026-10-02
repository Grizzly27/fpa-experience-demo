import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';

export type BuddyState = 'idle' | 'listening' | 'thinking' | 'answering';

interface Props {
  state: BuddyState;
  /** Increments on every user keystroke; each change triggers one finger tap. */
  keystrokes: number;
}

const GLYPHS = ['$', '%', '▲', '▼', 'Σ', '∆', '#'];

/**
 * An analyst at a laptop. Types along with the user's keystrokes, thinks while the answer is
 * retrieved, then types fast while the answer streams. Eyes follow the pointer when idle.
 */
export function TypingBuddy({ state, keystrokes }: Props) {
  const reduce = useReducedMotion();
  const left = useAnimationControls();
  const right = useAnimationControls();
  const svg = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [glyphs, setGlyphs] = useState<{ id: number; x: number; g: string }[]>([]);

  // one tap per keystroke, alternating hands
  useEffect(() => {
    if (!keystrokes || reduce) return;
    const hand = keystrokes % 2 ? left : right;
    hand.start({ y: [0, -5, 0], rotate: [0, keystrokes % 2 ? -6 : 6, 0], transition: { duration: 0.16, ease: 'easeOut' } });
  }, [keystrokes, left, right, reduce]);

  // continuous fast typing while answering
  useEffect(() => {
    if (state !== 'answering' || reduce) { left.stop(); right.stop(); left.set({ y: 0, rotate: 0 }); right.set({ y: 0, rotate: 0 }); return; }
    left.start({ y: [0, -4, 0], transition: { duration: 0.18, repeat: Infinity, ease: 'easeInOut' } });
    right.start({ y: [0, -4, 0], transition: { duration: 0.18, repeat: Infinity, ease: 'easeInOut', delay: 0.09 } });
    let id = 0;
    const t = setInterval(() => {
      id += 1;
      setGlyphs((g) => [...g.slice(-6), { id, x: 92 + Math.random() * 56, g: GLYPHS[id % GLYPHS.length] }]);
    }, 260);
    return () => clearInterval(t);
  }, [state, left, right, reduce]);

  // natural blinking at irregular intervals
  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); loop(); }, 2400 + Math.random() * 2600);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduce]);

  // eyes follow the pointer (subtle, clamped)
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = svg.current?.getBoundingClientRect();
        if (!r) return;
        const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.32;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy) || 1;
        setLook({ x: (dx / d) * Math.min(1.8, d / 80), y: (dy / d) * Math.min(1.4, d / 80) });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [reduce]);

  const eyes = state === 'thinking' ? { x: 1.4, y: -1.6 } : state === 'answering' || state === 'listening' ? { x: 0, y: 1.4 } : look;
  const glow = state === 'answering' ? 0.55 : state === 'listening' ? 0.4 : 0.22;

  return (
    <svg ref={svg} viewBox="0 0 240 190" className="h-auto w-full" role="img"
      aria-label={state === 'thinking' ? 'Assistant is thinking' : state === 'answering' ? 'Assistant is writing an answer' : state === 'listening' ? 'Assistant is listening' : 'Assistant is ready'}>
      <defs>
        <radialGradient id="screenGlow" cx="50%" cy="100%" r="70%">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* floor shadow + desk */}
      <ellipse cx="120" cy="178" rx="92" ry="6" fill="#0F172A" opacity="0.12" />
      <rect x="20" y="150" width="200" height="10" rx="5" className="fill-surface-3" />

      {/* body (breathing) */}
      <motion.g style={{ originX: '120px', originY: '150px' }} animate={reduce ? undefined : { scaleY: [1, 1.018, 1] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}>
        {/* torso */}
        <path d="M78 150 C78 118 92 104 120 104 C148 104 162 118 162 150 Z" className="fill-accent" />
        <path d="M110 104 L120 118 L130 104" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="2.5" strokeLinejoin="round" />
        {/* neck */}
        <rect x="113" y="92" width="14" height="14" rx="5" fill="#E8B58F" />
        {/* head (tilts while thinking) */}
        <motion.g style={{ originX: '120px', originY: '96px' }} animate={{ rotate: state === 'thinking' ? -6 : 0 }} transition={{ type: 'spring', stiffness: 120, damping: 12 }}>
          <circle cx="120" cy="70" r="26" fill="#F2C7A5" />
          <path d="M94 68 C93 48 106 40 121 40 C138 40 148 50 146 66 C140 58 130 54 119 56 C108 57 100 62 94 68 Z" fill="#3B2A22" />
          <circle cx="94.5" cy="72" r="4" fill="#E8B58F" />
          <circle cx="145.5" cy="72" r="4" fill="#E8B58F" />
          {/* eyes */}
          <g>
            {[110, 130].map((x) => (
              <g key={x}>
                <motion.ellipse cx={x} cy={71} rx={3.4} ry={blink ? 0.4 : 3.4} fill="white" transition={{ duration: 0.08 }} />
                {!blink && <motion.circle cx={x} cy={71} r={1.9} fill="#1F2937" animate={{ cx: x + eyes.x, cy: 71 + eyes.y }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} />}
              </g>
            ))}
            <path d={state === 'thinking' ? 'M105 63 L114 61.5' : 'M105 63.5 L114 63'} stroke="#3B2A22" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M126 63 L135 63.5" stroke="#3B2A22" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          {/* mouth */}
          <motion.path animate={{ d: state === 'answering' ? 'M113 82 Q120 87 127 82' : state === 'thinking' ? 'M115 83 Q120 82 125 83' : 'M114 82 Q120 85 126 82' }}
            fill="none" stroke="#9A5B3C" strokeWidth="1.8" strokeLinecap="round" />
          {/* screen light on face */}
          <motion.ellipse cx="120" cy="88" rx="30" ry="18" fill="url(#screenGlow)" animate={{ opacity: glow }} transition={{ duration: 0.4 }} />
        </motion.g>
        {/* arms */}
        <path d="M86 124 C80 138 86 148 98 148" fill="none" className="stroke-accent" strokeWidth="11" strokeLinecap="round" />
        <path d="M154 124 C160 138 154 148 142 148" fill="none" className="stroke-accent" strokeWidth="11" strokeLinecap="round" />
      </motion.g>

      {/* laptop lid (back faces viewer) */}
      <path d="M72 150 L80 112 L160 112 L168 150 Z" className="fill-surface stroke-line-strong" strokeWidth="1.5" />
      <motion.circle cx="120" cy="131" r="5" className="fill-accent" animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: state === 'answering' ? 0.8 : 2.6, repeat: Infinity }} />
      <rect x="64" y="148" width="112" height="5" rx="2.5" className="fill-line-strong" />

      {/* hands on keys */}
      <motion.g animate={left} style={{ originX: '98px', originY: '148px' }}>
        <ellipse cx="98" cy="148" rx="7.5" ry="5" fill="#F2C7A5" />
      </motion.g>
      <motion.g animate={right} style={{ originX: '142px', originY: '148px' }}>
        <ellipse cx="142" cy="148" rx="7.5" ry="5" fill="#F2C7A5" />
      </motion.g>

      {/* thought bubble */}
      <AnimatePresence>
        {state === 'thinking' && (
          <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
            style={{ originX: '170px', originY: '40px' }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
            <circle cx="150" cy="44" r="3" className="fill-surface stroke-line-strong" />
            <circle cx="158" cy="34" r="4.5" className="fill-surface stroke-line-strong" />
            <rect x="160" y="6" width="58" height="26" rx="13" className="fill-surface stroke-line-strong" />
            {[176, 189, 202].map((x, i) => (
              <motion.circle key={x} cx={x} cy={19} r={3} className="fill-accent"
                animate={reduce ? undefined : { y: [0, -3, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.g>
        )}
      </AnimatePresence>

      {/* glyphs rising off the screen while answering */}
      <AnimatePresence>
        {state === 'answering' && glyphs.map((g) => (
          <motion.text key={g.id} x={g.x} y={108} className="fill-accent text-[11px] font-semibold"
            initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: -46 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: 'easeOut' }}>{g.g}</motion.text>
        ))}
      </AnimatePresence>
    </svg>
  );
}
