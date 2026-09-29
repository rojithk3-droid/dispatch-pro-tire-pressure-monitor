
/* ======================================================================
   DETAIL VIEW (Figma: DTL88 / V305, Air Pressure ⇄ Temperature)
   Stage (3D) · roster · KPIs · area chart · route map, all linked: a tire
   hovered or selected anywhere lights up everywhere.
   ====================================================================== */
let assetPicker = null, tireSelect = null;
const ARC = { good:'#10B981', warn:'#F59E0B', crit:'#EF4444', unknown:'#9CA3AF' };

function enterDetail(){
  const a = byId(S.assetId);
  S.sel = new Set(); S.hover = null; S.viewPreset = 'top'; S.rosterF = 'all';
  S.mode = 'psi'; S.vis = { psi:true, temp:false, speed:false };
  $$('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
  $$('#viewSeg button').forEach(b => b.classList.toggle('active', b.dataset.view === 'top'));
  $$('#rosterSeg button').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
  hideHCard();
  $('#typeBadge').textContent = a.type === 'truck' ? 'Tractor' : '53′ Dry van';
  $('#stageTitle').textContent = `${a.id} · ${a.type === 'truck' ? 'Tractor' : 'Dry van'}`;
  $('#stageSub').textContent = `${a.tires.length} tires · ${a.city}, ${a.st} · ${a.driver}`;

  assetPicker = makeDropdown({
    mount:$('#assetPickerMount'), value:a.id, search:'Search assets, drivers…', minWidth:375,
    options:ASSETS.map(x => ({ value:x.id, label:`${x.id} | ${x.driver} | ${x.addr}`, meta:x.type === 'truck' ? 'Truck' : 'Trailer' })),
    renderValue:v => { const x = byId(v); return `<b>${x.id}</b><span>&nbsp;|&nbsp;${esc(x.driver)}&nbsp;|&nbsp;${esc(x.addr)}</span>`; },
    onChange:v => go('tmps/' + v)
  });
  $('#assetPickerMount').classList.add('asset-picker');

  buildTireSelect(a); buildPills(a);
  lastKpi = ''; lastRosterSig = '';
  if(S.pendingTire && S.pendingTire <= a.tires.length) S.sel = new Set([S.pendingTire]);
  S.pendingTire = null;
  if(S.sel.size) tireSelect.set(Array.from(S.sel).map(String));
  updateStatusPanel(); renderLegend(); syncRangeUI(); drawChart(true); updateRouteMeta(a);
  requestAnimationFrame(() => {
    sceneShow(a); ensureMap(a);
    if(S.sel.size === 1) focusTire(Array.from(S.sel)[0]);
  });
}
$('#backBtn').addEventListener('click', () => go('tmps'));
$('#gearBtn').addEventListener('click', () => go('tmps/' + S.assetId + '/settings'));

$('#modeSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  S.mode = b.dataset.mode; S.vis.temp = S.mode === 'temp';
  $$('#modeSeg button').forEach(n => n.classList.toggle('active', n === b));
  lastRosterSig = ''; updateStatusPanel(); renderLegend(); drawChart(true);
});

/* one function refreshes every live readout on the page */
function updateStatusPanel(){
  updateKpis(); updatePills(); renderRoster();
  if(window.updateTireViz) updateTireViz();
}

/* ---------- KPI strip ---------- */
let lastKpi = '';
function updateKpis(){
  const a = byId(S.assetId), st = assetState(a), live = a.tires.filter(t => !t.off), off = !live.length;
  const inRange = live.filter(t => tireState(t) === 'good').length;
  const avgP = off ? null : live.reduce((s, t) => s + t.psi, 0) / live.length;
  const hot = off ? null : live.reduce((m, t) => t.temp > m.temp ? t : m, live[0]);
  const sp = a.moving ? Math.round(a.speedNow ?? a.speed) : 0;
  const tone = { good:'success', warn:'warning', crit:'danger', unknown:'' }[st];
  const hotL = hot ? LAYOUT[a.type][hot.n - 1] : null, hotSt = hot ? tireState(hot) : 'unknown';
  const tile = (ico, tn, label, val, sub, cls = '') => `<div class="kpi"><span class="kpi-top">${label}<span class="kpi-ico"${tn ? ` data-tone="${tn}"` : ''}><i data-lucide="${ico}"></i></span></span><span class="kpi-val ${cls}">${val}</span><span class="kpi-sub">${sub}</span></div>`;
  const html =
    tile('shield-check', tone, 'Tire condition', badgeFor(st), off ? 'Sensors are not reporting' : `<b>${inRange}</b> of ${live.length} tires in range`, 'center') +
    tile('gauge', 'info', 'Average pressure', off ? '—' : `${Math.round(avgP)}<small>PSI</small>`, `Normal range <b>${CFG.psiMin}–${CFG.psiMax} PSI</b>`) +
    tile('thermometer', { good:'success', warn:'warning', crit:'danger', unknown:'' }[hotSt], 'Hottest tire', off ? '—' : `${Math.round(hot.temp)}<small>°F</small>`, off ? 'No signal' : `Tire <b>${hot.n}</b> · ${esc(hotL.axle)} ${esc(hotL.pos.toLowerCase())}`) +
    tile('navigation', a.moving ? 'info' : '', 'Speed', `${sp}<small>MPH</small>`, a.moving ? 'In transit' : 'Parked') +
    tile('clock', '', 'Last check', off ? 'No signal' : (a.moving ? 'Live' : agoText(a)), `${esc(a.city)}, ${a.st}`);
  if(html !== lastKpi){ lastKpi = html; $('#detailKpis').innerHTML = html; icons(); }
}

