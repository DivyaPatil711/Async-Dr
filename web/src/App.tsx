import { useMemo, useState, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import './App.css';

type Finding = {
  id: number; rule: string; message: string;
  file: string; line: number; column: number; fixable: boolean;
  snippet: string; snippetStart: number;
  funcSnippet: string; funcStart: number;
  execCount?: number; // dynamic executions
};
type Graph = { nodes: { id:string; label:string; count:number }[]; edges:{source:string;target:string}[] };
type DynamicSummary = {
  totalTraceEvents: number;
  userEvents: number;
  libEvents: number;
  executedFindingCount: number;
  byRuleExecuted: Record<string, number>;
};
type Report = {
  jobId: string; reportUrl: string; filesAnalyzed: number;
  byRule: Record<string, number>;
  byFile: Record<string, number>;
  findings: Finding[];
  graph: Graph;
  dynamic?: DynamicSummary;
};

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/$/, '');
const API = (p: string) => `${API_BASE}${p}`;
const ITEMS_PER_PAGE = 10;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Report | null>(null);
  const [q, setQ] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sidePanel, setSidePanel] = useState<Finding | null>(null);

  // GitHub analysis states
  const [githubUrl, setGithubUrl] = useState('');
  const [githubBranch, setGithubBranch] = useState('');
  const [analysisMode, setAnalysisMode] = useState<'upload' | 'github'>('upload');

  // AI Fix states
  const [aiTarget, setAiTarget] = useState<Finding | null>(null);
  const [aiPreview, setAiPreview] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);

  // Trace upload
  const [trace, setTrace] = useState<File | null>(null);
  const jobId = data?.jobId;

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('project', file);
      const res = await fetch(API('/analyze'), { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: Report = await res.json();
      setData(json);
      setCurrentPage(1);
    } catch (e:any) {
      alert('Upload failed: ' + e.message);
    } finally { setBusy(false); }
  }

  async function onGithubAnalyze() {
    if (!githubUrl.trim()) {
      alert('Please enter a GitHub repository URL');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(API('/analyze-github'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubUrl.trim(), branch: githubBranch.trim() || undefined })
      });
      if (!res.ok) {
        const error = await res.json().catch(()=>({}));
        throw new Error(error?.error || `HTTP ${res.status}`);
      }
      const json: Report = await res.json();
      setData(json);
      setCurrentPage(1);
    } catch (e: any) {
      alert('GitHub analysis failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.findings.filter(f =>
      !s ||
      f.rule.toLowerCase().includes(s) ||
      f.file.toLowerCase().includes(s) ||
      f.message.toLowerCase().includes(s)
    );
  }, [data, q]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedFindings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const topFiles = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byFile)
      .sort((a,b)=>b[1]-a[1])
      .slice(0, 8);
  }, [data]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function openAiFix(f: Finding) {
    if (!jobId) return;
    setAiTarget(f);
    setAiPreview('');
    setAiBusy(true);
    try {
      const res = await fetch(API(`/jobs/${jobId}/ai/fix`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: f.file,
          line: f.line,
          rule: f.rule,
          message: f.message,
          funcSnippet: f.funcSnippet,
          funcStart: f.funcStart,
          apply: false
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAiPreview(String(json.fixedFunction || json.fixed_function || ''));
    } catch (e:any) {
      alert('AI preview failed: ' + e.message);
      setAiTarget(null);
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAiFix() {
    if (!jobId || !aiTarget) return;
    setAiBusy(true);
    try {
      const res = await fetch(API(`/jobs/${jobId}/ai/fix`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: aiTarget.file,
          line: aiTarget.line,
          rule: aiTarget.rule,
          message: aiTarget.message,
          funcSnippet: aiTarget.funcSnippet,
          funcStart: aiTarget.funcStart,
          apply: true
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.report) setData(json.report);
      setAiTarget(null);
      setAiPreview('');
    } catch (e:any) {
      alert('Apply failed: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadTrace() {
    if (!jobId || !trace) return;
    try {
      const fd = new FormData();
      fd.append('trace', trace);
      const res = await fetch(API(`/jobs/${jobId}/trace`), { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: Report = await res.json();
      setData(json);
    } catch (e:any) {
      alert('Trace upload failed: ' + e.message);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Async Doctor</div>
        <div className="right">
          <a className="muted" href="https://icse22-drasync" target="_blank" rel="noreferrer">About</a>
        </div>
      </header>

      <main className="container">
        <section className="card hero">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${analysisMode === 'upload' ? 'active' : ''}`}
              onClick={() => setAnalysisMode('upload')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
              </svg>
              Upload ZIP
            </button>
            <button
              className={`mode-btn ${analysisMode === 'github' ? 'active' : ''}`}
              onClick={() => setAnalysisMode('github')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub Repository
            </button>
          </div>

          {analysisMode === 'upload' && (
            <div className="upload">
              <input
                type="file"
                accept=".zip"
                onChange={e=>setFile(e.target.files?.[0]||null)}
                disabled={busy}
              />
              <button className="btn primary" onClick={onUpload}>
                {busy ? 'Analyzing…' : 'Analyze ZIP'}
              </button>
            </div>
          )}

          {analysisMode === 'github' && (
            <div className="github-input">
              <div className="input-group">
                <input
                  type="text"
                  className="input"
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  disabled={busy}
                />
                <input
                  type="text"
                  className="input input-branch"
                  placeholder="Branch (optional)"
                  value={githubBranch}
                  onChange={e => setGithubBranch(e.target.value)}
                  disabled={busy}
                />
              </div>
              <button className="btn primary" onClick={onGithubAnalyze}>
                {busy ? 'Analyzing…' : 'Analyze Repository'}
              </button>
            </div>
          )}

          <div className="filters">
            <input
              type="text"
              className="input"
              placeholder="Search (rule, file, message)…"
              value={q}
              onChange={e=>{setQ(e.target.value); setCurrentPage(1);}}
            />
            {data && (
              <div className="stats">
                <Stat label="Files analyzed" value={data.filesAnalyzed} />
                <Stat label="Findings" value={data.findings.length} />
              </div>
            )}
          </div>
        </section>

        {data && (
          <>
            {/* DYNAMIC: trace upload & summary */}
            <section className="card">
              <h3>Dynamic Execution (trace.json)</h3>
              <div className="trace-uploader">
                <input type="file" accept=".json" onChange={e=>setTrace(e.target.files?.[0]||null)} />
                <button className="btn" onClick={uploadTrace} disabled={!trace}>Upload trace.json</button>
              </div>
              {data.dynamic ? (
                <div className="dyn-grid">
                  <Stat label="Trace events" value={data.dynamic.totalTraceEvents} />
                  <Stat label="User events" value={data.dynamic.userEvents} />
                  <Stat label="Library events" value={data.dynamic.libEvents} />
                  <Stat label="Executed findings" value={data.dynamic.executedFindingCount} />
                </div>
              ) : (
                <div className="muted">No dynamic trace uploaded yet.</div>
              )}
            </section>

            <section className="grid-layout">
              <div className="card donut-card">
                <h3>By Rule (static)</h3>
                <Donut counts={data.byRule} />
              </div>
              <div className="card graph-card">
                <h3>Module "Data-Flow"</h3>
                <GraphView graph={data.graph}/>
              </div>
            </section>

            <section className="card">
              <h3>Top Files (by findings)</h3>
              <Bars entries={topFiles}/>
            </section>

            <section>
              <h3 className="section-title">Findings ({filtered.length})</h3>
              <div className="table-layout">
                <div className="table-container">
                  <FindingsTable
                    findings={paginatedFindings}
                    onViewSnippet={setSidePanel}
                    onSolveAI={openAiFix}
                  />
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </div>
                {sidePanel && (
                  <SidePanel finding={sidePanel} onClose={()=>setSidePanel(null)} />
                )}
              </div>
            </section>

            {aiTarget && (
              <AIFixModal
                finding={aiTarget}
                preview={aiPreview}
                busy={aiBusy}
                onCancel={()=>{ setAiTarget(null); setAiPreview(''); }}
                onApply={applyAiFix}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ---------- UI bits ---------- */

function Stat({label, value}:{label:string; value:number|string}) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function colorAt(i:number, a=0.95) {
  const hue = (i * 62) % 360;
  return `hsl(${hue} 90% ${a*60}%)`;
}

function Donut({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s, [,n])=>s+n,0) || 1;

  let acc = 0;
  const stops:string[] = [];
  const legend = entries.slice(0, 8);
  entries.forEach(([_, n], i) => {
    const start = (acc / total) * 360;
    const end = ((acc + n) / total) * 360;
    stops.push(`${colorAt(i)} ${start}deg ${end}deg`);
    acc += n;
  });

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(',')})` }}>
        <div className="donut-hole">{total}</div>
      </div>
      <div className="legend">
        {legend.map(([rule, n], i)=>(
          <div className="legend-row" key={rule}>
            <span className="swatch" style={{background: colorAt(i)}}/>
            <span className="legend-key">{rule}</span>
            <span className="legend-val">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ entries }: { entries: [string, number][] }) {
  const max = Math.max(1, ...entries.map(([,n])=>n));
  return (
    <div className="bars">
      {entries.map(([file, n], i) => (
        <div key={file} className="bar-row">
          <span className="bar-key" title={file}>{file}</span>
          <div className="bar-track"><div className="bar-fill" style={{width:`${(n/max)*100}%`, background: colorAt(i)}}/></div>
          <span className="bar-val">{n}</span>
        </div>
      ))}
      {!entries.length && <div className="muted">No files to display.</div>}
    </div>
  );
}

function FindingsTable({
  findings,
  onViewSnippet,
  onSolveAI
}: {
  findings: Finding[];
  onViewSnippet: (f: Finding) => void;
  onSolveAI: (f: Finding) => void;
}) {
  if (!findings.length) {
    return <div className="muted table-empty">No findings match your filter.</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="findings-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>File</th>
            <th>Line</th>
            <th>Message</th>
            <th>Executed</th>
            <th>Fixable</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {findings.map(f => (
            <tr key={f.id}>
              <td><span className="pill-sm">{f.rule}</span></td>
              <td className="file-cell" title={f.file}>{f.file}</td>
              <td className="line-cell">{f.line}:{f.column}</td>
              <td className="message-cell">{f.message}</td>
              <td className="exec-cell">
                {f.execCount && f.execCount > 0
                  ? <span className="badge success">{f.execCount}</span>
                  : <span className="badge">0</span>}
              </td>
              <td className="fixable-cell">
                {f.fixable ? <span className="badge success">Yes</span> : <span className="badge">No</span>}
              </td>
              <td className="actions-cell">
                <button className="btn-icon" onClick={() => onViewSnippet(f)} title="View code">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 3.5L1 8l4.5 4.5L6.914 11.086 3.828 8l3.086-3.086L5.5 3.5zm5 0L9.086 4.914 12.172 8l-3.086 3.086L10.5 12.5 15 8l-4.5-4.5z"/>
                  </svg>
                </button>
                {f.fixable && (
                  <button className="btn btn-sm ai" onClick={() => onSolveAI(f)}>Solve with AI</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void
}) {
  const pages = [];
  const showPages = 5;
  let start = Math.max(1, currentPage - Math.floor(showPages / 2));
  let end = Math.min(totalPages, start + showPages - 1);
  if (end - start < showPages - 1) start = Math.max(1, end - showPages + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="pagination">
      <button className="btn-page" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>Previous</button>
      {start > 1 && (<><button className="btn-page" onClick={() => onPageChange(1)}>1</button>{start > 2 && <span className="pagination-ellipsis">...</span>}</>)}
      {pages.map(p => (
        <button key={p} className={`btn-page ${p === currentPage ? 'active' : ''}`} onClick={() => onPageChange(p)}>{p}</button>
      ))}
      {end < totalPages && (<>{end < totalPages - 1 && <span className="pagination-ellipsis">...</span>}<button className="btn-page" onClick={() => onPageChange(totalPages)}>{totalPages}</button></>)}
      <button className="btn-page" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
    </div>
  );
}

function SidePanel({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const [mode, setMode] = useState<'context'|'function'>('function');
  const src = mode === 'function' ? finding.funcSnippet : finding.snippet;
  const start = mode === 'function' ? finding.funcStart : finding.snippetStart;

  function copy() { navigator.clipboard.writeText(src).catch(()=>{}); }

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <div>
          <div className="side-panel-file">{finding.file}</div>
          <div className="side-panel-rule">Rule: {finding.rule}</div>
        </div>
        <button className="btn-close" onClick={onClose} title="Close">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
        </button>
      </div>

      <div className="side-panel-info">
        {finding.message} • line {finding.line}:{finding.column}
      </div>

      <div className="side-panel-actions">
        <div className="seg">
          <button className={`seg-btn ${mode==='function'?'active':''}`} onClick={()=>setMode('function')}>Function</button>
          <button className={`seg-btn ${mode==='context'?'active':''}`} onClick={()=>setMode('context')}>Context</button>
        </div>
        <button className="btn btn-sm" onClick={copy}>Copy</button>
      </div>

      <div className="side-panel-code">
        <CodeBlock code={src} start={start} highlight={finding.line}/>
      </div>
    </div>
  );
}

/* ---------- Diff helpers + view for AI modal ---------- */

type Op = { type: 'equal'|'delete'|'insert'; text: string };

function computeLineDiff(aText: string, bText: string): Op[] {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const n = a.length, m = b.length;

  const dp = Array.from({length: n+1}, () => new Array<number>(m+1).fill(0));
  for (let i=1;i<=n;i++) {
    for (let j=1;j<=m;j++) {
      if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
      else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }

  const ops: Op[] = [];
  let i = n, j = m;
  while (i>0 && j>0) {
    if (a[i-1] === b[j-1]) { ops.push({ type:'equal', text: a[i-1] }); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) { ops.push({ type:'delete', text: a[i-1] }); i--; }
    else { ops.push({ type:'insert', text: b[j-1] }); j--; }
  }
  while (i>0) { ops.push({ type:'delete', text: a[i-1] }); i--; }
  while (j>0) { ops.push({ type:'insert', text: b[j-1] }); j--; }
  ops.reverse();
  return ops;
}

function DiffView({ oldText, newText, oldStart, newStart }:{
  oldText: string;
  newText: string;
  oldStart: number;
  newStart: number;
}) {
  const ops = useMemo(() => computeLineDiff(oldText, newText), [oldText, newText]);
  let o = oldStart;
  let n = newStart;

  return (
    <div className="diff-wrapper">
      <div className="diff-legend">
        <span className="legend-chip add">Added</span>
        <span className="legend-chip del">Removed</span>
        <span className="legend-chip eq">Unchanged</span>
      </div>

      <div className="diff-scroller">
        <table className="diff-table">
          <thead>
            <tr>
              <th className="diff-lno">Old</th>
              <th className="diff-lno">New</th>
              <th className="diff-code-h">Code</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op, idx) => {
              let oldNo: string = '';
              let newNo: string = '';
              if (op.type === 'equal') { oldNo = String(o++); newNo = String(n++); }
              else if (op.type === 'delete') { oldNo = String(o++); }
              else if (op.type === 'insert') { newNo = String(n++); }

              return (
                <tr key={idx} className={`diff-line ${op.type}`}>
                  <td className="diff-lno">{oldNo}</td>
                  <td className="diff-lno">{newNo}</td>
                  <td className="diff-code">
                    <pre><code>
{op.type === 'insert' ? '+ ' : op.type === 'delete' ? '- ' : '  '}{op.text}
                    </code></pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Graph ---------- */

function CodeBlock({ code, start, highlight }:{code:string; start:number; highlight:number}) {
  const lines = code.split('\n');
  return (
    <pre className="code"><code>
      {lines.map((ln, i) => {
        const no = start + i;
        const hl = no === highlight;
        return (
          <span key={i} className={`code-line ${hl?'hl':''}`}>
            {String(no).padStart(4,' ')} │ {ln}
          </span>
        );
      })}
    </code></pre>
  );
}

function GraphView({ graph }: { graph: Graph }) {
  const cyRef = useRef<any>(null);

  const elements = useMemo(() => {
    const validNodes = graph.nodes
      .filter(n => n.id && n.id.trim() !== '')
      .map(n => ({
        data: {
          id: n.id,
          label: n.label.split('/').pop() || n.label,
          fullPath: n.label,
          count: n.count
        }
      }));
    const validNodeIds = new Set(validNodes.map(n => n.data.id));
    const validEdges = graph.edges
      .filter(e =>
        e.source && e.target &&
        e.source.trim() !== '' && e.target.trim() !== '' &&
        validNodeIds.has(e.source) && validNodeIds.has(e.target)
      )
      .map(e => ({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target } }));
    return [...validNodes, ...validEdges];
  }, [graph]);

  useEffect(() => {
    if (cyRef.current) {
      const cy = cyRef.current;
      cy.on('mouseover', 'node', (ev: any) => {
        const node = ev.target;
        node.style('background-color', '#79c0ff');
        node.style('width', '50');
        node.style('height', '50');
        const data = node.data();
        const pos = node.renderedPosition();
        let tip = document.getElementById('cy-tooltip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'cy-tooltip';
          tip.className = 'graph-tooltip';
          document.body.appendChild(tip);
        }
        tip.innerHTML = `<div class="tooltip-path">${data.fullPath}</div><div class="tooltip-count">Imports: ${data.count}</div>`;
        tip.style.display = 'block';
        tip.style.left = `${pos.x + 20}px`;
        tip.style.top = `${pos.y - 40}px`;
      });
      cy.on('mouseout', 'node', (ev: any) => {
        const node = ev.target;
        node.style('background-color', '#58a6ff');
        node.style('width', '40');
        node.style('height', '40');
        const tip = document.getElementById('cy-tooltip');
        if (tip) tip.style.display = 'none';
      });
      return () => {
        const tip = document.getElementById('cy-tooltip');
        if (tip) tip.remove();
      };
    }
  }, []);

  if (!elements || elements.length === 0) {
    return (
      <div className="graph-container">
        <div className="graph-empty">
          <svg width="64" height="64" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 4.42 3.58 8 8 8s8-3.58 8-8c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
            <circle cx="8" cy="8" r="2"/>
          </svg>
          <p className="muted">No import graph data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <CytoscapeComponent
        cy={(cy) => { cyRef.current = cy; }}
        elements={elements as any}
        style={{ width: '100%', height: '100%' }}
        layout={{
          name: 'cose',
          animate: true,
          animationDuration: 1000,
          nodeRepulsion: 8000,
          idealEdgeLength: 100,
          edgeElasticity: 100,
          nestingFactor: 5,
          gravity: 80,
          numIter: 1000,
          padding: 30,
          randomize: false,
          componentSpacing: 100,
          nodeOverlap: 20,
          refresh: 20,
          fit: true,
          nodeDimensionsIncludeLabels: false
        }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              'background-color': '#58a6ff',
              'font-size': '11px',
              'color': '#fff',
              'text-valign': 'center',
              'text-halign': 'center',
              'label': 'data(label)',
              'width': '40',
              'height': '40',
              'text-wrap': 'wrap',
              'text-max-width': '80px',
              'font-weight': '600',
              'border-width': '2',
              'border-color': '#79c0ff',
              'border-opacity': 0.5,
              'transition-property': 'background-color, width, height',
              'transition-duration': '0.3s',
              'overlay-padding': '6px',
              'z-index': 10
            }
          },
          {
            selector: 'edge',
            style: {
              'width': 2,
              'line-color': '#30363d',
              'target-arrow-color': '#58a6ff',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.5,
              'opacity': 0.6,
              'z-index': 1
            }
          },
          {
            selector: 'node:selected',
            style: {
              'background-color': '#79c0ff',
              'border-color': '#fff',
              'border-width': '3'
            }
          }
        ] as any}
      />
    </div>
  );
}
function AIFixModal({
  finding, preview, busy, onCancel, onApply
}: {
  finding: Finding;
  preview: string;
  busy: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const before = finding.funcSnippet;
  const after = preview;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="card modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="muted">{finding.file}</div>
            <h3 style={{margin:'4px 0 0'}}>Solve with AI — {finding.rule}</h3>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Close</button>
            <button className="btn primary" disabled={busy || !after} onClick={onApply}>
              {busy ? 'Applying…' : 'Apply fix'}
            </button>
          </div>
        </div>

        {!after ? (
          <div className="muted" style={{marginTop:8}}>Generating proposal…</div>
        ) : (
          <DiffView
            oldText={before}
            newText={after}
            oldStart={finding.funcStart}
            newStart={finding.funcStart}
          />
        )}
      </div>
    </div>
  );
}
