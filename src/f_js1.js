
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ======================================================================
   utilities
   ====================================================================== */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const icons = () => window.dpIcons && window.dpIcons();
const ZOOM = () => parseFloat(getComputedStyle(document.body).zoom) || 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const pad2 = n => String(n).padStart(2, '0');
const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function hash32(str){ let h = 2166136261; for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed){ let a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* smooth 1-D value noise in [-1,1], deterministic per seed */
function noise(seed, x){
  const i = Math.floor(x), f = x - i, u = f*f*(3-2*f);
  const a = rng(seed ^ Math.imul(i, 2654435761))() * 2 - 1;
  const b = rng(seed ^ Math.imul(i + 1, 2654435761))() * 2 - 1;
  return a + (b - a) * u;
}
const fmtDate = t => { const d = new Date(t); return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`; };
const fmtDateShort = t => { const d = new Date(t); return `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}`; };
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function fmtStamp(t){
  const d = new Date(t); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${DOW[d.getDay()]} ${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${String(d.getFullYear()).slice(2)} ${pad2(h)}:${pad2(d.getMinutes())} ${ap}`;
}
const isoDate = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

/* ======================================================================
   data model
   Sensor thresholds live in CFG and are edited on the Settings view; every
   status in the app (pills, badges, list, donut) is derived from them.
   ====================================================================== */
const CFG = {
  psiMin:90, psiMax:110, notifyPsi:'2h',
  tempSetpoint:185, tempBelow:5, tempAbove:5, notifyTemp:'15m'
};
const tempWarn = () => CFG.tempSetpoint + CFG.tempAbove;
const tempCrit = () => tempWarn() + 10;
const DURATIONS = [
  {value:'now', label:'Immediate'}, {value:'15m', label:'15 Minutes'}, {value:'30m', label:'30 Minutes'},
  {value:'1h', label:'1 Hour'}, {value:'2h', label:'2 Hours'}, {value:'3h', label:'3 Hours'},
  {value:'4h', label:'4 Hours'}, {value:'5h', label:'5 Hours'}
];
const STATE_LABEL = { good:'Good', warn:'Cautionary', crit:'Critical', unknown:'Unknown' };
const STATE_VARIANT = { good:'success', warn:'warning', crit:'danger', unknown:'' };
const RANK = { unknown:0, good:1, warn:2, crit:3 };

/* Tire layouts. x = along the vehicle (+ is forward), z = across (+ is the
   passenger side, i.e. screen-right in the top view). Numbered front to back,
   driver side to passenger side. */
const TR = 0.525;                                    // tire radius, m
function layoutTractor(){
  const t = []; let n = 1;
  t.push({n:n++, axle:'Steer',   side:'Left',  pos:'Left',          x:2.55, z:-0.98, dual:false, outer:true});
  t.push({n:n++, axle:'Steer',   side:'Right', pos:'Right',         x:2.55, z: 0.98, dual:false, outer:true});
  [[-2.35,'Drive 1'], [-3.70,'Drive 2']].forEach(([x, axle]) => {
    t.push({n:n++, axle, side:'Left',  pos:'Left outside',  x, z:-1.07, dual:true, outer:true});
    t.push({n:n++, axle, side:'Left',  pos:'Left inside',   x, z:-0.73, dual:true, outer:false});
    t.push({n:n++, axle, side:'Right', pos:'Right inside',  x, z: 0.73, dual:true, outer:false});
    t.push({n:n++, axle, side:'Right', pos:'Right outside', x, z: 1.07, dual:true, outer:true});
  });
  return t;
}
function layoutTrailer(){
  const t = []; let n = 1;
  [[-5.55,'Axle 1'], [-7.05,'Axle 2']].forEach(([x, axle]) => {
    t.push({n:n++, axle, side:'Left',  pos:'Left outside',  x, z:-1.07, dual:true, outer:true});
    t.push({n:n++, axle, side:'Left',  pos:'Left inside',   x, z:-0.73, dual:true, outer:false});
    t.push({n:n++, axle, side:'Right', pos:'Right inside',  x, z: 0.73, dual:true, outer:false});
    t.push({n:n++, axle, side:'Right', pos:'Right outside', x, z: 1.07, dual:true, outer:true});
  });
  return t;
}
const LAYOUT = { truck:layoutTractor(), trailer:layoutTrailer() };