/* ---------- pressure bubbles (gauge ring around the value), projected over each tire ---------- */
let pillEls = [];
const SPAN = { psi:[60, 130], temp:[60, 240] };
function fracOf(t){
  const [lo, hi] = SPAN[S.mode], v = S.mode === 'psi' ? t.psi : t.temp;
  return clamp((v - lo) / (hi - lo), 0, 1);
}
function buildPills(a){
  const layer = $('#tagLayer'); layer.innerHTML = ''; pillEls = [];
  const lines = $('#tagLines'); lines.innerHTML = '';
  LAYOUT[a.type].forEach(l => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'tire-tag'; el.dataset.n = l.n;
    el.setAttribute('aria-label', `Tire ${l.n}, ${l.axle}, ${l.pos}`);
    el.innerHTML = `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="rt" cx="50" cy="50" r="45"/><circle class="rv" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="0 100"/></svg><span class="tt-val"></span><span class="tt-n">${l.n}</span>`;
    el.addEventListener('click', ev => pickTire(l.n, ev.shiftKey || ev.ctrlKey || ev.metaKey));
    el.addEventListener('pointerenter', () => { setHover(l.n); const r = el.getBoundingClientRect(); showHCard(tireCardHTML(byId(S.assetId), l.n), r.right, r.top); icons(); });
    el.addEventListener('pointerleave', () => setHover(null));
    el.addEventListener('focus', () => setHover(l.n)); el.addEventListener('blur', () => setHover(null));
    layer.appendChild(el); pillEls.push(el);
    if(!(l.dual && l.outer)){
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.dataset.n = l.n; lines.appendChild(ln);
      const dt = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dt.setAttribute('r', 2.5); dt.dataset.n = l.n; lines.appendChild(dt);
    }
  });
  updatePills();
}
function updatePills(){
  const a = byId(S.assetId);
  pillEls.forEach(el => {
    const n = +el.dataset.n, t = a.tires[n - 1], st = tireState(t), off = t.off || t.psi == null;
    el.dataset.s = st;
    el.classList.toggle('sel', S.sel.has(n));
    el.classList.toggle('dim', S.sel.size > 0 && !S.sel.has(n));
    const html = off ? '<b>—</b><small>N/A</small>' : S.mode === 'psi' ? `<b>${Math.round(t.psi)}</b><small>PSI</small>` : `<b>${Math.round(t.temp)}°</b><small>°F</small>`;
    const v = el.querySelector('.tt-val'); if(v.innerHTML !== html) v.innerHTML = html;
    el.querySelector('.rv').setAttribute('stroke-dasharray', `${off ? 0 : (fracOf(t) * 100).toFixed(1)} 100`);
  });
}

