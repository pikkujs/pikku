/**
 * Turns the probe results into a single self-contained HTML report.
 *   node scripts/output-probe/render-report.mjs [outFile]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RESULTS = process.env.PIKKU_REPORT_DIR ?? '.pikku-cli-report'
const OUTFILE = process.argv[2] ?? `${RESULTS}/report.html`
const ndjson = (f) => (existsSync(join(RESULTS, f)) ? readFileSync(join(RESULTS, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

const outputs = ndjson('outputs.ndjson')
const timings = ndjson('timings.ndjson')
const summary = JSON.parse(readFileSync(join(RESULTS, 'summary.json'), 'utf8'))
const interactive = existsSync(join(RESULTS, 'interactive.json')) ? JSON.parse(readFileSync(join(RESULTS, 'interactive.json'), 'utf8')) : null

const msOf = new Map(timings.map((t) => [`${t.tier}|${t.command}|${t.case}`, t.ms]))
for (const o of outputs) o.ms = msOf.get(`${o.tier}|${o.command}|${o.case}`) ?? null

/* ---------------- lint ---------------- */
const strip = (s) => s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
const lines = (s) => strip(s).split('\n')
const findings = []
const add = (severity, rule, what, where, detail) => findings.push({ severity, rule, what, where, detail })

const untypedSchema = new Map()
const noRenderer = new Set()


for (const o of outputs) {
  const where = `${o.command} · ${o.case}`
  if (o.tier === 'help') {
    const collided = lines(o.output).filter((l) => /^\s+(-\w, )?--[a-z0-9-]+[A-Z]/.test(l))
    if (collided.length) add('error', 'help.flag-collision', 'Flag name runs into its own description — the help column has no space left for long flags', where, collided[0].trim())
    const wide = lines(o.output).filter((l) => l.length > 100)
    if (wide.length) add('warn', 'help.line-overflow', 'Help lines run past 100 columns, so they wrap mid-word on a standard terminal', where, `${wide.length} lines here, longest ${Math.max(...wide.map((l) => l.length))} columns`)
  }
  if (o.tier === 'render') {
    if (o.synthesisHoles?.length) {
      const e = untypedSchema.get(o.command) ?? new Set()
      o.synthesisHoles.forEach((h) => e.add(h))
      untypedSchema.set(o.command, e)
    } else if (o.threw) {
      add('error', 'render.contract-mismatch', 'Renderer reads a field the command\'s own output type does not have — it throws on success', where, o.threw)
    }
    if (!o.hasRenderer) noRenderer.add(o.command)
    if (o.case === 'extremes' && !o.threw) {
      const over = lines(o.output).filter((l) => l.length > 160)
      if (over.length) add('warn', 'render.no-truncation', 'A long field prints whole — nothing truncates or wraps it', where, `${Math.max(...over.map((l) => l.length))} columns on one line`)
    }
  }
  if (o.tier === 'parse' && o.case === 'unknown-flag' && o.presentedAs === 'none')
    add('info', 'parse.silent-ignore', 'A misspelled flag is dropped with a stderr warning and exit 0 — the command runs on without it', where, strip(o.output).trim())
}

for (const [command, fields] of untypedSchema)
  add('warn', 'schema.untyped-output', 'Output schema declares fields with no type at all, so --json consumers and any schema-driven tooling get nothing to go on', command, `${[...fields].join(', ')}: {}`)
for (const command of noRenderer)
  add('warn', 'render.no-renderer', 'Command returns a payload but has no renderer, so the program default drops it — only --json shows the result', command, null)

// one row per rule+message, with the commands rolled up
const rolled = [...findings.reduce((m, f) => {
  const k = f.rule
  const e = m.get(k) ?? { ...f, count: 0, where: [], detail: f.detail }
  e.count++; if (e.where.length < 6) e.where.push(f.where)
  return m.set(k, e), m
}, new Map()).values()]