/* [id, type, status seed, city, state, driver, street, zip, speed mph, lat, lon] */
const ROSTER = [
  ['DTL88','truck','good','Roanoke','VA','Jackson Howard','1123 St. VA','24012',68, 37.271,-79.941],
  ['DTL89','truck','crit','Elkview','WV','Marcus Bell','88 Kanawha Blvd','25071',54, 38.443,-81.465],
  ['DTL90','truck','warn','Spencer','WV','Priya Raman','412 Court St','25276',0, 38.801,-81.351],
  ['DTL91','truck','crit','Huttonsville','WV','Daniel Ortiz','9 Main St','26273',61, 38.643,-79.973],
  ['DTL92','truck','good','Glenville','WV','Aaron Whitfield','701 Lewis St','26351',47, 38.935,-80.839],
  ['DTL93','truck','crit','Elkins','WV','Tasha Greer','35 Davis Ave','26241',0, 38.926,-79.847],
  ['DTL94','truck','warn','Clay','WV','Luis Navarro','150 Main St','25043',58, 38.459,-81.079],
  ['DTL95','truck','good','Ripley','WV','Hannah Cole','22 Church St','25271',63, 38.819,-81.711],
  ['DTL96','truck','warn','Charleston','WV','Owen Prescott','410 Summers St','25301',0, 38.350,-81.633],
  ['DTL97','truck','unknown','Nitro','WV','Rita Alvarez','1 1st Ave','25143',0, 38.414,-81.844],
  ['V305','trailer','good','Roanoke','VA','Jackson Howard','1123 St. VA','24012',68, 37.271,-79.941],
  ['V306','trailer','crit','Elkview','WV','Marcus Bell','88 Kanawha Blvd','25071',54, 38.443,-81.465],
  ['V307','trailer','warn','Spencer','WV','Priya Raman','412 Court St','25276',0, 38.801,-81.351],
  ['V308','trailer','crit','Huttonsville','WV','Daniel Ortiz','9 Main St','26273',61, 38.643,-79.973],
  ['V309','trailer','good','Glenville','WV','Aaron Whitfield','701 Lewis St','26351',47, 38.935,-80.839],
  ['V310','trailer','crit','Elkins','WV','Tasha Greer','35 Davis Ave','26241',0, 38.926,-79.847],
  ['V311','trailer','warn','Clay','WV','Luis Navarro','150 Main St','25043',58, 38.459,-81.079],
  ['V312','trailer','good','Ripley','WV','Hannah Cole','22 Church St','25271',63, 38.819,-81.711],
  ['V313','trailer','warn','Charleston','WV','Owen Prescott','410 Summers St','25301',0, 38.350,-81.633],
  ['V314','trailer','good','Nitro','WV','Rita Alvarez','1 1st Ave','25143',0, 38.414,-81.844]
];

/* Tires are seeded so that each asset's derived status matches its seed at the
   default thresholds, with margins wide enough that the live jitter can't flip it. */
function seedTires(asset){
  const r = rng(hash32(asset.id));
  const lay = LAYOUT[asset.type];
  const tires = lay.map(l => ({
    n:l.n, base:{ psi: 98 + r()*7, temp: 152 + r()*28 }, psi:null, temp:null, off:false
  }));
  if(asset.seed === 'unknown'){ tires.forEach(t => { t.off = true; }); return tires; }
  const bad = Math.floor(r() * tires.length);
  if(asset.seed === 'warn'){
    const kind = Math.floor(r() * 3);
    if(kind === 0) tires[bad].base.psi = 84 + r()*3;              // low pressure
    else if(kind === 1){ tires[bad].base.temp = 194 + r()*2.5; }  // running warm
    else tires[bad].base.psi = 113 + r()*3;                       // over-inflated
  } else if(asset.seed === 'crit'){
    const kind = Math.floor(r() * 3);
    if(kind === 0){ tires[bad].base.psi = 66 + r()*8; tires[(bad+2)%tires.length].base.psi = 85 + r()*3; }
    else if(kind === 1){ tires[bad].base.temp = 205 + r()*8; tires[bad].base.psi = 104 + r()*4; }
    else { tires[bad].base.psi = 72 + r()*5; tires[bad].base.temp = 203 + r()*6; }
  }
  tires.forEach(t => { t.psi = t.base.psi; t.temp = t.base.temp; });
  return tires;
}
const ASSETS = ROSTER.map(([id,type,seed,city,st,driver,street,zip,speed,lat,lon]) => {
  const a = { id, type, seed, city, st, driver, addr:`${street} ${zip}`, speed, moving:speed>0, lat, lon,
              upd:1 + (hash32(id) % 5), updAt:Date.now() - (1 + (hash32(id) % 5)) * 60000 };
  a.tires = seedTires(a);
  return a;
});
const byId = id => ASSETS.find(a => a.id === id);