/* ---------- tire roster ---------- */
let lastRosterSig = '';
function zonesFor(){
  if(S.mode === 'psi'){
    const [lo, hi] = SPAN.psi, p = v => clamp((v - lo) / (hi - lo) * 100, 0, 100);
    const cuts = [lo, CFG.psiMin - 10, CFG.psiMin, CFG.psiMax, CFG.psiMax + 15, hi].map(p);
    return [['crit', cuts[0], cuts[1]], ['warn', cuts[1], cuts[2]], ['ok', cuts[2], cuts[3]], ['warn', cuts[3], cuts[4]], ['crit', cuts[4], cuts[5]]];
  }
  const [lo, hi] = SPAN.temp, p = v => clamp((v - lo) / (hi - lo) * 100, 0, 100);
  const cuts = [lo, tempWarn(), tempCrit(), hi].map(p);
  return [['ok', cuts[0], cuts[1]], ['warn', cuts[1], cuts[2]], ['crit', cuts[2], cuts[3]]];
}
function rowValues(t){
  const off = t.off || t.psi == null;
  return S.mode === 'psi'
    ? { b:off ? '—' : Math.round(t.psi), u:'PSI', s:off ? 'No signal' : `${Math.round(t.temp)}°F` }
    : { b:off ? '—' : Math.round(t.temp), u:'°F', s:off ? 'No signal' : `${Math.round(t.psi)} PSI` };
}
function renderRoster(){
  const a = byId(S.assetId), lay = LAYOUT[a.type], list = $('#rosterList');
  const sts = a.tires.map(tireState);
  const attn = sts.filter(s => s === 'warn' || s === 'crit').length, ok = sts.filter(s => s === 'good').length;
  $('#rosterCount').textContent = a.tires.length;
  $('#rosterSub').textContent = sts.every(s => s === 'unknown') ? 'No sensor data from this asset.' : `${ok} in range · ${attn} need${attn === 1 ? 's' : ''} attention`;
  $('#rosterSeg [data-f="attn"]').innerHTML = `Attention${attn ? ` <span class="badge" data-variant="${sts.includes('crit') ? 'danger' : 'warning'}" style="margin-left:2.5px">${attn}</span>` : ''}`;
  const sig = S.rosterF + S.mode + sts.join() + CFG.psiMin + CFG.psiMax + tempWarn();
  const rows = lay.filter((l, i) => S.rosterF === 'all' || sts[i] === 'warn' || sts[i] === 'crit');
  if(sig !== lastRosterSig){
    lastRosterSig = sig;
    const zones = zonesFor();
    list.innerHTML = rows.length ? rows.map(l => {
      const t = a.tires[l.n - 1], st = tireState(t), v = rowValues(t);
      return `<button type="button" class="tr-row${S.sel.has(l.n) ? ' sel' : ''}${S.hover === l.n ? ' hov' : ''}" data-n="${l.n}">
        <span class="tr-chip" data-s="${st}">${l.n}</span>
        <span><span class="tr-name">Tire ${l.n}</span><span class="tr-meta">${esc(l.axle)} · ${esc(l.pos)}</span></span>
        <span class="rbar" style="--sc:${ARC[st]}"><span class="trk">${zones.map(z => `<span class="z-${z[0]}" style="left:${z[1]}%;width:${z[2] - z[1]}%"></span>`).join('')}</span><i class="mk" style="left:${(fracOf(t) * 100).toFixed(1)}%${st === 'unknown' ? ';display:none' : ''}"></i></span>
        <span class="tr-val"><b>${v.b}<small>${v.u}</small></b><span>${v.s}</span></span></button>`;
    }).join('') : `<div class="roster-empty"><span class="empty-icon"><i data-lucide="circle-check"></i></span><p><b style="color:var(--text-heading)">Every tire is within range.</b><br>Nothing needs attention right now.</p></div>`;
    icons();
  } else {                                        // same rows: patch values in place so hover/click survive a tick
    $$('.tr-row', list).forEach(r => {
      const t = a.tires[+r.dataset.n - 1], v = rowValues(t);
      r.querySelector('.tr-val').innerHTML = `<b>${v.b}<small>${v.u}</small></b><span>${v.s}</span>`;
      r.querySelector('.mk').style.left = (fracOf(t) * 100).toFixed(1) + '%';
    });
  }
}
$('#rosterSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  S.rosterF = b.dataset.f; $$('#rosterSeg button').forEach(n => n.classList.toggle('active', n === b));
  lastRosterSig = ''; renderRoster();
});
const rosterList = $('#rosterList');
rosterList.addEventListener('pointerover', e => {
  const r = e.target.closest('.tr-row'); if(!r) return;
  const n = +r.dataset.n; setHover(n); const b = r.getBoundingClientRect();
  showHCard(tireCardHTML(byId(S.assetId), n), b.left - 8 - 0, b.top + 8); icons();
  // keep the card left of the list so it never covers the row itself
  const z = ZOOM(); hcard.style.left = Math.max(8, (b.left - hcard.offsetWidth * z - 12)) / z + 'px';
});
rosterList.addEventListener('pointerout', e => { const r = e.target.closest('.tr-row'); if(r && !r.contains(e.relatedTarget)){ setHover(null); } });
rosterList.addEventListener('click', e => { const r = e.target.closest('.tr-row'); if(r) pickTire(+r.dataset.n, e.shiftKey || e.ctrlKey || e.metaKey); });

/* ---------- hover + selection (3D ⇄ bubbles ⇄ roster ⇄ chart picker) ---------- */
function setHover(n){
  if(S.hover === n) return;
  S.hover = n;
  pillEls.forEach(el => el.classList.toggle('hov', +el.dataset.n === n));
  $$('.tr-row', rosterList).forEach(r => r.classList.toggle('hov', +r.dataset.n === n));
  if(window.sceneHover) sceneHover(n);
  if(n == null) hideHCard();
}
function pickTire(n, additive){
  const next = new Set(S.sel);
  if(additive){ if(next.has(n)) next.delete(n); else next.add(n); }
  else if(next.size === 1 && next.has(n)) next.clear();
  else { next.clear(); next.add(n); }
  setSel(next, !additive);
}
function setSel(set, focus){
  S.sel = set;
  if(tireSelect) tireSelect.set(set.size ? Array.from(set).map(String) : ['all']);
  updatePills(); lastRosterSig = ''; renderRoster();
  const row = set.size === 1 ? $(`.tr-row[data-n="${Array.from(set)[0]}"]`, rosterList) : null;
  if(row) row.scrollIntoView({ block:'nearest' });
  renderLegend(); drawChart(true);
  if(window.updateTireViz) updateTireViz();
  if(focus !== false){ if(set.size === 1) focusTire(Array.from(set)[0]); else if(!set.size) applyView(S.viewPreset, true); }
}

