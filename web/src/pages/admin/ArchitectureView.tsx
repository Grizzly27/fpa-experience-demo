import { Card } from '../../components/ui/Card';

interface Box { x: number; y: number; w: number; h: number; title: string; sub: string; tone?: 'aws' | 'ai' | 'data' | 'user' }

const BOXES: Record<string, Box> = {
  users: { x: 20, y: 150, w: 130, h: 64, title: 'Planners & approvers', sub: 'Browser · SSO', tone: 'user' },
  cdn: { x: 200, y: 150, w: 140, h: 64, title: 'CloudFront', sub: '+ Cognito / SSO' },
  spa: { x: 400, y: 50, w: 150, h: 64, title: 'S3 · React app', sub: 'grid, workflow, charts' },
  api: { x: 400, y: 250, w: 150, h: 64, title: 'API Gateway', sub: 'throttled, authed' },
  fn: { x: 610, y: 250, w: 140, h: 64, title: 'Lambda', sub: 'calc · workflow · ask' },
  ddb: { x: 820, y: 150, w: 160, h: 64, title: 'DynamoDB', sub: 'scenarios · approvals · comments' },
  wh: { x: 820, y: 250, w: 160, h: 64, title: 'Athena / Redshift', sub: 'plan vs actual queries', tone: 'data' },
  ai: { x: 820, y: 350, w: 160, h: 64, title: 'Amazon Bedrock', sub: 'Claude · grounded commentary', tone: 'ai' },
  lake: { x: 610, y: 400, w: 140, h: 64, title: 'S3 data lake', sub: 'Parquet · Glue catalog', tone: 'data' },
  erp: { x: 400, y: 400, w: 150, h: 64, title: 'ERP / GL / HRIS', sub: 'Glue ETL nightly', tone: 'user' },
};

const EDGES: [string, string][] = [
  ['users', 'cdn'], ['cdn', 'spa'], ['cdn', 'api'], ['api', 'fn'], ['fn', 'ddb'], ['fn', 'wh'], ['fn', 'ai'], ['wh', 'lake'], ['erp', 'lake'],
];

const TONE = {
  aws: 'fill-surface stroke-accent',
  ai: 'fill-warn-soft stroke-warn',
  data: 'fill-accent-soft stroke-accent',
  user: 'fill-surface-2 stroke-line-strong',
};

function anchor(b: Box, toward: Box) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const tx = toward.x + toward.w / 2, ty = toward.y + toward.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) / b.w > Math.abs(dy) / b.h) return { x: cx + Math.sign(dx) * b.w / 2, y: cy };
  return { x: cx, y: cy + Math.sign(dy) * b.h / 2 };
}

export function ArchitectureView() {
  return (
    <div className="space-y-6">

      <Card title="Reference architecture">
        <div className="overflow-x-auto">
          <svg viewBox="0 0 1000 480" className="min-w-[760px] w-full h-auto" role="img" aria-label="Architecture diagram">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="fill-fg-subtle" />
              </marker>
            </defs>
            <rect x="185" y="20" width="810" height="455" rx="14" className="fill-none stroke-accent/40" strokeDasharray="6 5" />
            <text x="200" y="42" className="fill-accent text-[13px] font-semibold">Client AWS account (all serverless, deployed with CDK)</text>
            {EDGES.map(([a, b]) => {
              const p = anchor(BOXES[a], BOXES[b]), q = anchor(BOXES[b], BOXES[a]);
              return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="flow-dash stroke-fg-subtle" strokeWidth={1.5} markerEnd="url(#arrow)" />;
            })}
            {Object.entries(BOXES).map(([k, b]) => (
              <g key={k}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} className={TONE[b.tone ?? 'aws']} strokeWidth={1.5} />
                <text x={b.x + b.w / 2} y={b.y + 27} textAnchor="middle" className="fill-fg text-[14px] font-semibold">{b.title}</text>
                <text x={b.x + b.w / 2} y={b.y + 46} textAnchor="middle" className="fill-fg-muted text-[11px]">{b.sub}</text>
              </g>
            ))}
          </svg>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card title="Why own the planning layer">
          <ul className="space-y-2 text-sm text-fg-muted list-disc pl-4">
            <li><b>UX built for the users</b>: the grid, workflow and screens match how this team plans, not a vendor's generic model.</li>
            <li><b>Data stays put</b>: actuals are queried where they already live (S3 / Redshift), no nightly export into another platform.</li>
            <li><b>Pay for use</b>: serverless scales to zero between planning cycles; no per-seat platform license.</li>
            <li><b>AI on your own numbers</b>: Bedrock runs inside the account, grounded on the warehouse, auditable prompts.</li>
          </ul>
        </Card>
        <Card title="Honest tradeoffs">
          <ul className="space-y-2 text-sm text-fg-muted list-disc pl-4">
            <li>You own the roadmap and the maintenance, so it needs a real team or partner behind it.</li>
            <li>EPM suites still win on deep consolidation, close and statutory reporting.</li>
            <li>Best fit: <b>operational planning</b> (driver forecasts, headcount, opex budgets, scenarios) sitting next to the system of record.</li>
          </ul>
        </Card>
        <Card title="About this demo">
          <ul className="space-y-2 text-sm text-fg-muted list-disc pl-4">
            <li>Northwind Devices is fictional; 21 months of synthetic GL and driver data.</li>
            <li>This public link is a static build: calculations run in the browser and edits save to your browser only.</li>
            <li>The full AWS version (Athena, Lambda, DynamoDB, Bedrock, CloudFront) deploys from the same repo with one <code className="text-xs bg-surface-2 px-1 rounded">cdk deploy</code>.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