function tireState(t){
  if(t.off || t.psi == null) return 'unknown';
  if(t.psi < CFG.psiMin - 10 || t.psi > CFG.psiMax + 15 || t.temp >= tempCrit()) return 'crit';
  if(t.psi < CFG.psiMin || t.psi > CFG.psiMax || t.temp >= tempWarn()) return 'warn';
  return 'good';
}
function assetState(a){
  let worst = 'unknown', any = false;
  a.tires.forEach(t => { const s = tireState(t); if(s !== 'unknown'){ any = true; if(RANK[s] > RANK[worst]) worst = s; } });
  return any ? worst : 'unknown';
}
const STATE_COLOR = () => ({ good:cssv('--green'), warn:cssv('--amber'), crit:cssv('--red'), unknown:cssv('--text-faint') });

/* ======================================================================
   app state + router
   ====================================================================== */
const S = {
  view:'equipment', type:'truck', filter:'all', q:'',
  assetId:'DTL88', mode:'psi', sel:new Set(), vis:{ psi:true, temp:false, speed:false },
  range:{ t0:0, t1:0 }, selTire:null, viewPreset:'top', sort:{ k:'id', dir:1 }, hover:null, pendingTire:null, spin:false, rosterF:'all'
};
const NOW = Date.now();
const DAY = 864e5;
const HORIZON = NOW - 44 * DAY;
S.range = { t0: NOW - 7 * DAY, t1: NOW };

const VIEWS = ['equipment', 'tmps', 'detail', 'settings'];
function go(hash){ if(location.hash === '#' + hash) route(); else location.hash = hash; }
function parseHash(){
  const p = (location.hash || '#equipment').slice(1).split('/');
  if(p[0] === 'tmps' && p[1]){
    if(byId(p[1])) return { view: p[2] === 'settings' ? 'settings' : 'detail', id:p[1] };
    return { view:'tmps' };
  }
  return { view: p[0] === 'tmps' ? 'tmps' : 'equipment' };
}
function route(){
  const r = parseHash();
  closeMenus(); closeDropdown();
  if(r.id){ S.assetId = r.id; S.type = byId(r.id).type; }
  S.view = r.view;
  VIEWS.forEach(v => { $('#view-' + v).hidden = v !== r.view; });
  $$('.content-scroll').forEach(s => { s.scrollTop = 0; });
  if(r.view === 'tmps') renderFleet();
  if(r.view === 'detail') enterDetail();
  if(r.view === 'settings') enterSettings();
  document.title = r.view === 'equipment' ? 'Dispatch Pro — Equipment' : 'Dispatch Pro — Tire Pressure Monitor';
  icons();
}
window.addEventListener('hashchange', route);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if(t && !t.hasAttribute('aria-disabled')){ e.preventDefault(); go(t.dataset.go); }
});

/* ======================================================================
   dropdown — Radix/shadcn Select behaviour, single + multi + searchable.
   The panel is position:fixed, positioned from the trigger's
   getBoundingClientRect() and divided by the body zoom.
   ====================================================================== */