/* the tire hover card — reading, range, status and a 24 h sparkline */
function tireCardHTML(a, n){
  const t = a.tires[n - 1], l = LAYOUT[a.type][n - 1], st = tireState(t), off = t.off || t.psi == null, pm = S.mode === 'psi';
  const now = Date.now(), fn = pm ? tirePsi : tireTemp, color = pm ? cssv('--blue') : '#F97316';
  let spark = '';
  if(!off){
    const N = 24, xs = Array.from({ length:N }, (_, i) => now - 24 * HOUR + i * HOUR), ys = xs.map(x => fn(a, n, x)), cur = pm ? t.psi : t.temp;
    ys[N - 1] = cur;
    let lo = Math.min(...ys), hi = Math.max(...ys); if(pm){ lo = Math.min(lo, CFG.psiMin); hi = Math.max(hi, CFG.psiMax); } const pad = (hi - lo) * .12 || 1; lo -= pad; hi += pad;
    const W = 200, H = 48, sx = i => i / (N - 1) * W, sy = v => H - (v - lo) / (hi - lo) * (H - 6) - 3;
    const pts = ys.map((v, i) => [sx(i), sy(v)]), gid = 'sg' + (++spCounter.n), line = smooth(pts);
    spark = `<div class="hc-spark"><div class="hc-spark-cap"><span>Last 24 h</span><span>${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))} ${pm ? 'PSI' : '°F'}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${pm ? `<rect x="0" y="${sy(CFG.psiMax)}" width="${W}" height="${Math.max(1, sy(CFG.psiMin) - sy(CFG.psiMax))}" fill="#10B981" opacity=".09"/>` : ''}
      <path d="${line} L${W},${H} L0,${H} Z" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${W}" cy="${pts[N - 1][1]}" r="3.2" fill="var(--surface)" stroke="${color}" stroke-width="2"/></svg></div>`;
  }
  return `<div class="hc-head"><div><div class="hc-t">Tire ${n} · ${esc(l.axle)}</div><div class="hc-s">${esc(l.pos)} · ${l.dual ? 'dual' : 'single'}</div></div>${badgeFor(st)}</div>
    <div class="hc-big">${off ? '—' : Math.round(pm ? t.psi : t.temp)}<small>${pm ? 'PSI' : '°F'}</small></div>
    <div class="hc-rows">
      <div class="hc-row"><i style="background:${cssv('--blue')}"></i><span>Pressure</span><b>${off ? '—' : Math.round(t.psi) + ' PSI'}</b></div>
      <div class="hc-row"><i style="background:#F97316"></i><span>Temperature</span><b>${off ? '—' : Math.round(t.temp) + '°F'}</b></div>
      <div class="hc-row"><i style="background:#10B981"></i><span>Normal range</span><b>${CFG.psiMin}–${CFG.psiMax} PSI</b></div>
    </div>${spark}
    <div class="hc-hint"><i data-lucide="mouse-pointer-click"></i> ${S.sel.has(n) ? 'Selected — click again to clear' : 'Click to focus this tire'}</div>`;
}

/* ---------- tire multi-select in the Historic Data card ---------- */
function buildTireSelect(a){
  const lay = LAYOUT[a.type];
  const opts = [{ value:'all', label:'All tires (average)' }, { separator:true }].concat(
    lay.map(l => ({ value:String(l.n), label:`Tire ${l.n}`, meta:l.axle + ' · ' + l.pos })));
  tireSelect = makeDropdown({
    mount:$('#tireSelMount'), multi:true, value:['all'], options:opts, minWidth:250,
    renderValue:set => {
      const ns = Array.from(set).filter(v => v !== 'all').map(Number).sort((x, y) => x - y);
      if(!ns.length) return '<span style="color:var(--text-body)">All tires <span style="color:var(--muted-fg)">(average)</span></span>';
      const chips = ns.slice(0, 3).map(n => `<span class="chip"><span class="dot" style="background:${tireColor(n)};width:5px;height:5px"></span>Tire ${n}<span class="x" data-n="${n}"><i data-lucide="x"></i></span></span>`).join('');
      return chips + (ns.length > 3 ? `<span class="chip">+${ns.length - 3}</span>` : '');
    },
    onChange:set => {
      const wasAll = S.sel.size === 0;
      let next = new Set(Array.from(set).filter(v => v !== 'all').map(Number));
      if(set.has('all') && !wasAll) next = new Set();
      setSel(next, false);
    }
  });
  tireSelect.el.addEventListener('click', e => {
    const x = e.target.closest('.chip .x'); if(!x) return;
    e.stopPropagation(); e.preventDefault();
    const next = new Set(S.sel); next.delete(+x.dataset.n); setSel(next, false);
  }, true);
}
/* ======================================================================
   history data — procedural, deterministic per asset/tire/time so the
   chart can be dragged through six weeks without storing anything
   ====================================================================== */
const HOUR = 36e5;
const spCache = new Map();
function speedAt(a, t){
  const key = a.id + t; if(spCache.has(key)) return spCache.get(key);
  const seed = hash32(a.id + 'spd'), d = new Date(t), hr = d.getHours() + d.getMinutes() / 60;
  const dayR = rng(seed ^ Math.floor(t / DAY));
  const start = 5 + dayR() * 2.5, end = 17 + dayR() * 3;
  let drive = clamp(Math.min((hr - start) / .6, (end - hr) / .6), 0, 1);
  if(noise(seed + 7, t / (2.4 * HOUR)) > .78) drive *= .12;                  // rest stops
  const v = Math.max(0, drive * (58 + 9 * noise(seed + 3, t / (1.6 * HOUR))) + drive * 4 * noise(seed + 5, t / (.35 * HOUR)));
  if(spCache.size > 6000) spCache.clear();
  spCache.set(key, v); return v;
}
function heatAt(a, t){                 // lagged, smoothed speed → 0..1
  return clamp((speedAt(a, t) + speedAt(a, t - .5 * HOUR) + speedAt(a, t - HOUR) + speedAt(a, t - 1.5 * HOUR)) / 4 / 52, 0, 1);
}
function tireTemp(a, n, t){
  const tire = a.tires[n - 1], seed = hash32(a.id + 't' + n);
  const amb = 62 + 12 * noise(seed + 1, t / (12 * HOUR));
  return amb + (tire.base.temp - amb) * heatAt(a, t) + 2.2 * noise(seed + 2, t / (.6 * HOUR));
}
function tirePsi(a, n, t){
  const tire = a.tires[n - 1], seed = hash32(a.id + 'p' + n);
  return tire.base.psi + 0.028 * (tireTemp(a, n, t) - tire.base.temp) + 1.4 * noise(seed + 3, t / (9 * HOUR)) + .5 * noise(seed + 4, t / (1.7 * HOUR));
}
const TIRE_PALETTE = ['#0F6FFF','#F97316','#10B981','#8B5CF6','#EC4899','#14B8A6','#EAB308','#EF4444','#64748B','#84CC16'];
const tireColor = n => TIRE_PALETTE[(n - 1) % TIRE_PALETTE.length];
const METRIC = () => ({ psi:cssv('--blue'), temp:'#F97316', speed:cssv('--text-muted') });

