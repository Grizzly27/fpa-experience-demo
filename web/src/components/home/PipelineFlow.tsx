import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { EDGES, NODES, type PipelineNode } from '../../lib/pipelines';

interface Pos { x: number; y: number; w: number; h: number }

const W = 1120, H = 372;
const COLS: Record<PipelineNode['stage'] | 'raw' | 'curated', number> = { source: 16, ingest: 240, raw: 420, curated: 590, lake: 0, serve: 762, consume: 950 };
const STAGE_LABEL: [number, string][] = [[16, 'Sources'], [240, 'Ingest'], [420, 'Data lake'], [762, 'Serve'], [950, 'Consumers']];

function layout(): Record<string, Pos> {
  const p: Record<string, Pos> = {};
  const src = NODES.filter((n) => n.stage === 'source');
  src.forEach((n, i) => { p[n.id] = { x: COLS.source, y: 70 + i * 100, w: 170, h: 58 }; });
  p.glue = { x: COLS.ingest, y: 170, w: 140, h: 58 };
  p.raw = { x: COLS.raw, y: 170, w: 130, h: 58 };
  p.curated = { x: COLS.curated, y: 170, w: 130, h: 58 };
  p.wh = { x: COLS.serve, y: 170, w: 140, h: 58 };
  NODES.filter((n) => n.stage === 'consume').forEach((n, i) => { p[n.id] = { x: COLS.consume, y: 46 + i * 78, w: 160, h: 54 }; });
  return p;
}

const path = (a: Pos, b: Pos) => {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};

/** Upstream + downstream lineage of a node. */
function lineage(id: string): Set<string> {
  const out = new Set([id]);
  const walk = (cur: string, dir: 0 | 1) => {
    for (const e of EDGES) if (e[dir] === cur && !out.has(e[1 - dir])) { out.add(e[1 - dir]); walk(e[1 - dir], dir); }
  };
  walk(id, 0); walk(id, 1);
  return out;
}

// time (s) for a packet to reach each column, so nodes pulse as data "arrives"
const ARRIVE: Record<string, number> = { erp: 0, hris: 0, crm: 0, glue: 1.2, raw: 2.0, curated: 2.8, wh: 3.6, actuals: 4.8, reporting: 4.8, intake: 4.8, ai: 4.8 };
const CYCLE = 6;

export function PipelineFlow() {
  const pos = useMemo(layout, []);
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const lit = hover ? lineage(hover) : null;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px]" role="img" aria-label="Data pipeline: ERP, HRIS and CRM sources flow through AWS Glue into an S3 data lake, are served by Athena or Redshift, and feed Actuals Management, Reporting, Forecast Intake and the AI Assistant.">
        <defs>
          <radialGradient id="pkt"><stop offset="0%" stopColor="rgb(var(--accent))" /><stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" /></radialGradient>
        </defs>

        {STAGE_LABEL.map(([x, l]) => (
          <text key={l} x={x} y={22} className="fill-fg-subtle text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em' }}>{l}</text>
        ))}
        {/* lake zone */}
        <rect x={408} y={150} width={326} height={98} rx={12} className="fill-accent-soft/40 stroke-accent/30" strokeDasharray="4 4" />
        <text x={420} y={268} className="fill-fg-subtle text-[10px]">Amazon S3 · encrypted · versioned</text>

        {EDGES.map(([a, b], i) => {
          const d = path(pos[a], pos[b]);
          const on = !lit || (lit.has(a) && lit.has(b));
          const id = `edge-${a}-${b}`;
          return (
            <g key={id}>
              <path id={id} d={d} fill="none" strokeWidth={on && lit ? 2 : 1.5}
                className={clsx('transition-[stroke,opacity] duration-200', on && lit ? 'stroke-accent' : 'stroke-line-strong')} opacity={on ? 1 : 0.25} />
              {!reduce && on && (
                <>
                  <circle r={7} fill="url(#pkt)" opacity={0.55}>
                    <animateMotion dur="1.2s" begin={`${ARRIVE[a] + (i % 3) * 0.15}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1"><mpath href={`#${id}`} /></animateMotion>
                  </circle>
                  <circle r={2.6} className="fill-accent">
                    <animateMotion dur="1.2s" begin={`${ARRIVE[a] + (i % 3) * 0.15}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1"><mpath href={`#${id}`} /></animateMotion>
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {NODES.map((n) => {
          const p = pos[n.id];
          const on = !lit || lit.has(n.id);
          const consumer = n.stage === 'consume';
          const go = () => n.route && navigate(n.route);
          return (
            <g key={n.id} opacity={on ? 1 : 0.3} className="transition-opacity duration-200"
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
              onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}
              tabIndex={0} role={consumer ? 'link' : 'button'}
              aria-label={`${n.name}: ${n.detail}${consumer ? '. Open page' : '. Show lineage'}`}
              style={{ cursor: consumer ? 'pointer' : 'default', outline: 'none' }}>
              {!reduce && (
                <motion.rect x={p.x - 3} y={p.y - 3} width={p.w + 6} height={p.h + 6} rx={11} fill="none" className="stroke-accent" strokeWidth={2}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0] }}
                  transition={{ duration: 0.9, delay: ARRIVE[n.id] + 0.9, repeat: Infinity, repeatDelay: CYCLE - 0.9 }} />
              )}
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={9}
                className={clsx('fill-surface transition-[stroke] duration-200', hover === n.id ? 'stroke-accent' : consumer ? 'stroke-line-strong' : 'stroke-line-strong')}
                strokeWidth={hover === n.id ? 2 : 1} filter="drop-shadow(0 1px 1.5px rgb(15 23 42 / 0.08))" />
              {consumer && <rect x={p.x} y={p.y} width={4} height={p.h} rx={2} className="fill-accent" />}
              <text x={p.x + 14} y={p.y + p.h / 2 - 4} className="fill-fg text-[13px] font-semibold">{n.name}</text>
              <text x={p.x + 14} y={p.y + p.h / 2 + 13} className="fill-fg-muted text-[11px]">{n.detail}</text>
              {n.status && (
                <g>
                  <circle cx={p.x + p.w - 12} cy={p.y + 12} r={4} className={n.status === 'warning' ? 'fill-warn' : 'fill-pos'} />
                  {!reduce && (
                    <circle cx={p.x + p.w - 12} cy={p.y + 12} r={4} className={n.status === 'warning' ? 'fill-warn' : 'fill-pos'}>
                      <animate attributeName="r" values="4;9" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