function positionPanel(trigger, panel, minPainted){
  const zoom = ZOOM();
  const rect = trigger.getBoundingClientRect();
  const prev = panel.style.width;
  panel.style.width = 'max-content';
  const natural = panel.scrollWidth * zoom;
  panel.style.width = prev;
  const floor = minPainted || 160;
  const w = Math.min(Math.max(rect.width, floor, natural), Math.max(floor, 380));
  panel.style.width = (w / zoom) + 'px';
  const h = panel.offsetHeight * zoom;
  let left = rect.left;
  if(left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
  panel.style.left = (left / zoom) + 'px';
  const below = window.innerHeight - rect.bottom;
  panel.style.top = (below < h + 8 && rect.top > h + 8) ? ((rect.top - h - 4) / zoom) + 'px' : ((rect.bottom + 4) / zoom) + 'px';
}
let openDD = null;
function closeDropdown(){
  if(!openDD) return;
  openDD.wrap.classList.remove('open');
  openDD.panel.hidden = true;
  openDD.trigger.setAttribute('aria-expanded', 'false');
  openDD = null;
}
document.addEventListener('click', e => { if(openDD && !openDD.wrap.contains(e.target)) closeDropdown(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeDropdown(); closeMenus(); closeRange(); } });
document.addEventListener('scroll', e => {
  if(!openDD) return;
  if(openDD.panel.contains(e.target)) return;
  closeDropdown();
}, true);
window.addEventListener('resize', () => { closeDropdown(); });

/* opts: { mount, options:[{value,label,meta?,indent?}], value, multi, search, placeholder, minWidth,
           renderValue(value,options)->html, onChange(value) }  value = string | Set */
function makeDropdown(opts){
  const wrap = document.createElement('div');
  wrap.className = 'dropdown';
  wrap.innerHTML = `<button type="button" class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="dropdown-value"></span><i data-lucide="chevron-down" class="chevron"></i></button><div class="dropdown-panel" role="listbox" hidden></div>`;
  const trigger = wrap.firstElementChild, panel = wrap.lastElementChild, valEl = trigger.firstElementChild;
  const api = { el:wrap, opts, value:opts.value, options:opts.options };
  opts.mount.innerHTML = ''; opts.mount.appendChild(wrap);
  if(opts.multi) api.value = new Set(opts.value || []);

  function isSel(v){ return opts.multi ? api.value.has(v) : api.value === v; }
  function renderValue(){
    if(opts.renderValue){ valEl.innerHTML = opts.renderValue(api.value, api.options); valEl.classList.remove('placeholder'); return; }
    if(opts.multi){
      valEl.textContent = api.value.size ? Array.from(api.value).join(', ') : opts.placeholder;
      valEl.classList.toggle('placeholder', !api.value.size);
    } else {
      const o = api.options.find(o => o.value === api.value);
      valEl.textContent = o ? o.label : (opts.placeholder || '');
      valEl.classList.toggle('placeholder', !o);
    }
  }
  let list, searchInput, query = '', activeIdx = -1;
  function items(){ return $$('.dropdown-item', panel); }
  function renderItems(){
    const q = query.trim().toLowerCase();
    const rows = api.options.filter(o => !q || (o.label + ' ' + (o.meta || '')).toLowerCase().includes(q));
    const html = rows.map((o, i) => {
      if(o.separator) return '<div class="dropdown-separator"></div>';
      const sel = isSel(o.value);
      const lead = opts.multi ? `<input type="checkbox" class="row-checkbox" tabindex="-1" ${sel ? 'checked' : ''}>` : '';
      return `<button type="button" role="option" aria-selected="${sel}" class="dropdown-item${sel ? ' active' : ''}${opts.multi ? ' multi' : ''}${o.indent ? ' indent-1' : ''}" data-i="${i}" data-v="${esc(o.value)}">
        ${lead}<span class="dd-label">${esc(o.label)}</span>${o.meta ? `<span class="dd-meta">${esc(o.meta)}</span>` : ''}<span class="check">${CHECK_SVG}</span></button>`;
    }).join('');
    const target = opts.search ? list : panel;
    target.innerHTML = html || '<p class="dropdown-empty">No results found.</p>';
    activeIdx = -1;
  }
  if(opts.search){
    panel.classList.add('has-search');
    panel.innerHTML = `<div class="dropdown-search"><i data-lucide="search"></i><input type="text" placeholder="${esc(opts.search)}" autocomplete="off"></div><div class="dropdown-list"></div>`;
    list = panel.querySelector('.dropdown-list'); searchInput = panel.querySelector('input');
    searchInput.addEventListener('input', () => { query = searchInput.value; renderItems(); });
  }
  function setActive(i){
    const it = items(); if(!it.length) return;
    it.forEach(n => n.classList.remove('is-active-descendant'));
    activeIdx = (i + it.length) % it.length;
    it[activeIdx].classList.add('is-active-descendant');
    it[activeIdx].scrollIntoView({ block:'nearest' });
  }
  function choose(v){
    if(opts.multi){
      if(api.value.has(v)) api.value.delete(v); else api.value.add(v);
      renderItems(); renderValue();
      opts.onChange && opts.onChange(new Set(api.value));
    } else {
      api.value = v; renderValue(); closeDropdown();
      opts.onChange && opts.onChange(v);
    }
  }
  panel.addEventListener('click', e => {
    const it = e.target.closest('.dropdown-item'); if(!it) return;
    e.stopPropagation(); choose(it.dataset.v);
  });
  function open(){
    closeDropdown(); query = ''; if(searchInput) searchInput.value = '';
    renderItems(); icons();
    panel.hidden = false; panel.style.visibility = 'hidden';
    positionPanel(trigger, panel, opts.minWidth || 160);
    panel.style.visibility = '';
    wrap.classList.add('open'); trigger.setAttribute('aria-expanded', 'true');
    openDD = { wrap, panel, trigger };
    const cur = items().findIndex(n => n.classList.contains('active'));
    setActive(cur < 0 ? 0 : cur);
    if(searchInput) searchInput.focus();
  }
  trigger.addEventListener('click', () => { if(wrap.classList.contains('open')) closeDropdown(); else open(); });
  function keys(e){
    const isOpen = wrap.classList.contains('open');
    if(!isOpen){ if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key) && e.target === trigger){ e.preventDefault(); open(); } return; }
    if(e.key === 'ArrowDown'){ e.preventDefault(); setActive(activeIdx + 1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); setActive(activeIdx - 1); }
    else if(e.key === 'Enter' || (e.key === ' ' && e.target === trigger)){
      e.preventDefault(); const it = items()[activeIdx]; if(it) choose(it.dataset.v);
    } else if(e.key === 'Tab') closeDropdown();
  }
  trigger.addEventListener('keydown', keys);
  if(searchInput) searchInput.addEventListener('keydown', keys);

  api.set = v => { api.value = opts.multi ? new Set(v) : v; renderValue(); };
  api.setOptions = o => { api.options = o; renderValue(); };
  api.trigger = trigger;
  renderValue(); icons();
  return api;
}