function buildSeries(a, xs){
  const live = a.tires.filter(t => !t.off);
  if(!live.length) return null;
  const ns = S.sel.size ? Array.from(S.sel).sort((p, q) => p - q) : null;
  const M = METRIC(), out = [];
  const multi = ns && ns.length > 1;
  if(S.vis.psi){
    if(!ns) out.push({ key:'psi', metric:'psi', label:'PSI', color:M.psi, dash:'', ys:xs.map(t => avg(a, t, tirePsi)) });
    else ns.forEach(n => out.push({ key:'psi' + n, metric:'psi', label:multi ? `T${n} PSI` : 'PSI', color:multi ? tireColor(n) : M.psi, dash:'', ys:xs.map(t => tirePsi(a, n, t)) }));
  }
  if(S.vis.temp){
    if(!ns) out.push({ key:'temp', metric:'temp', label:'Temp', color:M.temp, dash:'', ys:xs.map(t => avg(a, t, tireTemp)) });
    else ns.forEach(n => out.push({ key:'temp' + n, metric:'temp', label:multi ? `T${n} Temp` : 'Temp', color:multi ? tireColor(n) : M.temp, dash:multi ? '2.5 4' : '', ys:xs.map(t => tireTemp(a, n, t)) }));
  }
  if(S.vis.speed) out.push({ key:'speed', metric:'speed', label:'MPH', color:M.speed, dash:'', ys:xs.map(t => speedAt(a, t)) });
  return out;
}
function avg(a, t, fn){ let s = 0, c = 0; a.tires.forEach((x, i) => { if(!x.off){ s += fn(a, i + 1, t); c++; } }); return s / c; }


/* ---------- legend ---------- */
function renderLegend(){
  const M = METRIC();
  const items = [['psi', 'PSI'], ['temp', 'Temperature'], ['speed', 'Speed']];
  $('#chartLegend').innerHTML = items.map(([k, l]) => `<button type="button" class="legend-btn${S.vis[k] ? '' : ' off'}" data-k="${k}" aria-pressed="${S.vis[k]}" style="--lc:${M[k]}"><i></i>${l}</button>`).join('');
}
$('#chartLegend').addEventListener('click', e => {
  const b = e.target.closest('.legend-btn'); if(!b) return;
  const k = b.dataset.k;
  if(S.vis[k] && Object.values(S.vis).filter(Boolean).length === 1) return;     // never an empty chart
  S.vis[k] = !S.vis[k]; renderLegend(); drawChart(true);
});

