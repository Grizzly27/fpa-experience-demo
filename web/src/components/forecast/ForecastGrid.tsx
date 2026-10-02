import { Fragment, useEffect, useRef, useState, type ClipboardEvent, type Dispatch, type KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import {
  MONTH_LABELS, ROWS, editText, fmtCell, parseCell, spreadTotal,
  type ForecastOut, type Overrides, type RowDef, type Series,
} from '../../lib/forecast';
import { money } from '../../lib/data';
import { MoreHorizontal } from 'lucide-react';

type Dispatch_ = Dispatch<
  | { type: 'cells'; row: string; values: Record<number, number | null>; text: string }
  | { type: 'batch'; edits: { row: string; idx: number; value: number }[]; text: string }
  | { type: 'undo' } | { type: 'redo' }
>;

interface Props {
  series: Series;
  base: Series;
  overrides: Overrides;
  out: ForecastOut;
  dispatch: Dispatch_;
  readOnly?: boolean;
}

const TOTAL = 12;

const rowTotal = (row: RowDef, vals: number[]) =>
  row.stock ? vals.reduce((a, b) => a + b, 0) / 12 : vals.reduce((a, b) => a + b, 0);

const label = (row: RowDef) => (row.section.startsWith('Revenue') ? row.label : `${row.label} ${row.section.toLowerCase()}`);

export function ForecastGrid({ series, base, overrides, out, dispatch, readOnly }: Props) {
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const skipBlur = useRef(false); // set when an edit was already committed/cancelled by keyboard or click

  const focusGrid = () => requestAnimationFrame(() => wrap.current?.focus());
  const move = (dr: number, dc: number) =>
    setActive(({ r, c }) => ({ r: Math.max(0, Math.min(ROWS.length - 1, r + dr)), c: Math.max(0, Math.min(TOTAL, c + dc)) }));

  const commit = (r: number, c: number, text: string) => {
    const row = ROWS[r];
    const v = parseCell(text, row.format);
    if (v === null) return;
    if (c === TOTAL) {
      if (row.stock) return;
      const spread = spreadTotal(v, series[row.key], row.spread);
      dispatch({
        type: 'cells', row: row.key,
        values: Object.fromEntries(spread.map((x, i) => [i, Math.round(x)])),
        text: `${label(row)} · FY total ${fmtCell(rowTotal(row, series[row.key]), row.format)} → ${fmtCell(v, row.format)} (spread ${row.spread === 'seasonal' ? 'by seasonality' : 'evenly'})`,
      });
      return;
    }
    const old = series[row.key][c];
    if (Math.abs(old - v) < 1e-9) return;
    dispatch({
      type: 'cells', row: row.key, values: { [c]: v },
      text: `${label(row)} · ${MONTH_LABELS[c]}: ${fmtCell(old, row.format)} → ${fmtCell(v, row.format)}`,
    });
  };

  const startEdit = (seed?: string) => {
    if (readOnly) return;
    const { r, c } = active;
    const row = ROWS[r];
    if (c === TOTAL && row.stock) return;
    const v = c === TOTAL ? rowTotal(row, series[row.key]) : series[row.key][c];
    setEditing(seed ?? editText(v, row.format));
  };

  const onGridKey = (e: KeyboardEvent) => {
    if (editing !== null) return;
    const mod = e.ctrlKey || e.metaKey;
    if (readOnly && (mod || e.key === 'Delete' || e.key === 'Backspace')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); return; }
    if (mod) return;
    const k = e.key;
    if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
    else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
    else if (k === 'ArrowRight' || k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit(); }
    else if (k === 'Delete' || k === 'Backspace') {
      const row = ROWS[active.r];
      if (active.c < TOTAL && overrides[row.key]?.[active.c] !== undefined) {
        dispatch({ type: 'cells', row: row.key, values: { [active.c]: null }, text: `${label(row)} · ${MONTH_LABELS[active.c]}: reverted to calculated value` });
      }
    } else if (k.length === 1 && /[\d.\-$]/.test(k)) { e.preventDefault(); startEdit(k); }
  };

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { skipBlur.current = true; setEditing(null); focusGrid(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      skipBlur.current = true;
      commit(active.r, active.c, editing ?? '');
      setEditing(null);
      if (e.key === 'Enter') move(e.shiftKey ? -1 : 1, 0); else move(0, e.shiftKey ? -1 : 1);
      focusGrid();
    }
  };

  // Paste a block from Excel / Sheets, anchored at the active cell
  const onPaste = (e: ClipboardEvent) => {
    if (editing !== null || readOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l, i, arr) => l.length || i < arr.length - 1);
    const edits: { row: string; idx: number; value: number }[] = [];
    lines.forEach((line, i) => {
      const row = ROWS[active.r + i];
      if (!row) return;
      line.split('\t').forEach((cell, j) => {
        const idx = active.c + j;
        const v = parseCell(cell, row.format);
        if (idx < TOTAL && v !== null) edits.push({ row: row.key, idx, value: v });
      });
    });
    if (edits.length) dispatch({ type: 'batch', edits, text: `Pasted ${edits.length} cell${edits.length > 1 ? 's' : ''} from clipboard` });
  };

  // close row menu on outside click
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  let lastSection = '';
  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onGridKey}
      onPaste={onPaste}
      className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
    >
      <table className="w-full text-sm border-separate border-spacing-0 select-none">
        <thead>
          <tr className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            <th className="sticky left-0 z-10 bg-surface text-left font-medium py-2 pr-3 min-w-[190px]">Driver</th>
            {MONTH_LABELS.map((m) => <th key={m} className="text-right font-medium py-2 px-2 min-w-[76px]">{m}</th>)}
            <th className="text-right font-semibold py-2 px-2 min-w-[92px] bg-surface-2">FY27</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, r) => {
            const header = row.section !== lastSection ? row.section : null;
            lastSection = row.section;
            const vals = series[row.key];
            const nOver = Object.keys(overrides[row.key] ?? {}).length;
            return (
              <Fragment key={row.key}>
                {header && (
                  <tr><td colSpan={15} className="sticky left-0 bg-surface pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">{header}</td></tr>
                )}
                <tr className="group">
                  <td className="sticky left-0 z-10 bg-surface py-1 pr-3 text-fg whitespace-nowrap">
                    {row.label}
                    {nOver > 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-edit-bg text-edit-fg">{nOver} edited</span>}
                  </td>
                  {[...vals, rowTotal(row, vals)].map((v, c) => {
                    const isActive = active.r === r && active.c === c;
                    const isTotal = c === TOTAL;
                    const over = !isTotal && overrides[row.key]?.[c] !== undefined;
                    const avgCell = isTotal && row.stock;
                    return (
                      <td
                        key={c}
                        onMouseDown={() => {
                          if (isActive && editing !== null) return;
                          if (editing !== null) { commit(active.r, active.c, editing); skipBlur.current = true; }
                          setActive({ r, c }); setEditing(null);
                        }}
                        onDoubleClick={() => startEdit()}
                        title={over ? `Edited · calculated value was ${fmtCell(base[row.key][c], row.format)}${readOnly ? '' : ' (Delete to revert)'}` : (isTotal && row.stock) ? 'FY average' : readOnly ? 'Read-only for your role' : 'Click and type to edit'}
                        className={clsx(
                          'relative text-right tabular-nums px-2 py-1 border border-transparent cursor-cell',
                          isTotal && 'bg-surface-2 font-medium',
                          avgCell && 'italic text-fg-muted cursor-default',
                          readOnly && 'cursor-default',
                          over && 'bg-edit-bg text-edit-fg font-medium',
                          !isActive && !avgCell && !readOnly && 'hover:border-accent/30',
                          isActive && 'border-accent ring-1 ring-accent z-[1]',
                        )}
                      >
                        {over && <span className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-l-[6px] border-t-edit-line border-l-transparent" />}
                        {isActive && editing !== null ? (
                          <input
                            autoFocus
                            value={editing}
                            onChange={(e) => setEditing(e.target.value)}
                            onKeyDown={onEditKey}
                            onBlur={() => {
                              if (skipBlur.current) { skipBlur.current = false; return; }
                              commit(r, c, editing); setEditing(null);
                            }}
                            className="w-full text-right bg-surface outline-none tabular-nums"
                          />
                        ) : fmtCell(v, row.format)}
                      </td>
                    );
                  })}
                  <td className="relative">
                    {!readOnly && <button
                      onClick={(e) => { e.stopPropagation(); setMenu(menu === row.key ? null : row.key); }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-1.5 text-fg-muted hover:text-accent"
                      aria-label={`Row actions for ${row.label}`}
                    ><MoreHorizontal size={15} /></button>}
                    {menu === row.key && (
                      <RowMenu
                        row={row} vals={vals} base={base[row.key]} activeCol={active.r === r && active.c < TOTAL ? active.c : null}
                        nOver={nOver} dispatch={dispatch} close={() => { setMenu(null); focusGrid(); }}
                      />
                    )}
                  </td>
                </tr>
              </Fragment>
            );
          })}

          <tr><td colSpan={15} className="sticky left-0 bg-surface pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">P&amp;L · calculated</td></tr>
          {([
            ['Revenue', (m) => m.revenue, out.revenue],
            ['Gross margin', (m) => m.revenue - m.cogs, out.grossMargin],
            ['Operating expenses', (m) => m.opex, out.opex],
            ['Operating income', (m) => m.operatingIncome, out.operatingIncome],
          ] as [string, (m: ForecastOut['months'][number]) => number, number][]).map(([name, f, total]) => (
            <tr key={name} className={clsx(name === 'Operating income' && 'font-semibold')}>
              <td className="sticky left-0 z-10 bg-surface py-1.5 pr-3 border-t border-line">{name}</td>
              {out.months.map((m, i) => {
                const v = f(m);
                return <td key={`${i}-${Math.round(v)}`} className={clsx('text-right tabular-nums px-2 py-1.5 border-t border-line animate-flash', v < 0 && 'text-neg')}>{money(v)}</td>;
              })}
              <td key={Math.round(total)} className={clsx('text-right tabular-nums px-2 py-1.5 border-t border-line bg-surface-2 font-semibold animate-flash', total < 0 && 'text-neg')}>{money(total)}</td>
              <td className="border-t border-line" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowMenu({ row, vals, base, activeCol, nOver, dispatch, close }: {
  row: RowDef; vals: number[]; base: number[]; activeCol: number | null; nOver: number; dispatch: Dispatch_; close: () => void;
}) {
  const [mode, setMode] = useState<'pct' | 'set' | 'spread' | null>(null);
  const [text, setText] = useState('');
  const name = label(row);

  const apply = () => {
    const n = parseCell(text, mode === 'pct' ? 'int' : row.format);
    if (n === null) return;
    let next: number[] = vals;
    let desc = '';
    if (mode === 'pct') { next = vals.map((v) => v * (1 + n / 100)); desc = `${name} · adjusted all months ${n >= 0 ? '+' : ''}${n}%`; }
    if (mode === 'set') { next = vals.map(() => n); desc = `${name} · set every month to ${fmtCell(n, row.format)}`; }
    if (mode === 'spread') { next = spreadTotal(n, base, row.spread); desc = `${name} · spread FY total of ${fmtCell(n, row.format)}`; }
    const round = (v: number) => (row.format === 'pct' ? Math.round(v * 10000) / 10000 : row.format === 'hc' ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
    dispatch({ type: 'cells', row: row.key, values: Object.fromEntries(next.map((v, i) => [i, round(v)])), text: desc });
    close();
  };

  const item = 'block w-full text-left px-3 py-1.5 hover:bg-surface-2 rounded';
  return (
    <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-30 w-60 bg-surface border border-line rounded-lg shadow-xl p-1.5 text-sm text-left">
      <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-fg-muted">{name}</div>
      {mode ? (
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="p-2 space-y-2">
          <label className="block text-xs text-fg-muted">
            {mode === 'pct' && 'Adjust every month by (%)'}
            {mode === 'set' && `Set every month to${row.format === 'pct' ? ' (%)' : ''}`}
            {mode === 'spread' && `FY27 total (spread ${row.spread === 'seasonal' ? 'by seasonality' : 'evenly'})`}
          </label>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'pct' ? 'e.g. 5 or -10' : ''}
            className="w-full border border-line-strong rounded px-2 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setMode(null)} className="px-2 py-1 text-xs text-fg-muted">Back</button>
            <button className="px-3 py-1 text-xs bg-accent text-accent-fg rounded">Apply</button>
          </div>
        </form>
      ) : (
        <>
          <button className={item} onClick={() => setMode('pct')}>Adjust row by %…</button>
          <button className={item} onClick={() => setMode('set')}>Set every month to…</button>
          {!row.stock && <button className={item} onClick={() => setMode('spread')}>Spread an FY total…</button>}
          {activeCol !== null && (
            <button className={item} onClick={() => {
              const v = vals[activeCol];
              dispatch({ type: 'cells', row: row.key, values: Object.fromEntries(Array.from({ length: 12 - activeCol }, (_, k) => [activeCol + k, v])), text: `${name} · copied ${MONTH_LABELS[activeCol]} (${fmtCell(v, row.format)}) across to Dec` });
              close();
            }}>Copy {MONTH_LABELS[activeCol]} across →</button>
          )}
          <button className={clsx(item, !nOver && 'text-fg-subtle pointer-events-none')} onClick={() => {
            dispatch({ type: 'cells', row: row.key, values: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, null])), text: `${name} · cleared ${nOver} edit${nOver === 1 ? '' : 's'}` });
            close();
          }}>Clear edits{nOver ? ` (${nOver})` : ''}</button>
        </>
      )}
    </div>
  );
}