/* ======================================================================
   top navigation: Equipment ▸ Diagnostics ▸ TMPS
   ====================================================================== */
const equipItem = $('#navEquipment'), equipBtn = $('#navEquipBtn'), equipMenu = $('#equipMenu');
const diagBtn = $('#diagBtn'), diagMenu = $('#diagMenu');
function closeMenus(){
  equipMenu.hidden = true; diagMenu.hidden = true;
  equipItem.classList.remove('open'); diagBtn.classList.remove('open');
  equipBtn.setAttribute('aria-expanded', 'false'); diagBtn.setAttribute('aria-expanded', 'false');
}
equipBtn.addEventListener('click', e => {
  e.stopPropagation();
  const willOpen = equipMenu.hidden; closeMenus(); closeDropdown();
  if(willOpen){ equipMenu.hidden = false; equipItem.classList.add('open'); equipBtn.setAttribute('aria-expanded', 'true'); icons(); }
});
function openDiag(){ diagMenu.hidden = false; diagBtn.classList.add('open'); diagBtn.setAttribute('aria-expanded', 'true'); }
diagBtn.addEventListener('click', e => { e.stopPropagation(); openDiag(); icons(); });
diagBtn.addEventListener('mouseenter', openDiag);
document.addEventListener('click', e => { if(!equipItem.contains(e.target)) closeMenus(); });

/* ======================================================================
   FLEET LIST (Figma: TMPS)
   ====================================================================== */
const statusFilter = makeDropdown({
  mount:$('#statusFilterMount'), placeholder:'Tire Status', value:'all', minWidth:170,
  options:[
    {value:'all', label:'All statuses'}, {value:'attn', label:'Needs attention'}, {value:'good', label:'Good'}, {value:'warn', label:'Cautionary'},
    {value:'crit', label:'Critical'}, {value:'unknown', label:'Unknown'}
  ],
  onChange:v => { S.filter = v; renderFleet(); }
});
$('#assetSearch').addEventListener('input', e => { S.q = e.target.value; renderFleet(); });
$('#typeSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  S.type = b.dataset.type; renderFleet();
});
$('#clearFilters').addEventListener('click', () => { S.filter = 'all'; S.q = ''; $('#assetSearch').value = ''; statusFilter.set('all'); renderFleet(); });

function badgeFor(state){
  const v = STATE_VARIANT[state];
  return `<span class="badge"${v ? ` data-variant="${v}"` : ''}><span class="dot"></span>${STATE_LABEL[state]}</span>`;
}
function agoText(a){ const m = Math.max(0, Math.round((Date.now() - a.updAt) / 60000)); return m < 1 ? 'just now' : `${m} min ago`; }