/* ---------- hero: average over the window vs the window before it ---------- */
function metricAvg(a, metric, t0, t1){
  const ns = S.sel.size ? Array.from(S.sel) : null, N = 36; let s = 0;
  for(let i = 0; i < N; i++){
    const t = t0 + (t1 - t0) * i / (N - 1);
    if(metric === 'speed') s += speedAt(a, t);
    else { const fn = metric === 'psi' ? tirePsi : tireTemp; s += ns ? ns.reduce((z, n) => z + fn(a, n, t), 0) / ns.length : avg(a, t, fn); }
  }
  return s / N;
}
function updateHero(a, series){
  const badge = $('#heroDelta');
  if(!series){ $('#heroVal').textContent = '—'; badge.hidden = true; $('#heroVs').textContent = ''; return; }
  const metric = S.vis.psi ? 'psi' : S.vis.temp ? 'temp' : 'speed', { t0, t1 } = S.range, span = t1 - t0;
  const cur = metricAvg(a, metric, t0, t1), prev = metricAvg(a, metric, t0 - span, t0);
  const unit = { psi:'PSI', temp:'°F', speed:'MPH' }[metric], cap = { psi:'Average pressure', temp:'Average temperature', speed:'Average speed' }[metric];
  const sel = S.sel.size ? ` · ${Array.from(S.sel).sort((x, y) => x - y).map(n => 'Tire ' + n).join(', ')}` : ' · all tires';
  $('#heroCap').textContent = cap + (metric === 'speed' ? '' : sel);
  $('#heroVal').innerHTML = `${cur.toFixed(metric === 'psi' ? 1 : 0)}<small>${unit}</small>`;
  const d = prev ? (cur - prev) / prev * 100 : 0;
  badge.hidden = false; badge.setAttribute('data-variant', Math.abs(d) < 3 ? 'success' : 'warning');
  badge.innerHTML = `<i data-lucide="${d >= 0 ? 'trending-up' : 'trending-down'}"></i>${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
  const days = Math.max(1, Math.round(span / DAY));
  $('#heroVs').textContent = `vs prior ${days} day${days > 1 ? 's' : ''}`;
  icons();
}

/* ---------- chart — the dashboard's area style ---------- */
const chartWrap = $('#chartWrap'), svg = $('#chartSvg'), tip = $('#chartTip');
let CH = null, gradN = 0;
function niceTicks(lo, hi, step){ const t = []; for(let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) t.push(v); return t; }

function drawChart(animate = false){
  const a = byId(S.assetId);
  const W = chartWrap.clientWidth, H = chartWrap.clientHeight;
  if(!W || !H) return;
  const N = 168, { t0, t1 } = S.range, span = t1 - t0;
  const xs = Array.from({ length:N }, (_, i) => t0 + span * i / (N - 1));
  const series = buildSeries(a, xs);
  $('#chartEmpty').hidden = !!series;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  updateHero(a, series);
  if(!series){ svg.innerHTML = ''; CH = null; return; }
  chartWrap.classList.toggle('play', !!animate);

  const pl = 46, pr = S.vis.temp ? 50 : 16, pt = 12, pb = 30, pw = W - pl - pr, ph = H - pt - pb, base = pt + ph;
  const psiVals = series.filter(s => s.metric === 'psi').flatMap(s => s.ys).concat([CFG.psiMin, CFG.psiMax]);
  const tmpVals = series.filter(s => s.metric === 'temp').flatMap(s => s.ys);
  let pLo = Math.floor((Math.min(...psiVals) - 5) / 10) * 10, pHi = Math.ceil((Math.max(...psiVals) + 5) / 10) * 10;
  if(pHi - pLo < 40) pHi = pLo + 40;
  const tLo = tmpVals.length ? Math.floor((Math.min(...tmpVals) - 8) / 20) * 20 : 60, tHi = tmpVals.length ? Math.ceil((Math.max(...tmpVals) + 8) / 20) * 20 : 240;
  const sx = t => pl + (t - t0) / span * pw;
  const dom = { psi:[pLo, pHi], temp:[tLo, tHi], speed:[0, 90] };
  const sy = (m, v) => { const [lo, hi] = dom[m]; return pt + ph - (v - lo) / (hi - lo) * ph; };
  const multi = series.filter(s => s.metric !== 'speed').length > 1;

  let g = '';
  niceTicks(pLo, pHi, (pHi - pLo) > 60 ? 20 : 10).forEach(v => { const y = sy('psi', v); g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="axv" x="${pl - 8}" y="${y + 4}" text-anchor="end">${v}</text>`; });
  if(S.vis.temp) niceTicks(tLo, tHi, 20).forEach((v, i, arr) => { if(arr.length > 6 && i % 2) return; g += `<text class="axv" x="${W - pr + 8}" y="${sy('temp', v) + 4}" text-anchor="start" style="fill:#F97316">${v}°</text>`; });
  g += `<line class="axis" x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}"/>`;
  const shortSpan = span <= 40 * HOUR, nT = 7;
  for(let i = 0; i < nT; i++){
    const t = t0 + span * i / (nT - 1), d = new Date(t);
    const lbl = shortSpan ? `${d.getHours() % 12 || 12}${d.getHours() >= 12 ? 'PM' : 'AM'}` : fmtDateShort(t);
    g += `<text class="ax" x="${clamp(sx(t), pl + 12, W - pr - 12)}" y="${H - 8}" text-anchor="middle">${lbl}</text>`;
  }
  if(S.vis.psi){
    const yMax = sy('psi', CFG.psiMax), yMin = sy('psi', CFG.psiMin);
    g += `<rect class="band" x="${pl}" y="${yMax}" width="${pw}" height="${Math.max(1, yMin - yMax)}"/><line class="setpoint" x1="${pl}" x2="${W - pr}" y1="${yMin}" y2="${yMin}"/>`
      + `<text class="setpoint-tag" x="${W - pr - 6}" y="${yMin - 5}" text-anchor="end">Min ${CFG.psiMin} PSI</text>`;
  }
  /* areas first (behind), then lines, so overlaps stay legible */
  let defs = '', areas = '', lines = '';
  series.forEach(s => {
    const pts = s.ys.map((v, i) => [sx(xs[i]), sy(s.metric, v)]), line = smooth(pts), id = 'ag' + (++gradN);
    if(s.metric !== 'speed'){
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="${multi ? .16 : .3}"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
      areas += `<path class="${animate ? 'anim-area' : ''}" d="${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z" fill="url(#${id})"/>`;
    }
    lines += `<path class="ln${animate ? ' anim-line' : ''}" pathLength="1" d="${line}" stroke="${s.color}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.metric === 'speed' ? ' stroke-width="2" opacity=".75"' : ''}/>`;
  });
  g += `<defs>${defs}</defs>${areas}${lines}`;
  g += `<line class="guide" id="guide" y1="${pt}" y2="${base}"/>` + series.map((s, i) => `<circle class="dotm" data-i="${i}" r="4.4" stroke="${s.color}"/>`).join('');
  g += `<rect id="hit" x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>`;
  svg.innerHTML = g;
  CH = { W, H, pl, pr, pt, pb, pw, ph, xs, series, sx, sy, t0, t1 };
}
new ResizeObserver(() => { if(S.view === 'detail') drawChart(false); }).observe(chartWrap);