if (summary.baselines?.importGraph)
  rolled.unshift({ severity: 'error', rule: 'startup.eager-imports', count: summary.commands.total,
    what: `--help costs ${Math.round(summary.baselines.helpEmptyDir)}ms, of which the node runtime itself is ${summary.baselines.runtimeBoot}ms — the rest is loading all ${summary.commands.total} commands' modules before printing a help screen`,
    where: [`measured in a directory with no pikku project: exit ${summary.baselines.helpEmptyDirExitCode}, so no config is read and no service is built`],
    detail: 'ts-json-schema-generator alone imports in ~330ms and reaches this path from a top-level import in packages/inspector/src/utils/schema-generator.ts:11' })

if (interactive) {
  const prompt = interactive.events[0]?.prompt ?? ''
  if (prompt && !/\x1B\[/.test(prompt.replace(/\x1B\[[0-9]*[GJK]/g, '')))
    rolled.push({ severity: 'warn', rule: 'prompt.unstyled', count: 1,
      what: 'The confirmation prompt is written straight to stdout — no logger, no colour, no styling the rest of the CLI uses',
      where: ['fabric deploy apply'], detail: 'packages/cli/src/fabric/lib/prompt.ts:31' })
}
const rank = { error: 0, warn: 1, info: 2 }
rolled.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count)

/* ---------------- payload ---------------- */
const byCommand = [...outputs.reduce((m, o) => (m.set(o.command, [...(m.get(o.command) ?? []), o]), m), new Map())]
  .map(([command, caps]) => ({ command, caps: caps.map((c) => ({ tier: c.tier, case: c.case, output: c.output, ms: c.ms, bytes: c.bytes, exitCode: c.exitCode ?? null, observed: !!c.observed, renderer: c.renderer ?? null, payload: c.payload ?? null })) }))
  .sort((a, b) => a.command.localeCompare(b.command))

const data = { summary, findings: rolled, commands: byCommand, interactive }
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const html = `<title>CLI Output Probe</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
:root{
  --ground:#eaeeee; --surface:#fff; --sunk:#f3f6f6;
  --ink:#0f1719; --muted:#5c6d70; --faint:#8b9a9d; --line:#d3dcdc;
  --accent:#0b6e7f; --accent-soft:#d7ecef;
  --error:#a8331f; --warn:#8a6000; --info:#4a5a8a; --ok:#2c7a45;
  --term-bg:#11191c; --term-ink:#c9d6d8; --term-line:#223034;
  --r:6px;
}
:root:not([data-theme="light"]){@media (prefers-color-scheme:dark){
  --ground:#0b1113; --surface:#121b1e; --sunk:#0e1618;
  --ink:#dde7e8; --muted:#93a4a7; --faint:#6b7c7f; --line:#222f32;
  --accent:#4fb8c9; --accent-soft:#16333a;
  --error:#e08370; --warn:#d3a441; --info:#94a6d6; --ok:#6cc389;
}}
:root[data-theme="dark"]{
  --ground:#0b1113; --surface:#121b1e; --sunk:#0e1618;
  --ink:#dde7e8; --muted:#93a4a7; --faint:#6b7c7f; --line:#222f32;
  --accent:#4fb8c9; --accent-soft:#16333a;
  --error:#e08370; --warn:#d3a441; --info:#94a6d6; --ok:#6cc389;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding-block:36px 72px;padding-left:20px;padding-right:20px}
h1{font-size:clamp(26px,4vw,36px);line-height:1.1;margin:0;font-weight:600;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:13px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);
  margin:0;padding-bottom:10px;border-bottom:1px solid var(--line)}
.sub{color:var(--muted);margin:10px 0 0;max-width:64ch}
mono,code,.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
section{margin-top:44px;display:flex;flex-direction:column;gap:18px}

/* header stats — a run manifest, not big-number tiles */
.stats{display:flex;flex-wrap:wrap;gap:0;margin-top:26px;border:1px solid var(--line);border-radius:var(--r);
  background:var(--surface);overflow:hidden}
.stat{flex:1 1 150px;padding:13px 16px;border-right:1px solid var(--line)}
.stat:last-child{border-right:0}
.stat b{display:block;font-family:"IBM Plex Mono",monospace;font-size:19px;font-weight:500;
  font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.stat span{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-top:3px}

/* findings — severity stripe, no card chrome */
.finding{display:grid;grid-template-columns:auto 1fr;gap:0 14px;padding:14px 16px 14px 13px;
  background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--sev);border-radius:var(--r)}
.finding.error{--sev:var(--error)} .finding.warn{--sev:var(--warn)} .finding.info{--sev:var(--info)}
.fcount{font-family:"IBM Plex Mono",monospace;font-size:12px;font-variant-numeric:tabular-nums;color:var(--sev);
  font-weight:600;padding-top:2px;white-space:nowrap}
.fwhat{font-weight:500}
.frule{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--faint);margin-top:3px}
.fdetail{grid-column:2;margin-top:9px;font-family:"IBM Plex Mono",monospace;font-size:12px;
  background:var(--sunk);border-radius:4px;padding:8px 10px;color:var(--muted);overflow-x:auto;white-space:pre}
.fwhere{grid-column:2;margin-top:8px;font-size:12px;color:var(--faint);font-family:"IBM Plex Mono",monospace}

/* controls */
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip{font:500 12.5px/1 "IBM Plex Sans",sans-serif;padding:7px 11px;border-radius:999px;cursor:pointer;
  border:1px solid var(--line);background:var(--surface);color:var(--muted)}
.chip[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.chip:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[type=search]{flex:1 1 190px;min-width:0;padding:7px 11px;border-radius:var(--r);border:1px solid var(--line);
  background:var(--surface);color:var(--ink);font:400 13px/1.4 "IBM Plex Mono",monospace}

/* command groups */
.cmd{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);overflow:hidden}
.cmd>summary{cursor:pointer;padding:11px 15px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  font-family:"IBM Plex Mono",monospace;font-size:13.5px;font-weight:500;list-style:none}
.cmd>summary::-webkit-details-marker{display:none}
.cmd>summary::before{content:"▸";color:var(--faint);font-size:11px;transition:transform .15s}
.cmd[open]>summary::before{transform:rotate(90deg)}
.cmd>summary:hover{background:var(--sunk)}
.tally{margin-left:auto;display:flex;gap:6px;font-family:"IBM Plex Sans",sans-serif;font-size:11px;color:var(--faint)}
.tally span{padding:2px 7px;border-radius:999px;background:var(--sunk);letter-spacing:.03em}
.caps{padding:0 15px 15px;display:flex;flex-direction:column;gap:14px}

/* capture blocks: the terminal keeps its own ground in both themes, because
   ANSI colours were authored against a terminal and mean nothing re-mapped */
.cap-head{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;font-size:11.5px;color:var(--faint);
  font-family:"IBM Plex Mono",monospace;margin-bottom:6px}
.tier{padding:2px 7px;border-radius:3px;background:var(--accent-soft);color:var(--accent);font-weight:600;
  letter-spacing:.04em;text-transform:uppercase;font-size:10px}
.case{color:var(--ink);font-weight:500}
.cap-head .push{margin-left:auto;font-variant-numeric:tabular-nums}
.obs{color:var(--ok)} .syn{color:var(--warn)}
pre.term{margin:0;background:var(--term-bg);color:var(--term-ink);border:1px solid var(--term-line);
  border-radius:var(--r);padding:12px 14px;overflow-x:auto;
  font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px;line-height:1.55;white-space:pre;tab-size:4}
pre.term.empty{color:#5c6f73;font-style:italic}
.payload{margin-top:6px}
.payload summary{cursor:pointer;font-size:11.5px;color:var(--faint);font-family:"IBM Plex Mono",monospace}
.payload pre{margin:6px 0 0;background:var(--sunk);border-radius:4px;padding:9px 11px;overflow-x:auto;
  font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted);white-space:pre-wrap}
footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);color:var(--faint);font-size:12.5px}
.none{color:var(--muted);font-style:italic}
@media (max-width:560px){.stat{flex-basis:50%;border-bottom:1px solid var(--line)}}
</style>

<div class="wrap">
  <header>
    <h1>CLI Output Probe</h1>
    <p class="sub">Every screen <code class="mono">pikku</code> can print, captured without running a single command —
      help and parse failures from the parser itself, renderer states from synthesized payloads, prompts under a forced TTY.</p>
    <div class="stats" id="stats"></div>
  </header>

  <section>
    <h2>What the captures show</h2>
    <div id="findings" style="display:flex;flex-direction:column;gap:10px"></div>
  </section>

  <section id="interactive-section">
    <h2>Interactive capture</h2>
    <div id="interactive"></div>
  </section>

  <section>
    <h2>Captures</h2>
    <div class="controls">
      <button class="chip" data-tier="all" aria-pressed="true">All</button>
      <button class="chip" data-tier="help" aria-pressed="false">Help</button>
      <button class="chip" data-tier="parse" aria-pressed="false">Parse</button>
      <button class="chip" data-tier="render" aria-pressed="false">Render</button>
      <button class="chip" data-tier="spawn" aria-pressed="false">Spawn</button>
      <input type="search" id="q" placeholder="filter commands…" aria-label="Filter commands">
    </div>
    <div id="cmds" style="display:flex;flex-direction:column;gap:9px"></div>
  </section>

  <footer id="foot"></footer>
</div>

<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent)

/* ANSI SGR → spans. Non-SGR CSI (cursor moves readline emits) is dropped. */
const C16 = ['#11191c','#cc5c4c','#5aa469','#c2a03c','#5b8fd6','#b177c4','#4fa8b8','#c9d6d8']
const CB  = ['#5a6b6e','#ef8272','#84ce94','#e3c46b','#8db4ee','#d3a2e2','#83cfdd','#f2f7f7']
function ansi(raw){
  let out='', open=0, st={}
  const push=(t)=>{ if(!t) return
    const s=[]
    if(st.fg) s.push('color:'+st.fg); if(st.bg) s.push('background:'+st.bg)
    if(st.b) s.push('font-weight:600'); if(st.d) s.push('opacity:.65')
    if(st.i) s.push('font-style:italic'); if(st.u) s.push('text-decoration:underline')
    const e=t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
    if(!s.length){out+=e;return}
    out+='<span style="'+s.join(';')+'">'+e+'</span>'; open++
  }
  const re=/\\x1B\\[([0-?]*)([ -/]*)([@-~])/g
  let last=0,m
  while((m=re.exec(raw))){
    push(raw.slice(last,m.index)); last=re.lastIndex
    if(m[3]!=='m') continue
    const codes=(m[1]||'0').split(';').map(Number)
    for(let i=0;i<codes.length;i++){
      const c=codes[i]
      if(c===0) st={}
      else if(c===1) st.b=1; else if(c===2) st.d=1; else if(c===3) st.i=1; else if(c===4) st.u=1
      else if(c===22){st.b=0;st.d=0} else if(c===23) st.i=0; else if(c===24) st.u=0
      else if(c>=30&&c<=37) st.fg=C16[c-30]
      else if(c>=90&&c<=97) st.fg=CB[c-90]
      else if(c>=40&&c<=47) st.bg=C16[c-40]
      else if(c===39) st.fg=null; else if(c===49) st.bg=null
      else if(c===38||c===48){
        const key=c===38?'fg':'bg'
        if(codes[i+1]===2){ st[key]='rgb('+codes[i+2]+','+codes[i+3]+','+codes[i+4]+')'; i+=4 }
        else if(codes[i+1]===5){ const n=codes[i+2]; st[key]=n<8?C16[n]:n<16?CB[n-8]:'#9aa9ac'; i+=2 }
      }
    }
  }
  push(raw.slice(last))
  return out
}
const esc=(s)=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
const ms=(v)=>v==null?'':(v<1?v.toFixed(3):v.toFixed(1))+'ms'

/* stats */
const s=D.summary, t=s.tiers
document.getElementById('stats').innerHTML=[
  [s.commands.total,'commands'],
  [Object.values(t).reduce((a,x)=>a+x.captures,0),'captures'],
  [s.commands.withOutputSchema,'with output schema'],
  [(t.help.totalMs+t.parse.totalMs+t.render.totalMs).toFixed(1)+'ms','to capture in-process'],
  [s.baselines&&s.baselines.helpEmptyDir?Math.round(s.baselines.helpEmptyDir)+'ms':'—','--help, no project'],
].map(([v,l])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join('')

/* findings */
document.getElementById('findings').innerHTML=D.findings.map(f=>
  '<div class="finding '+f.severity+'">'+
  '<div class="fcount">'+f.count+'×</div>'+
  '<div><div class="fwhat">'+esc(f.what)+'</div><div class="frule">'+esc(f.rule)+'</div></div>'+
  (f.detail?'<div class="fdetail">'+esc(f.detail)+'</div>':'')+
  '<div class="fwhere">'+f.where.map(esc).join(' · ')+(f.count>f.where.length?' · +'+(f.count-f.where.length)+' more':'')+'</div>'+
  '</div>').join('')

/* interactive */
const I=D.interactive
document.getElementById('interactive').innerHTML = I
  ? '<div class="cap-head"><span class="tier">prompt</span><span class="case">fabric deploy apply</span>'+
    '<span class="push obs">observed · exit '+I.exitCode+' · '+I.ms+'ms</span></div>'+
    '<pre class="term">'+ansi(I.transcript)+'</pre>'+
    '<div class="fwhere" style="margin-top:8px">answered “'+esc(I.events[0]?I.events[0].answer:'')+'” at '+(I.events[0]?I.events[0].at:'?')+'ms — the only tier that needs the command to actually run</div>'
  : '<p class="none">No interactive capture in this run.</p>'

/* captures */
const host=document.getElementById('cmds')
let tier='all', q=''
function render(){
  const rows=D.commands
    .map(c=>({command:c.command,caps:c.caps.filter(x=>tier==='all'||x.tier===tier)}))
    .filter(c=>c.caps.length&&c.command.includes(q))
  host.innerHTML = rows.length ? rows.map((c,i)=>{
    const tally=[...c.caps.reduce((m,x)=>m.set(x.tier,(m.get(x.tier)||0)+1),new Map())]
      .map(([k,v])=>'<span>'+k+' '+v+'</span>').join('')
    return '<details class="cmd"'+(i<2?' open':'')+'><summary>pikku '+esc(c.command)+
      '<span class="tally">'+tally+'</span></summary><div class="caps">'+
      c.caps.map(x=>{
        const body=x.output&&x.output.trim() ? '<pre class="term">'+ansi(x.output)+'</pre>'
                                            : '<pre class="term empty">(printed nothing)</pre>'
        return '<div><div class="cap-head"><span class="tier">'+x.tier+'</span><span class="case">'+esc(x.case)+'</span>'+
          (x.renderer?'<span>'+esc(x.renderer)+'</span>':'')+
          '<span class="push '+(x.observed?'obs':'syn')+'">'+(x.observed?'observed':'synthesized')+
          (x.exitCode!=null?' · exit '+x.exitCode:'')+' · '+x.bytes+'B · '+ms(x.ms)+'</span></div>'+body+
          (x.payload?'<details class="payload"><summary>payload that produced this</summary><pre>'+
            esc(JSON.stringify(x.payload,null,2))+'</pre></details>':'')+'</div>'
      }).join('')+'</div></details>'
  }).join('') : '<p class="none">Nothing matches that filter.</p>'
}
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(o=>o.setAttribute('aria-pressed',String(o===b)))
  tier=b.dataset.tier; render()
}))
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.trim();render()})
render()

const b=s.baselines
document.getElementById('foot').textContent =
  'Generated '+new Date(s.generatedAt).toISOString().replace('T',' ').slice(0,16)+
  ' · outDir '+s.outDir+' · '+s.reps+' reps'+
  (b&&b.runtimeBoot?' · runtime boot '+b.runtimeBoot+'ms, import graph '+b.importGraph+'ms':'')
</script>`

writeFileSync(OUTFILE, html)
console.log(`${OUTFILE}  ${(html.length / 1024).toFixed(0)}KB  ·  ${outputs.length} captures · ${rolled.length} findings`)