/* ---------- reading helpers shared by the fleet list, roster and hover cards ---------- */
function reasonOf(t){
  if(t.off || t.psi == null) return 'No sensor signal';
  const p = Math.round(t.psi), T = Math.round(t.temp);
  if(t.psi < CFG.psiMin) return `${p} PSI · ${Math.round(CFG.psiMin - t.psi)} below range`;
  if(t.psi > CFG.psiMax) return `${p} PSI · ${Math.round(t.psi - CFG.psiMax)} above range`;
  if(t.temp >= tempWarn()) return `${T}°F · ${Math.max(0, T - tempWarn())} over alert`;
  return `${p} PSI · ${T}°F`;
}
function severity(t){
  const st = tireState(t); if(st === 'good' || st === 'unknown') return 0;
  const mag = t.psi < CFG.psiMin ? CFG.psiMin - t.psi : t.psi > CFG.psiMax ? t.psi - CFG.psiMax : Math.max(0, t.temp - tempWarn());
  return (st === 'crit' ? 1000 : 0) + mag + .01;
}
function worstTire(a){
  let best = null;
  a.tires.forEach(t => { const s = severity(t); if(s > 0 && (!best || s > best.s)) best = { s, t, n:t.n }; });
  return best;
}
const spCounter = { n:0 };
const smooth = pts => {
  if(pts.length < 3) return pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for(let i = 0; i < pts.length - 1; i++){
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
};

/* ---------- hover card: one design for every hoverable reading ---------- */
const hcard = $('#hcard');
function showHCard(html, cx, cy){
  hcard.innerHTML = html; hcard.classList.add('on');
  const z = ZOOM(), w = hcard.offsetWidth * z, h = hcard.offsetHeight * z;
  let x = cx + 18, y = cy + 14;
  if(x + w > window.innerWidth - 8) x = cx - w - 18;
  if(y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  hcard.style.left = (Math.max(8, x) / z) + 'px'; hcard.style.top = (Math.max(8, y) / z) + 'px';
}
function hideHCard(){ hcard.classList.remove('on'); }
function genericCardHTML(o){
  return `<div class="hc-head"><div><div class="hc-t">${esc(o.t)}</div>${o.s ? `<div class="hc-s">${esc(o.s)}</div>` : ''}</div></div>
    <div class="hc-rows">${o.r.map(r => `<div class="hc-row"><i style="background:${r[0]}"></i><span>${esc(r[1])}</span><b>${esc(r[2])}</b></div>`).join('')}</div>`;
}
function genericHover(e){
  const el = e.target.closest && e.target.closest('[data-hc]'); if(!el) return;
  try{ showHCard(genericCardHTML(JSON.parse(el.dataset.hc)), e.clientX, e.clientY); }catch(err){}
}
document.addEventListener('pointerover', genericHover);
document.addEventListener('pointermove', e => { if(hcard.classList.contains('on')) genericHover(e); });
document.addEventListener('pointerout', e => { if(e.target.closest && e.target.closest('[data-hc]')) hideHCard(); });

/* ---------- fleet KPIs, list, attention ---------- */
$('#assetTable thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]'); if(!th) return;
  const k = th.dataset.sort;
  S.sort = { k, dir:S.sort.k === k ? -S.sort.dir : 1 }; renderFleet();
});
$('#fleetKpis').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if(!b) return;
  S.filter = S.filter === b.dataset.k ? 'all' : b.dataset.k; statusFilter.set(S.filter); renderFleet();
});
$('#attnList').addEventListener('click', e => {
  const b = e.target.closest('button[data-id]'); if(!b) return;
  S.pendingTire = +b.dataset.n; hideHCard(); go('tmps/' + b.dataset.id);
});
function renderKpis(){
  const c = { good:0, warn:0, crit:0, unknown:0 }; ASSETS.forEach(a => c[assetState(a)]++);
  const tot = ASSETS.length, attn = c.warn + c.crit;
  const tile = (ico, tone, label, val, sub, btn) => `<${btn ? 'button type="button" data-k="' + btn + '"' : 'div'} class="kpi${btn && S.filter === btn ? ' on' : ''}">
      <span class="kpi-top">${label}<span class="kpi-ico"${tone ? ` data-tone="${tone}"` : ''}><i data-lucide="${ico}"></i></span></span>
      <span class="kpi-val">${val}</span><span class="kpi-sub">${sub}</span></${btn ? 'button' : 'div'}>`;
  $('#fleetKpis').innerHTML =
    tile('truck', '', 'Assets monitored', tot, `<b>${ASSETS.filter(a => a.type === 'truck').length}</b> trucks · <b>${ASSETS.filter(a => a.type === 'trailer').length}</b> trailers`, '') +
    tile('circle-check', 'success', 'In range', c.good, `<b>${Math.round(c.good / tot * 100)}%</b> of the fleet is healthy`, 'good') +
    tile('triangle-alert', c.crit ? 'danger' : 'warning', 'Need attention', attn, `<b>${c.crit}</b> critical · <b>${c.warn}</b> cautionary`, 'attn') +
    tile('wifi-off', '', 'Sensors offline', c.unknown, c.unknown ? 'No signal — check the TPMS gateway' : 'Every sensor is reporting', 'unknown');
}
function renderAttn(){
  const items = [];
  ASSETS.forEach(a => a.tires.forEach(t => { const s = severity(t); if(s > 0) items.push({ a, t, s }); }));
  items.sort((x, y) => y.s - x.s);
  const crit = items.filter(i => tireState(i.t) === 'crit').length;
  const b = $('#attnCount'); b.textContent = items.length; b.setAttribute('data-variant', crit ? 'danger' : 'warning');
  $('#attnList').innerHTML = items.slice(0, 6).map(({ a, t }) => {
    const st = tireState(t), l = LAYOUT[a.type][t.n - 1];
    return `<li><button type="button" class="attn-row" data-id="${a.id}" data-n="${t.n}">
      <span class="attn-ico" data-s="${st}"><i data-lucide="${st === 'crit' ? 'triangle-alert' : 'circle-alert'}"></i></span>
      <span><span class="attn-t">${a.id} · Tire ${t.n}</span><span class="attn-m">${esc(l.axle)} · ${esc(l.pos)} — ${esc(reasonOf(t))}</span></span>
      <span class="attn-go"><i data-lucide="chevron-right"></i></span></button></li>`;
  }).join('') || '<li><div class="roster-empty"><i data-lucide="circle-check"></i><p>Every tire is within range.</p></div></li>';
}