/* hover: dashed guide + hollow dots + hover card; drag: pan through time */
let drag = null;
function hideChartHover(){ const gd = $('#guide'); if(gd) gd.setAttribute('class', 'guide'); $$('.dotm', svg).forEach(d => d.classList.remove('on')); tip.classList.remove('on'); }
svg.addEventListener('pointermove', e => {
  if(!CH) return;
  const zoom = ZOOM(), r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / zoom, y = (e.clientY - r.top) / zoom;
  if(drag){
    const dx = (e.clientX - drag.x) / zoom, dt = -dx / CH.pw * (drag.t1 - drag.t0);
    let n0 = drag.t0 + dt, n1 = drag.t1 + dt;
    if(n1 > NOW){ n0 -= n1 - NOW; n1 = NOW; }
    if(n0 < HORIZON){ n1 += HORIZON - n0; n0 = HORIZON; }
    S.range = { t0:n0, t1:n1 };
    if(!drag.raf){ drag.raf = requestAnimationFrame(() => { drag && (drag.raf = 0); drawChart(false); syncRangeUI(); }); }
    hideChartHover(); return;
  }
  if(x < CH.pl || x > CH.W - CH.pr || y < CH.pt || y > CH.pt + CH.ph){ hideChartHover(); return; }
  const i = clamp(Math.round((x - CH.pl) / CH.pw * (CH.xs.length - 1)), 0, CH.xs.length - 1), t = CH.xs[i], cx = CH.sx(t);
  const gd = $('#guide'); gd.setAttribute('x1', cx); gd.setAttribute('x2', cx); gd.setAttribute('class', 'guide on');
  let minY = CH.H;
  CH.series.forEach((s, k) => { const c = svg.querySelector(`.dotm[data-i="${k}"]`), py = CH.sy(s.metric, s.ys[i]); c.setAttribute('cx', cx); c.setAttribute('cy', py); c.classList.add('on'); minY = Math.min(minY, py); });
  const unit = { psi:'', temp:'°', speed:'' };
  tip.innerHTML = `<div class="th">${fmtStamp(t)}</div>` + CH.series.map(s => `<div class="tr"><i style="background:${s.color}"></i><span>${s.label}</span><b>${Math.round(s.ys[i])}${unit[s.metric]}</b></div>`).join('');
  tip.classList.add('on');
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = clamp(cx - tw / 2, 4, CH.W - tw - 4) + 'px';
  tip.style.top = clamp(minY - th - 16, 4, CH.H - th - 4) + 'px';
});
svg.addEventListener('pointerleave', hideChartHover);
svg.addEventListener('pointerdown', e => {
  if(e.button !== 0 || !CH) return;
  drag = { x:e.clientX, t0:S.range.t0, t1:S.range.t1, raf:0 };
  svg.setPointerCapture(e.pointerId); svg.classList.add('dragging');
});
const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

/* ---------- date range ---------- */
const rangeWrap = $('#rangeWrap'), rangeBtn = $('#rangeBtn'), rangePop = $('#rangePop');
function syncRangeUI(){
  $('#rangeText').textContent = `${fmtDate(S.range.t0)} - ${fmtDate(S.range.t1)}`;
}
function closeRange(){
  if(rangePop.hidden) return;
  rangePop.hidden = true; rangeWrap.classList.remove('open'); rangeBtn.setAttribute('aria-expanded', 'false');
}
rangeBtn.addEventListener('click', e => {
  e.stopPropagation();
  if(!rangePop.hidden){ closeRange(); return; }
  closeDropdown();
  $('#rangeFrom').value = isoDate(S.range.t0); $('#rangeTo').value = isoDate(S.range.t1);
  $('#rangeFrom').min = $('#rangeTo').min = isoDate(HORIZON); $('#rangeFrom').max = $('#rangeTo').max = isoDate(NOW);
  $('#rangeErr').hidden = true;
  rangePop.hidden = false; rangePop.style.visibility = 'hidden';
  positionPanel(rangeBtn, rangePop, 275);
  rangePop.style.visibility = ''; rangeWrap.classList.add('open'); rangeBtn.setAttribute('aria-expanded', 'true');
});
rangePop.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', e => { if(!rangeWrap.contains(e.target)) closeRange(); });
$$('#rangePop [data-days]').forEach(b => b.addEventListener('click', () => {
  const d = +b.dataset.days; S.range = { t0:NOW - d * DAY, t1:NOW };
  closeRange(); syncRangeUI(); drawChart(true);
}));
$('#rangeApply').addEventListener('click', () => {
  const f = $('#rangeFrom').value, t = $('#rangeTo').value, err = $('#rangeErr');
  const bad = m => { err.hidden = false; err.querySelector('span').textContent = m; };
  if(!f || !t) return bad('Choose a start and an end date.');
  const t0 = new Date(f + 'T00:00:00').getTime(), t1 = Math.min(NOW, new Date(t + 'T23:59:59').getTime());
  if(t0 >= t1) return bad('The start date must be before the end date.');
  if(t1 - t0 > 31 * DAY) return bad('Pick a range of 31 days or less.');
  if(t0 < HORIZON) return bad('History goes back six weeks only.');
  S.range = { t0, t1 }; closeRange(); syncRangeUI(); drawChart(true);
});

/* ======================================================================
   ROUTE MAP (Leaflet)
   ====================================================================== */
