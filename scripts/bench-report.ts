/** Generates a 100% self-contained single-file HTML dashboard (`bench/dashboard.html`)
 * from real measurements stored in `bench/results/*.json` and `bench/baseline.json`.
 *
 * Rules:
 * - Zero hardcoded/estimated benchmark numbers.
 * - Zero external scripts/CSS/CDN links (works offline via double click).
 * - Displays Median and P95 everywhere, never average alone.
 * - Visually separates `offline` and `live` measurements (`Sem dados` when empty).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BenchRunResult } from "./bench.ts";

const ROOT = resolve(import.meta.dir, "..");
const BENCH_DIR = join(ROOT, "bench");
const RESULTS_DIR = join(BENCH_DIR, "results");
const BASELINE_PATH = join(BENCH_DIR, "baseline.json");
const BASELINE_LIVE_PATH = join(BENCH_DIR, "baseline-live.json");
const DASHBOARD_PATH = join(BENCH_DIR, "dashboard.html");

interface LoadedRuns {
  baseline: BenchRunResult | null;
  baselineLive: BenchRunResult | null;
  runs: BenchRunResult[];
}

async function readJsonSafe(filePath: string): Promise<BenchRunResult | null> {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text) as BenchRunResult;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.scenarios)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadRuns(): Promise<LoadedRuns> {
  const baseline = await readJsonSafe(BASELINE_PATH);
  const baselineLive = await readJsonSafe(BASELINE_LIVE_PATH);
  const runs: BenchRunResult[] = [];
  try {
    const files = (await readdir(RESULTS_DIR)).filter(f => f.endsWith(".json")).sort();
    for (const file of files) {
      const parsed = await readJsonSafe(join(RESULTS_DIR, file));
      if (parsed) runs.push(parsed);
    }
  } catch {
    // results dir may not exist on fresh checkout (uses baseline.json if committed)
  }
  runs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { baseline, baselineLive, runs };
}

function buildHtml(data: LoadedRuns): string {
  const embeddedJson = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>autocalc — Benchmark &amp; Diagnóstico de Performance</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-alt: #f1f5f9;
      --border: #cbd5e1;
      --text: #0f172a;
      --text-muted: #475569;
      --accent: #0369a1;
      --accent-soft: #e0f2fe;
      --good: #15803d;
      --good-bg: #dcfce7;
      --bad: #b91c1c;
      --bad-bg: #fee2e2;
      --warn: #a16207;
      --warn-bg: #fef9c3;
      --grid-line: #e2e8f0;
      --s-compilar: #0284c7;
      --s-normalizar: #7c3aed;
      --s-pagina: #ea580c;
      --s-salvar: #0d9488;
      --s-rating: #ca8a04;
      --s-edit: #dc2626;
      --s-publicar: #4f46e5;
    }
    [data-theme="dark"] {
      --bg: #0b1120;
      --surface: #111827;
      --surface-alt: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-soft: #0c4a6e;
      --good: #4ade80;
      --good-bg: #14532d;
      --bad: #f87171;
      --bad-bg: #7f1d1d;
      --warn: #facc15;
      --warn-bg: #422006;
      --grid-line: #1e293b;
      --s-compilar: #38bdf8;
      --s-normalizar: #a78bfa;
      --s-pagina: #fb923c;
      --s-salvar: #2dd4bf;
      --s-rating: #facc15;
      --s-edit: #f87171;
      --s-publicar: #818cf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .container {
      max-width: 1320px;
      margin: 0 auto;
      padding: 20px 16px 48px;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }
    h1 { margin: 0; font-size: 1.35rem; }
    .subtitle { margin: 4px 0 0; color: var(--text-muted); font-size: 0.9rem; }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .btn, select {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .btn.active {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
      font-weight: 600;
    }
    [data-theme="dark"] .btn.active { color: #0b1120; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid transparent;
    }
    .badge-offline { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
    .badge-live { background: var(--warn-bg); color: var(--warn); border-color: var(--warn); }
    .badge-good { background: var(--good-bg); color: var(--good); }
    .badge-bad { background: var(--bad-bg); color: var(--bad); }
    .badge-neutral { background: var(--surface-alt); color: var(--text-muted); border-color: var(--border); }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      min-width: 0;
    }
    .span-12 { grid-column: span 12; }
    .span-6 { grid-column: span 6; }
    @media (max-width: 900px) {
      .span-6 { grid-column: span 12; }
    }
    .card h2 {
      margin: 0 0 6px;
      font-size: 1.05rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .card-desc {
      margin: 0 0 14px;
      color: var(--text-muted);
      font-size: 0.84rem;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 10px;
    }
    .meta-item {
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .meta-k { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
    .meta-v { font-size: 0.9rem; font-weight: 600; word-break: break-word; }
    .svg-wrap { width: 100%; overflow-x: auto; }
    svg { display: block; width: 100%; height: auto; font-family: inherit; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 10px 0 0;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .table-wrap { width: 100%; overflow-x: auto; margin-top: 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.83rem;
    }
    th, td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      white-space: nowrap;
    }
    th { background: var(--surface-alt); color: var(--text-muted); font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty-state {
      padding: 28px 16px;
      text-align: center;
      color: var(--text-muted);
      background: var(--surface-alt);
      border-radius: 8px;
      border: 1px dashed var(--border);
      font-size: 0.9rem;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--surface-alt);
      border-left: 4px solid var(--accent);
      font-size: 0.85rem;
      margin-bottom: 12px;
    }
    #tooltip {
      position: fixed;
      pointer-events: none;
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 0.78rem;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      z-index: 1000;
      display: none;
      max-width: 320px;
      line-height: 1.4;
    }
    .hover-target { cursor: crosshair; }
  </style>
</head>
<body>
  <div id="tooltip"></div>
  <div class="container">
    <header>
      <div>
        <h1>autocalc — Diagnóstico de Performance &amp; Benchmarks</h1>
        <p class="subtitle">Dados reais gravados pelo harness (mediana e p95; sem estimativas). Separação estrita entre execuções <strong>offline/loopback</strong> e <strong>live</strong>.</p>
      </div>
      <div class="controls">
        <button id="mode-offline" class="btn active" type="button">Modo Offline / Loopback</button>
        <button id="mode-live" class="btn" type="button">Modo Live Portal</button>
        <select id="run-select" aria-label="Selecionar execução"></select>
        <button id="theme-toggle" class="btn" type="button">Alternar Tema</button>
      </div>
    </header>

    <div id="root-content"></div>
  </div>

  <script id="bench-data" type="application/json">${embeddedJson}</script>
  <script>
(() => {
  const RAW = JSON.parse(document.getElementById('bench-data').textContent || '{}');
  const STAGE_COLORS = {
    compilar: 'var(--s-compilar)',
    normalizar: 'var(--s-normalizar)',
    pagina: 'var(--s-pagina)',
    salvar: 'var(--s-salvar)',
    rating: 'var(--s-rating)',
    edit: 'var(--s-edit)',
    publicar: 'var(--s-publicar)',
  };
  const STAGE_ORDER = ['compilar', 'normalizar', 'pagina', 'salvar', 'rating', 'edit', 'publicar'];
  const STAGE_NAMES = {
    compilar: 'Compilar / Validar',
    normalizar: 'Normalizar / Plan / Shards',
    pagina: 'Página / Forms / Encode',
    salvar: 'Salvar / Detail',
    rating: 'Rating Engine',
    edit: 'Edit Check',
    publicar: 'Publicar / Lock',
  };

  let activeMode = 'offline';
  let selectedRunIdx = -1;

  // Theme initialization
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
  });

  // Tooltip helpers
  const tip = document.getElementById('tooltip');
  function attachTooltips(container) {
    for (const el of container.querySelectorAll('[data-tip]')) {
      el.addEventListener('mouseenter', (ev) => {
        tip.innerHTML = el.getAttribute('data-tip');
        tip.style.display = 'block';
        moveTip(ev);
      });
      el.addEventListener('mousemove', moveTip);
      el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }
  }
  function moveTip(ev) {
    const x = Math.min(window.innerWidth - 330, ev.clientX + 12);
    const y = Math.min(window.innerHeight - 120, ev.clientY + 12);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtMs(v) {
    if (v === undefined || v === null || Number.isNaN(v)) return '—';
    return Number(v).toFixed(2) + ' ms';
  }

  function allRunsForMode(mode) {
    const out = [];
    for (const [src, candidate] of [['baseline', RAW.baseline], ['baseline-live', RAW.baselineLive]]) {
      if (candidate && candidate.mode === mode) {
        const dup = out.some(o => o.run.timestamp === candidate.timestamp && o.run.metadata?.commit === candidate.metadata?.commit);
        if (!dup) out.push({ source: src, run: candidate });
      }
    }
    if (Array.isArray(RAW.runs)) {
      for (const r of RAW.runs) {
        if (r && r.mode === mode) {
          const dup = out.some(o => o.run.timestamp === r.timestamp && o.run.metadata?.commit === r.metadata?.commit);
          if (!dup) out.push({ source: 'result', run: r });
        }
      }
    }
    return out;
  }

  function renderMeta(run, source) {
    const m = run.metadata || {};
    const modeBadge = run.mode === 'live'
      ? '<span class="badge badge-live">LIVE (portal real)</span>'
      : '<span class="badge badge-offline">OFFLINE (CPU/disco/Chromium loopback)</span>';
    const items = [
      ['Timestamp', run.timestamp],
      ['Origem', source === 'baseline-live' ? 'bench/baseline-live.json' : source === 'baseline' ? 'bench/baseline.json' : 'bench/results/*.json'],
      ['Commit / Branch', (m.commit || '?') + ' (' + (m.branch || '?') + (m.dirty ? ', dirty' : '') + ')'],
      ['Sistema Operacional', (m.os_platform || '?') + ' ' + (m.os_release || '') + ' (' + (m.arch || '?') + ')'],
      ['Bun', 'v' + (m.bun_version || '?')],
      ['Repetições / Warmup', String(m.repetitions ?? '?') + ' reps / ' + String(m.warmup ?? '?') + ' warmup'],
      ['CPU / RAM Livre', (m.cpu_count ?? '?') + ' threads / ' + (m.free_mem_mb ?? '?') + ' MB livre'],
      ['Workers Default', 'encode=' + (m.encode_workers_default ?? '?') + ', rating=' + (m.rating_workers_default ?? '?')],
    ];
    return '<div class="card span-12">' +
      '<h2><span>6. Metadados da Execução</span>' + modeBadge + '</h2>' +
      '<div class="meta-grid">' +
      items.map(([k, v]) => '<div class="meta-item"><div class="meta-k">' + esc(k) + '</div><div class="meta-v">' + esc(v) + '</div></div>').join('') +
      '</div></div>';
  }

  function renderScalingLine(scenarios) {
    if (!scenarios || !scenarios.length) {
      return '<div class="card span-6"><h2>1. Tempo total × nº de recursos</h2><div class="empty-state">Sem dados de cenários.</div></div>';
    }
    const sorted = [...scenarios].sort((a, b) => a.resource_count - b.resource_count);
    const W = 600, H = 290, padL = 68, padR = 24, padT = 22, padB = 46;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxY = Math.max(10, ...sorted.map(s => Math.max(s.total_median_ms, s.total_p95_ms))) * 1.12;
    const maxX = Math.max(10, ...sorted.map(s => s.resource_count));
    const xPos = x => padL + (x / maxX) * plotW;
    const yPos = y => padT + plotH - (y / maxY) * plotH;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    for (let i = 0; i <= 4; i++) {
      const val = (maxY * i) / 4;
      const y = yPos(val);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--grid-line)" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-muted)">' + Math.round(val) + ' ms</text>';
    }
    const ticksX = sorted.map(s => s.resource_count);
    for (const tx of ticksX) {
      const x = xPos(tx);
      svg += '<text x="' + x + '" y="' + (H - 18) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">' + tx + '</text>';
    }
    svg += '<text x="' + (padL + plotW / 2) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">Recursos na cotação</text>';

    const ptsMed = sorted.map(s => xPos(s.resource_count).toFixed(1) + ',' + yPos(s.total_median_ms).toFixed(1)).join(' ');
    const ptsP95 = sorted.map(s => xPos(s.resource_count).toFixed(1) + ',' + yPos(s.total_p95_ms).toFixed(1)).join(' ');
    svg += '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="' + ptsMed + '"/>';
    svg += '<polyline fill="none" stroke="var(--s-pagina)" stroke-width="2" stroke-dasharray="5,4" points="' + ptsP95 + '"/>';

    for (const s of sorted) {
      const x = xPos(s.resource_count);
      const yM = yPos(s.total_median_ms);
      const yP = yPos(s.total_p95_ms);
      const tipHtml = '<strong>' + esc(s.id) + '</strong><br/>' +
        s.resource_count + ' recursos / ' + s.card_count + ' cartões / ' + s.shard_count + ' shard(s)<br/>' +
        'Mediana: <strong>' + fmtMs(s.total_median_ms) + '</strong><br/>' +
        'p95: <strong>' + fmtMs(s.total_p95_ms) + '</strong>';
      svg += '<circle class="hover-target" cx="' + x + '" cy="' + yP + '" r="4.5" fill="var(--s-pagina)" data-tip="' + esc(tipHtml) + '"/>';
      svg += '<circle class="hover-target" cx="' + x + '" cy="' + yM + '" r="5" fill="var(--accent)" data-tip="' + esc(tipHtml) + '"/>';
    }
    svg += '</svg>';

    return '<div class="card span-6">' +
      '<h2>1. Tempo Total × Nº de Recursos</h2>' +
      '<p class="card-desc">Escala ponta a ponta (<code>parse → validate → apply → gate → editCheck</code>). Passe o mouse nos pontos para ver ms exatos (mediana e p95).</p>' +
      '<div class="svg-wrap">' + svg + '</div>' +
      '<div class="legend">' +
      '<span class="legend-item"><span class="swatch" style="background:var(--accent)"></span>Mediana total (ms)</span>' +
      '<span class="legend-item"><span class="swatch" style="background:var(--s-pagina)"></span>p95 total (ms)</span>' +
      '</div></div>';
  }

  function renderStackedStages(scenarios) {
    if (!scenarios || !scenarios.length) {
      return '<div class="card span-6"><h2>2. Decomposição por Etapa</h2><div class="empty-state">Sem dados de etapas.</div></div>';
    }
    const W = 600, H = 290, padL = 68, padR = 20, padT = 22, padB = 46;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxY = Math.max(10, ...scenarios.map(s => s.stages.reduce((a, b) => a + b.median_ms, 0))) * 1.12;
    const barSlot = plotW / scenarios.length;
    const barW = Math.min(64, barSlot * 0.62);

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    for (let i = 0; i <= 4; i++) {
      const val = (maxY * i) / 4;
      const y = padT + plotH - (val / maxY) * plotH;
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--grid-line)" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-muted)">' + Math.round(val) + ' ms</text>';
    }

    scenarios.forEach((s, idx) => {
      const x = padL + idx * barSlot + (barSlot - barW) / 2;
      let yCursor = padT + plotH;
      const byId = Object.fromEntries(s.stages.map(st => [st.stage, st]));
      for (const stId of STAGE_ORDER) {
        const st = byId[stId];
        if (!st || st.median_ms <= 0) continue;
        const h = (st.median_ms / maxY) * plotH;
        yCursor -= h;
        const tipHtml = '<strong>' + esc(s.id) + ' — ' + esc(st.label) + '</strong><br/>' +
          'Mediana: <strong>' + fmtMs(st.median_ms) + '</strong> (' + st.share_pct.toFixed(1) + '%)<br/>' +
          'p95: <strong>' + fmtMs(st.p95_ms) + '</strong>';
        svg += '<rect class="hover-target" x="' + x.toFixed(1) + '" y="' + yCursor.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" fill="' + STAGE_COLORS[stId] + '" data-tip="' + esc(tipHtml) + '"/>';
      }
      svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">' + s.resource_count + ' rec</text>';
      svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="10" fill="var(--text-muted)">(' + s.card_count + ' cartões)</text>';
    });
    svg += '</svg>';

    const heaviest = scenarios[scenarios.length - 1];
    const tableRows = heaviest.stages.map(st =>
      '<tr><td><span class="swatch" style="background:' + STAGE_COLORS[st.stage] + ';margin-right:6px;vertical-align:middle"></span>' + esc(st.label) + '</td>' +
      '<td class="num">' + fmtMs(st.median_ms) + '</td>' +
      '<td class="num">' + fmtMs(st.p95_ms) + '</td>' +
      '<td class="num">' + st.share_pct.toFixed(1) + '%</td></tr>'
    ).join('');

    return '<div class="card span-6">' +
      '<h2>2. Decomposição por Etapa (Mediana em ms)</h2>' +
      '<p class="card-desc">Distribuição nas 7 etapas. Tabela abaixo detalha o cenário mais pesado: <strong>' + esc(heaviest.id) + '</strong>.</p>' +
      '<div class="svg-wrap">' + svg + '</div>' +
      '<div class="legend">' +
      STAGE_ORDER.map(id => '<span class="legend-item"><span class="swatch" style="background:' + STAGE_COLORS[id] + '"></span>' + esc(STAGE_NAMES[id]) + '</span>').join('') +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Etapa (' + esc(heaviest.id) + ')</th><th class="num">Mediana</th><th class="num">p95</th><th class="num">% Total</th></tr></thead><tbody>' +
      tableRows + '</tbody></table></div></div>';
  }

  function renderBottlenecks(bottlenecks) {
    if (!bottlenecks || !bottlenecks.length) {
      return '<div class="card span-6"><h2>3. Top 5 Gargalos Medidos</h2><div class="empty-state">Sem dados de isolamento de gargalos para este modo.</div></div>';
    }
    const top = [...bottlenecks].sort((a, b) => b.median_ms - a.median_ms).slice(0, 6);
    const W = 600, rowH = 44, padL = 235, padR = 76, padT = 16, padB = 28;
    const H = padT + padB + top.length * rowH;
    const plotW = W - padL - padR;
    const maxV = Math.max(1, ...top.map(b => b.median_ms)) * 1.1;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    top.forEach((b, idx) => {
      const y = padT + idx * rowH + 8;
      const bw = Math.max(2, (b.median_ms / maxV) * plotW);
      const shortName = b.name.length > 36 ? b.name.slice(0, 35) + '…' : b.name;
      const color = b.category === 'browser' ? 'var(--s-edit)' : b.category === 'io_cache' ? 'var(--s-pagina)' : b.category === 'serialization' ? 'var(--s-normalizar)' : 'var(--accent)';
      const tipHtml = '<strong>' + esc(b.name) + '</strong><br/>' +
        'Mediana: <strong>' + fmtMs(b.median_ms) + '</strong> | p95: <strong>' + fmtMs(b.p95_ms) + '</strong>' +
        (b.comparison_ms !== undefined ? '<br/>Comparado/Otimizado: <strong>' + fmtMs(b.comparison_ms) + '</strong> (' + (b.delta_pct > 0 ? '+' : '') + b.delta_pct + '%)' : '') +
        '<br/>' + esc(b.summary);
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="11" fill="var(--text)">' + esc(shortName) + '</text>';
      svg += '<rect class="hover-target" x="' + padL + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="22" rx="4" fill="' + color + '" data-tip="' + esc(tipHtml) + '"/>';
      const pctLabel = b.share_of_total_pct !== undefined ? ' (' + b.share_of_total_pct.toFixed(1) + '%)' : '';
      svg += '<text x="' + (padL + bw + 6).toFixed(1) + '" y="' + (y + 15) + '" font-size="11" fill="var(--text-muted)">' + b.median_ms.toFixed(1) + ' ms' + pctLabel + '</text>';
    });
    svg += '<text x="' + (padL + plotW / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">Latência mediana isolada (ms)</text>';
    svg += '</svg>';

    const rows = top.map(b =>
      '<tr><td>' + esc(b.name) + '</td><td class="num">' + fmtMs(b.median_ms) + '</td><td class="num">' + fmtMs(b.p95_ms) + '</td><td class="num">' +
      (b.comparison_ms !== undefined ? fmtMs(b.comparison_ms) + ' (' + (b.delta_pct > 0 ? '+' : '') + b.delta_pct + '%)' : '—') + '</td></tr>'
    ).join('');

    return '<div class="card span-6">' +
      '<h2>3. Top Gargalos Isolados (ms e % do total)</h2>' +
      '<p class="card-desc">Comparação controlada: estado atual × alternativa isolada (memoização, contexto quente, Edit paralelo).</p>' +
      '<div class="svg-wrap">' + svg + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Gargalo</th><th class="num">Mediana</th><th class="num">p95</th><th class="num">Alternativa medida</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function renderConcurrency(concurrency) {
    if (!concurrency || !concurrency.length) {
      return '<div class="card span-6"><h2>4. Sequencial × Paralelo (Speedup)</h2><div class="empty-state">Sem dados de concorrência para este modo.</div></div>';
    }
    const browserPts = concurrency.filter(c => c.kind === 'browser_encode').sort((a, b) => a.workers - b.workers);
    const catalogPts = concurrency.filter(c => c.kind === 'catalog_lookup').sort((a, b) => a.workers - b.workers);
    const W = 600, H = 260, padL = 56, padR = 24, padT = 20, padB = 42;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxW = Math.max(4, ...concurrency.map(c => c.workers));
    const maxS = Math.max(4, maxW * 0.9, ...concurrency.map(c => c.speedup));
    const xPos = w => padL + ((w - 1) / Math.max(1, maxW - 1)) * plotW;
    const yPos = s => padT + plotH - (s / maxS) * plotH;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '">';
    for (let i = 0; i <= 4; i++) {
      const v = (maxS * i) / 4;
      const y = yPos(v);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--grid-line)"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--text-muted)">' + v.toFixed(1) + '×</text>';
    }
    const ticks = maxW <= 4 ? [1, 2, 3, 4] : [1, 2, 3, 4, 6, 8];
    for (const w of ticks) {
      const x = xPos(w);
      svg += '<text x="' + x + '" y="' + (H - 18) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">' + w + 'w</text>';
    }
    // Ideal linear reference (capped inside view)
    svg += '<line x1="' + xPos(1) + '" y1="' + yPos(1) + '" x2="' + xPos(Math.min(maxW, maxS)) + '" y2="' + yPos(Math.min(maxW, maxS)) + '" stroke="var(--border)" stroke-dasharray="4,4"/>';

    const drawSeries = (pts, color, label) => {
      if (!pts.length) return '';
      let out = '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" points="' +
        pts.map(p => xPos(p.workers).toFixed(1) + ',' + yPos(p.speedup).toFixed(1)).join(' ') + '"/>';
      for (const p of pts) {
        const tipHtml = '<strong>' + esc(label) + ' (' + p.workers + ' workers)</strong><br/>' +
          'Itens: ' + p.item_count + ' | Speedup: <strong>' + p.speedup.toFixed(2) + '×</strong> (' + p.efficiency_pct.toFixed(1) + '% efic.)<br/>' +
          'Mediana: <strong>' + fmtMs(p.median_ms) + '</strong> | p95: <strong>' + fmtMs(p.p95_ms) + '</strong>';
        out += '<circle class="hover-target" cx="' + xPos(p.workers).toFixed(1) + '" cy="' + yPos(p.speedup).toFixed(1) + '" r="5" fill="' + color + '" data-tip="' + esc(tipHtml) + '"/>';
      }
      return out;
    };
    const browserLabel = activeMode === 'live' ? 'Browser Encode (portal Huawei Cloud)' : 'Browser Encode (loopback Chromium)';
    svg += drawSeries(browserPts, 'var(--s-pagina)', browserLabel);
    svg += drawSeries(catalogPts, 'var(--accent)', 'Catalog.skus (CatalogCache disco)');
    svg += '<text x="' + (padL + plotW / 2) + '" y="' + (H - 2) + '" text-anchor="middle" font-size="11" fill="var(--text-muted)">Nível de concorrência (workers)</text>';
    svg += '</svg>';

    const rows = browserPts.map(p =>
      '<tr><td>' + p.workers + '</td><td class="num">' + fmtMs(p.median_ms) + '</td><td class="num">' + fmtMs(p.p95_ms) + '</td><td class="num">' + p.speedup.toFixed(2) + '×</td><td class="num">' + p.efficiency_pct.toFixed(1) + '%</td></tr>'
    ).join('');

    const itemCount = browserPts[0] ? browserPts[0].item_count : '?';
    const concDesc = activeMode === 'live'
      ? 'Browser encoding ao vivo (' + itemCount + ' cartões reais no portal). Default atual: <code>encodeWorkers <= 3</code>.'
      : 'Browser encoding (' + itemCount + ' cartões, loopback Chromium)' + (catalogPts.length ? ' vs leitura de catálogo (<code>CatalogCache</code> em disco, 40 chamadas)' : '') + '. Default atual: <code>encodeWorkers <= 3</code>.';

    return '<div class="card span-6">' +
      '<h2>4. Sequencial × Paralelo (Speedup)</h2>' +
      '<p class="card-desc">' + concDesc + '</p>' +
      '<div class="svg-wrap">' + svg + '</div>' +
      '<div class="legend">' +
      '<span class="legend-item"><span class="swatch" style="background:var(--s-pagina)"></span>Browser Encode (×)</span>' +
      (catalogPts.length ? '<span class="legend-item"><span class="swatch" style="background:var(--accent)"></span>Catalog.skus disco (×)</span>' : '') +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Workers (Browser)</th><th class="num">Mediana</th><th class="num">p95</th><th class="num">Speedup</th><th class="num">Eficiência</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function renderCommitComparison(runsForMode, currentRun) {
    const baselineRun =
      (RAW.baseline && RAW.baseline.mode === activeMode ? RAW.baseline : null) ||
      (RAW.baselineLive && RAW.baselineLive.mode === activeMode ? RAW.baselineLive : null);
    if (!baselineRun || runsForMode.length === 0) {
      return '<div class="card span-12"><h2>5. Comparação Antes × Depois por Commit</h2><div class="empty-state">Sem baseline neste modo para comparar.</div></div>';
    }
    const distinctCommits = new Set(runsForMode.map(r => r.run.metadata?.commit || 'unknown'));
    const compareRun = baselineRun;
    const sameCommit = (compareRun.metadata?.commit === currentRun.metadata?.commit) && distinctCommits.size < 2;
    const notice = sameCommit
      ? '<div class="notice">Apenas o commit baseline <code>' + esc(compareRun.metadata?.commit) + '</code> possui medições no momento (Fase 1). Após otimizações em commits futuros e nova execução de <code>bun run bench</code>, deltas em % e regressões aparecerão destacados abaixo.</div>'
      : '';

    const rows = currentRun.scenarios.map(cur => {
      const prev = compareRun.scenarios.find(s => s.id === cur.id);
      if (!prev) {
        return '<tr><td>' + esc(cur.id) + '</td><td class="num">—</td><td class="num">' + fmtMs(cur.total_median_ms) + '</td><td class="num">' + fmtMs(cur.total_p95_ms) + '</td><td class="num"><span class="badge badge-neutral">sem base</span></td></tr>';
      }
      const deltaPct = prev.total_median_ms > 0 ? ((cur.total_median_ms - prev.total_median_ms) / prev.total_median_ms) * 100 : 0;
      const cls = deltaPct > 2 ? 'badge-bad' : deltaPct < -2 ? 'badge-good' : 'badge-neutral';
      const label = (deltaPct > 2 ? 'REGRESSÃO +' : deltaPct > 0 ? '+' : '') + deltaPct.toFixed(1) + '%';
      return '<tr><td>' + esc(cur.id) + ' (' + cur.resource_count + ' rec)</td>' +
        '<td class="num">' + fmtMs(prev.total_median_ms) + ' (p95 ' + fmtMs(prev.total_p95_ms) + ')</td>' +
        '<td class="num">' + fmtMs(cur.total_median_ms) + '</td>' +
        '<td class="num">' + fmtMs(cur.total_p95_ms) + '</td>' +
        '<td class="num"><span class="badge ' + cls + '">' + label + '</span></td></tr>';
    }).join('');

    const curHeavy = currentRun.scenarios[currentRun.scenarios.length - 1];
    const prevHeavy = curHeavy ? compareRun.scenarios.find(s => s.id === curHeavy.id) : null;
    const stageDiffRows = (curHeavy && prevHeavy)
      ? STAGE_ORDER.map(stId => {
          const curSt = curHeavy.stages.find(st => st.stage === stId);
          const prevSt = prevHeavy.stages.find(st => st.stage === stId);
          if (!curSt || !prevSt) return '';
          const dPct = prevSt.median_ms > 0 ? ((curSt.median_ms - prevSt.median_ms) / prevSt.median_ms) * 100 : 0;
          const cls = dPct > 5 && curSt.median_ms > 20 ? 'badge-bad' : dPct < -2 ? 'badge-good' : 'badge-neutral';
          const lbl = (dPct > 0 ? '+' : '') + dPct.toFixed(1) + '%';
          return '<tr><td><span class="swatch" style="background:' + STAGE_COLORS[stId] + ';margin-right:6px;vertical-align:middle"></span>' + esc(curSt.label) + '</td>' +
            '<td class="num">' + fmtMs(prevSt.median_ms) + '</td>' +
            '<td class="num">' + fmtMs(curSt.median_ms) + '</td>' +
            '<td class="num">' + fmtMs(curSt.p95_ms) + '</td>' +
            '<td class="num"><span class="badge ' + cls + '">' + lbl + '</span></td></tr>';
        }).join('')
      : '';

    const bottleneckRows = (currentRun.bottlenecks || []).map(curB => {
      const prevB = (compareRun.bottlenecks || []).find(b => b.id === curB.id);
      if (!prevB) return '';
      const dPct = prevB.median_ms > 0 ? ((curB.median_ms - prevB.median_ms) / prevB.median_ms) * 100 : 0;
      const cls = dPct > 5 && curB.median_ms > 10 ? 'badge-bad' : dPct < -2 ? 'badge-good' : 'badge-neutral';
      const lbl = (dPct > 0 ? '+' : '') + dPct.toFixed(1) + '%';
      return '<tr><td>' + esc(curB.name) + '</td>' +
        '<td class="num">' + fmtMs(prevB.median_ms) + '</td>' +
        '<td class="num">' + fmtMs(curB.median_ms) + '</td>' +
        '<td class="num">' + fmtMs(curB.p95_ms) + '</td>' +
        '<td class="num"><span class="badge ' + cls + '">' + lbl + '</span></td></tr>';
    }).join('');

    return '<div class="card span-12">' +
      '<h2>5. Comparação Antes × Depois por Commit (' + esc(compareRun.metadata?.commit || 'base') + ' → ' + esc(currentRun.metadata?.commit || 'atual') + ')</h2>' +
      notice +
      '<div class="table-wrap"><table><thead><tr><th>Cenário</th><th class="num">Antes (Baseline Mediana / p95)</th><th class="num">Atual (Mediana)</th><th class="num">Atual (p95)</th><th class="num">Delta %</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      (stageDiffRows ? '<h3 style="margin:18px 0 8px;font-size:0.95rem">Decomposição por Etapa em <code>' + esc(curHeavy.id) + '</code></h3><div class="table-wrap"><table><thead><tr><th>Etapa</th><th class="num">Antes (Mediana)</th><th class="num">Atual (Mediana)</th><th class="num">Atual (p95)</th><th class="num">Delta %</th></tr></thead><tbody>' + stageDiffRows + '</tbody></table></div>' : '') +
      (bottleneckRows ? '<h3 style="margin:18px 0 8px;font-size:0.95rem">Gargalos Isolados (Experimento B)</h3><div class="table-wrap"><table><thead><tr><th>Gargalo</th><th class="num">Antes (Mediana)</th><th class="num">Atual (Mediana)</th><th class="num">Atual (p95)</th><th class="num">Delta %</th></tr></thead><tbody>' + bottleneckRows + '</tbody></table></div>' : '') +
      '</div>';
  }

  function render() {
    document.getElementById('mode-offline').classList.toggle('active', activeMode === 'offline');
    document.getElementById('mode-live').classList.toggle('active', activeMode === 'live');
    const list = allRunsForMode(activeMode);
    const sel = document.getElementById('run-select');
    const root = document.getElementById('root-content');

    if (!list.length) {
      sel.innerHTML = '<option>Sem execuções</option>';
      sel.disabled = true;
      const hint = activeMode === 'live'
        ? 'Nenhuma medição <strong>live</strong> foi gravada ainda neste repositório. Para gerar dados live após autenticar com <code>autocalc login</code>, execute <code>bun run bench -- --live &amp;&amp; bun run bench:report</code>.'
        : 'Nenhuma medição offline encontrada em <code>bench/baseline.json</code> ou <code>bench/results/*.json</code>. Execute <code>bun run bench -- --baseline &amp;&amp; bun run bench:report</code>.';
      root.innerHTML = '<div class="card span-12"><div class="empty-state">' + hint + '</div></div>';
      return;
    }

    sel.disabled = false;
    if (selectedRunIdx < 0 || selectedRunIdx >= list.length) selectedRunIdx = list.length - 1;
    sel.innerHTML = list.map((item, idx) => {
      const m = item.run.metadata || {};
      return '<option value="' + idx + '"' + (idx === selectedRunIdx ? ' selected' : '') + '>' +
        esc(item.run.timestamp + ' — ' + (m.commit || '?') + ' (' + item.source + ')') + '</option>';
    }).join('');

    const current = list[selectedRunIdx];
    const r = current.run;
    root.innerHTML = '<div class="grid">' +
      renderMeta(r, current.source) +
      renderScalingLine(r.scenarios) +
      renderStackedStages(r.scenarios) +
      renderBottlenecks(r.bottlenecks) +
      renderConcurrency(r.concurrency) +
      renderCommitComparison(list, r) +
      '</div>';
    attachTooltips(root);
  }

  document.getElementById('mode-offline').addEventListener('click', () => { activeMode = 'offline'; selectedRunIdx = -1; render(); });
  document.getElementById('mode-live').addEventListener('click', () => { activeMode = 'live'; selectedRunIdx = -1; render(); });
  document.getElementById('run-select').addEventListener('change', (ev) => { selectedRunIdx = Number(ev.target.value); render(); });

  render();
})();
  </script>
</body>
</html>
`;
}

async function main() {
  await mkdir(BENCH_DIR, { recursive: true });
  const loaded = await loadRuns();
  const html = buildHtml(loaded);
  await writeFile(DASHBOARD_PATH, html, "utf8");
  const count = (loaded.baseline ? 1 : 0) + (loaded.baselineLive ? 1 : 0) + loaded.runs.length;
  console.error(`[bench:report] Dashboard gerado em ${DASHBOARD_PATH} (fontes lidas: ${count}).`);
}

await main();