function renderFleet(){
  $$('#typeSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === S.type));
  $('#assetSearch').placeholder = S.type === 'truck' ? 'Search Truck' : 'Search Trailer';
  const q = S.q.trim().toLowerCase();
  const SEV = { crit:0, warn:1, unknown:2, good:3 };
  const byId2 = (x, y) => x.id.localeCompare(y.id, undefined, { numeric:true });
  const rows = ASSETS.filter(a => a.type === S.type)
    .filter(a => S.filter === 'all' || (S.filter === 'attn' ? ['warn', 'crit'].includes(assetState(a)) : assetState(a) === S.filter))
    .filter(a => !q || `${a.id} ${a.city} ${a.st} ${a.driver}`.toLowerCase().includes(q))
    .sort((x, y) => S.sort.dir * (S.sort.k === 'status' ? (SEV[assetState(x)] - SEV[assetState(y)] || byId2(x, y)) : byId2(x, y)));
  $('#assetCount').textContent = rows.length;
  $$('#assetTable th.sortable').forEach(th => {
    const on = S.sort.k === th.dataset.sort;
    th.classList.toggle('sorted', on);
    th.querySelector('.sort').innerHTML = `<i data-lucide="${on ? (S.sort.dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i>`;
  });
  $('#assetTable tbody').innerHTML = rows.map(a => {
    const w = worstTire(a), cnt = { good:0, warn:0, crit:0, unknown:0 }; a.tires.forEach(t => cnt[tireState(t)]++);
    const hc = { t:`${a.id} · ${a.tires.length} tires`, s:'Sensor readings right now', r:[['#10B981', 'In range', cnt.good], ['#F59E0B', 'Cautionary', cnt.warn], ['#EF4444', 'Critical', cnt.crit]].concat(cnt.unknown ? [['#9CA3AF', 'No signal', cnt.unknown]] : []) };
    return `<tr data-id="${a.id}" tabindex="0">
      <td><button class="asset-link" type="button">${a.id}</button></td>
      <td>${esc(a.city)}, ${a.st} <span class="cell-muted">- Updated ${agoText(a)}</span></td>
      <td><span class="driver-cell"><span class="mini-avatar">${esc(initials(a.driver))}</span>${esc(a.driver)}</span></td>
      <td><span class="tire-dots" data-hc='${esc(JSON.stringify(hc))}'>${a.tires.map(t => `<i data-s="${tireState(t)}"></i>`).join('')}</span></td>
      <td>${w ? `<span class="worst">T${w.n} · ${esc(reasonOf(w.t))}</span>` : `<span class="worst none">${assetState(a) === 'unknown' ? 'No signal' : '—'}</span>`}</td>
      <td>${badgeFor(assetState(a))}</td>
    </tr>`;
  }).join('');
  $('#assetEmpty').hidden = rows.length > 0;
  $('#assetTable').hidden = rows.length === 0;
  renderKpis(); renderAttn(); renderDonut(); icons();
}
$('#assetTable tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]'); if(tr){ hideHCard(); go('tmps/' + tr.dataset.id); }
});
$('#assetTable tbody').addEventListener('keydown', e => {
  if(e.key === 'Enter'){ const tr = e.target.closest('tr[data-id]'); if(tr) go('tmps/' + tr.dataset.id); }
});