const ROUTE_88 = [[37.271,-79.941],[37.130,-80.409],[37.329,-80.735],[37.366,-81.103],[37.778,-81.188],[38.279,-80.855]];
const routeCache = {};
function routeFor(a){
  if(routeCache[a.id]) return routeCache[a.id];
  let pts;
  if(a.city === 'Roanoke') pts = ROUTE_88;
  else {
    const others = ASSETS.filter(x => x.type === 'truck' && x.city !== a.city);
    const dest = others[hash32(a.id) % others.length];
    const o = [a.lat, a.lon], d = [dest.lat, dest.lon];
    const mid = [(o[0] + d[0]) / 2 + (d[1] - o[1]) * .16, (o[1] + d[1]) / 2 - (d[0] - o[0]) * .16];
    pts = [];
    for(let i = 0; i <= 14; i++){
      const u = i / 14, w = 1 - u;
      pts.push([w*w*o[0] + 2*w*u*mid[0] + u*u*d[0], w*w*o[1] + 2*w*u*mid[1] + u*u*d[1]]);
    }
    pts.dest = dest;
  }
  return routeCache[a.id] = pts;
}
const routeProg = {};                       // fraction along the route, per asset
function progOf(a){ if(routeProg[a.id] == null) routeProg[a.id] = a.city === 'Roanoke' ? .93 : .25 + (hash32(a.id) % 55) / 100; return routeProg[a.id]; }
function pointAt(pts, f){
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((s, x) => s + x, 0); let d = f * total;
  for(let i = 0; i < seg.length; i++){
    if(d <= seg[i]){ const u = seg[i] ? d / seg[i] : 0; return [pts[i][0] + (pts[i+1][0] - pts[i][0]) * u, pts[i][1] + (pts[i+1][1] - pts[i][1]) * u, i]; }
    d -= seg[i];
  }
  return [...pts[pts.length - 1], pts.length - 2];
}
let map = null, tileLayer = null, refLayer = null, routeLine = null, trailLine = null, headMarker = null, originMarker = null, mapStyle = 'street';
const TILES = {
  street:{ light:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
           dark:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr:'Tiles &copy; Esri', maxZoom:16,
           refLight:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
           refDark:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}' },
  sat:{ light:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'Tiles &copy; Esri', maxZoom:18 }
};
function setTiles(){
  if(!map) return;
  if(tileLayer) map.removeLayer(tileLayer);
  if(refLayer){ map.removeLayer(refLayer); refLayer = null; }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const T = TILES[mapStyle];
  map.setMaxZoom(T.maxZoom); tileLayer = L.tileLayer(dark && T.dark ? T.dark : T.light, { maxZoom:T.maxZoom, attribution:T.attr }).addTo(map);
  if(T.refLight) refLayer = L.tileLayer(dark ? T.refDark : T.refLight, { maxZoom:T.maxZoom, pane:'shadowPane' }).addTo(map);
}
const TRUCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
function ensureMap(a){
  const box = $('#routeMap');
  if(!window.L){ box.innerHTML = '<div class="chart-empty"><span>Map unavailable offline.</span></div>'; return; }
  if(!map){
    map = L.map(box, { zoomControl:false, attributionControl:true, scrollWheelZoom:true, zoomSnap:.5 });
    setTiles(); map.on('dragstart', () => { mapTouched = true; }); map.getContainer().addEventListener('wheel', () => { mapTouched = true; }, { passive:true });
  }
  map.invalidateSize();
  if(routeLine){ map.removeLayer(routeLine); map.removeLayer(trailLine); map.removeLayer(headMarker); map.removeLayer(originMarker); }
  const pts = routeFor(a);
  routeLine = L.polyline(pts, { color:'#1E3A8A', weight:4, opacity:.35, lineCap:'round' }).addTo(map);
  trailLine = L.polyline([], { color:'#1E3A8A', weight:4.5, opacity:.95, lineCap:'round' }).addTo(map);
  originMarker = L.marker(pts[0], { icon:L.divIcon({ className:'', html:'<div class="rt-origin"></div>', iconSize:[12.5, 12.5], iconAnchor:[6, 6] }), interactive:false }).addTo(map);
  headMarker = L.marker(pts[0], { icon:L.divIcon({ className:'', html:`<div class="rt-marker">${TRUCK_SVG}</div>`, iconSize:[30, 30], iconAnchor:[15, 15] }) }).addTo(map);
  moveHead(a);
  mapTouched = false; fitRoute(); setTimeout(fitRoute, 350);
}
function moveHead(a){
  if(!map || !headMarker) return;
  const pts = routeFor(a), f = progOf(a), p = pointAt(pts, f);
  headMarker.setLatLng([p[0], p[1]]);
  trailLine.setLatLngs(pts.slice(0, p[2] + 1).concat([[p[0], p[1]]]));
}
function updateRouteMeta(a){
  const pts = routeFor(a), dest = pts.dest;
  const to = a.city === 'Roanoke' ? 'Summersville, WV' : `${dest.city}, ${dest.st}`;
  $('#routeDesc').textContent = `${a.city}, ${a.st}  →  ${to}`;
  const b = $('#routeBadge'); b.textContent = a.moving ? 'In transit' : 'Parked';
  b.setAttribute('data-variant', a.moving ? 'info' : '');
  if(!a.moving) b.removeAttribute('data-variant');
}
$('#mapIn').addEventListener('click', () => map && map.zoomIn());
$('#mapOut').addEventListener('click', () => map && map.zoomOut());
$('#mapLayers').addEventListener('click', () => { mapStyle = mapStyle === 'street' ? 'sat' : 'street'; setTiles(); });
let mapTouched = false;
function fitRoute(){
  if(!map || !routeLine || mapTouched || S.view !== 'detail') return;
  map.invalidateSize(); map.fitBounds(routeLine.getBounds(), { padding:[36, 36], animate:false });
}
new ResizeObserver(() => { if(map && S.view === 'detail'){ map.invalidateSize(); fitRoute(); } }).observe($('.map-box'));
$('#mapFit').addEventListener('click', () => { mapTouched = false; fitRoute(); });
