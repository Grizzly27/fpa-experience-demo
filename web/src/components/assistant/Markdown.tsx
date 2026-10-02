import { Fragment, type ReactNode } from 'react';

/** Minimal markdown for model commentary: headings, bullets, **bold**. */
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) { out.push(<ul key={`ul${out.length}`} className="my-2 list-disc space-y-1 pl-5 marker:text-fg-subtle">{list}</ul>); list = []; }
  };
  text.split('\n').forEach((l, i) => {
    const bullet = l.match(/^\s*[-*•]\s+(.*)/);
    if (bullet) { list.push(<li key={i}>{inline(bullet[1])}</li>); return; }
    flush();
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (h) out.push(<p key={i} className="mt-3 font-semibold">{inline(h[1])}</p>);
    else if (l.trim()) out.push(<p key={i} className="my-1.5">{inline(l)}</p>);
  });
  flush();
  return <>{out}</>;
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}