/* Overall Fleet Status: derived from the live per-asset status, all assets */
function renderDonut(){
  const counts = { good:0, crit:0, warn:0, unknown:0 };
  ASSETS.forEach(a => counts[assetState(a)]++);
  const total = ASSETS.length, C = STATE_COLOR();
  const order = [['good','Normal'], ['crit','Critical'], ['warn','Cautionary'], ['unknown','Unknown']];
  const R = 80, CIRC = 2 * Math.PI * R, GAP = 3;
  const svg = $('#donut svg');
  $$('circle.seg', svg).forEach(n => n.remove());
  let acc = 0;
  order.forEach(([k]) => {
    if(!counts[k]) return;
    const len = counts[k] / total * CIRC;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'seg'); c.setAttribute('data-k', k);
    c.setAttribute('cx', 100); c.setAttribute('cy', 100); c.setAttribute('r', R);
    c.setAttribute('stroke', C[k]);
    c.setAttribute('stroke-dasharray', `${Math.max(0, len - GAP)} ${CIRC - Math.max(0, len - GAP)}`);
    c.setAttribute('stroke-dashoffset', -acc);
    svg.appendChild(c); acc += len;
  });
  const list = $('#statList');
  list.innerHTML = order.map(([k, lbl]) => `
    <button type="button" class="stat-row${S.filter === k ? ' hot' : ''}" data-k="${k}" aria-label="${lbl}: ${counts[k]} assets">
      <span class="sw" style="background:${C[k]}"></span><span>${lbl}</span>
      <span class="n">${counts[k]}</span><span class="p">${Math.round(counts[k] / total * 100)}%</span>
    </button>`).join('');
  setDonutCenter('good');
  $('#fleetDesc').textContent = `${total} assets · ${ASSETS.filter(a => a.type === 'truck').length} trucks, ${ASSETS.filter(a => a.type === 'trailer').length} trailers`;
  function setDonutCenter(k){
    $('#donutPct').textContent = Math.round(counts[k] / total * 100) + '%';
    $('#donutLbl').textContent = order.find(o => o[0] === k)[1];
  }
  const donut = $('#donut');
  const hot = k => {
    donut.classList.toggle('hovering', !!k);
    $$('circle.seg', svg).forEach(n => n.classList.toggle('hot', n.dataset.k === k));
    $$('.stat-row', list).forEach(n => n.classList.toggle('hot', n.dataset.k === k || (!k && n.dataset.k === S.filter)));
    setDonutCenter(k || 'good');
  };
  $$('.stat-row', list).forEach(n => {
    n.addEventListener('mouseenter', () => hot(n.dataset.k)); n.addEventListener('mouseleave', () => hot(null));
    n.addEventListener('focus', () => hot(n.dataset.k)); n.addEventListener('blur', () => hot(null));
    n.addEventListener('click', () => {
      S.filter = S.filter === n.dataset.k ? 'all' : n.dataset.k;
      statusFilter.set(S.filter); renderFleet();
    });
  });
  $$('circle.seg', svg).forEach(n => {
    n.addEventListener('mouseenter', () => hot(n.dataset.k)); n.addEventListener('mouseleave', () => hot(null));
    n.addEventListener('click', () => { S.filter = S.filter === n.dataset.k ? 'all' : n.dataset.k; statusFilter.set(S.filter); renderFleet(); });
  });
}
