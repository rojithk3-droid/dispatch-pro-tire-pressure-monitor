
/* ======================================================================
   SETTINGS (Figma: Settings ▸ Min/Max ▸ Select Duration ▸ Set Alert ▸
   Success ▸ Additional Notification search)
   ====================================================================== */
const DIRECTORY = [
  { name:'Michigan Wolverines', role:'Team', caps:['email'] },
  { name:'Michael Jordan',      role:'Load Planner' },
  { name:'Michael Pippen',      role:'Dispatcher' },
  { name:'Michelle Ortiz',      role:'Safety Manager' },
  { name:'Mia Chen',            role:'Driver' },
  { name:'Miguel Alvarez',      role:'Maintenance Lead' },
  { name:'Priya Nair',          role:'Load Planner' },
  { name:'Tom Becker',          role:'Terminal Manager' }
];
const CHAN = ['email', 'chat', 'sms'];
const blankRow = () => ({ role:'', name:'', caps:CHAN.slice(), ch:{ email:false, chat:false, sms:false }, blank:true });
const NOTIF = {};                      // per asset: { saved, draft }
function notifFor(a){
  if(!NOTIF[a.id]){
    const mk = (role, name) => ({ role, name, caps:CHAN.slice(), ch:{ email:false, chat:false, sms:false } });
    const saved = { basic:[mk('Load Planner', 'Max Zimmerman'), mk('Dispatcher', 'Mike Stearns'), Object.assign(mk('Driver', a.driver), { driver:true }), mk('Safety Manager', 'Jason Rasmussen')], extra:[blankRow()] };
    NOTIF[a.id] = { saved, draft:null };
  }
  return NOTIF[a.id];
}
const cloneNotif = n => JSON.parse(JSON.stringify(n));
let ddNotifyPsi = null, ddNotifyTemp = null, dlgOpener = null;

function enterSettings(){
  const a = byId(S.assetId), n = notifFor(a);
  n.draft = cloneNotif(n.saved);
  $('#setAsset').textContent = a.id; $('#setBackLbl').textContent = a.id;
  const col = $('#settingsCol'); col.dataset.tab = 'sensor';
  $$('#setTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'sensor'));
  $$('#settingsCol .card').forEach(c => { c.dataset.collapsed = 'false'; });
  $('#psiMin').value = CFG.psiMin; $('#psiMax').value = CFG.psiMax;
  $('#tempBelow').value = CFG.tempBelow; $('#tempAbove').value = CFG.tempAbove;
  ddNotifyPsi = makeDropdown({ mount:$('#ddNotifyPsi'), options:DURATIONS, value:CFG.notifyPsi, placeholder:'Select Duration' });
  ddNotifyTemp = makeDropdown({ mount:$('#ddNotifyTemp'), options:DURATIONS, value:CFG.notifyTemp, placeholder:'Select Duration' });
  clearErrors(); renderNotif(); renderZones();
}
$('#setBack').addEventListener('click', () => go('tmps/' + S.assetId));
$('#setCancel').addEventListener('click', () => { notifFor(byId(S.assetId)).draft = null; go('tmps/' + S.assetId); });
$('#setTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  $$('#setTabs button').forEach(n => n.classList.toggle('active', n === b));
  $('#settingsCol').dataset.tab = b.dataset.tab;
});
$$('[data-collapse]').forEach(b => b.addEventListener('click', () => {
  const card = b.closest('.card'), c = card.dataset.collapsed !== 'true';
  card.dataset.collapsed = String(c); b.setAttribute('aria-expanded', String(!c));
}));

/* ---------- alert form ---------- */
function clearErrors(){
  $$('#settingsCol [data-err]').forEach(p => { p.hidden = true; p.innerHTML = ''; });
  $$('#settingsCol .field-invalid').forEach(n => n.classList.remove('field-invalid'));
}
function showErr(key, msg, control){
  const p = $(`[data-err="${key}"]`); if(!p) return;
  p.innerHTML = `<i data-lucide="circle-alert"></i> ${esc(msg)}`; p.hidden = false;
  if(control) control.classList.add('field-invalid');
}
const num = id => { const v = $('#' + id).value.trim(); return v === '' ? null : Number(v); };
function validateAlert(){
  clearErrors(); let first = null; const bad = (k, m, c) => { showErr(k, m, c); first = first || c; };
  const min = num('psiMin'), max = num('psiMax'), lo = num('tempBelow'), hi = num('tempAbove');
  if(min == null) bad('psiMin', 'Enter a minimum.', $('#psiMin'));
  else if(!Number.isFinite(min) || min < 10 || min > 200) bad('psiMin', 'Use a number from 10 to 200.', $('#psiMin'));
  if(max == null) bad('psiMax', 'Enter a maximum.', $('#psiMax'));
  else if(!Number.isFinite(max) || max < 10 || max > 200) bad('psiMax', 'Use a number from 10 to 200.', $('#psiMax'));
  else if(min != null && Number.isFinite(min) && max <= min) bad('psiMax', 'Must be higher than the minimum.', $('#psiMax'));
  if(!ddNotifyPsi.value) bad('notifyPsi', 'Choose a duration.', ddNotifyPsi.trigger);
  if(lo == null) bad('tempBelow', 'Enter degrees below.', $('#tempBelow'));
  else if(!Number.isFinite(lo) || lo < 0 || lo > 60) bad('tempBelow', 'Use a number from 0 to 60.', $('#tempBelow'));
  if(hi == null) bad('tempAbove', 'Enter degrees above.', $('#tempAbove'));
  else if(!Number.isFinite(hi) || hi < 0 || hi > 60) bad('tempAbove', 'Use a number from 0 to 60.', $('#tempAbove'));
  if(!ddNotifyTemp.value) bad('notifyTemp', 'Choose a duration.', ddNotifyTemp.trigger);
  icons();
  if(first){ first.focus(); return null; }
  return { min, max, lo, hi };
}
$$('#psiMin,#psiMax,#tempBelow,#tempAbove').forEach(i => i.addEventListener('input', () => {
  i.classList.remove('field-invalid'); const p = $(`[data-err="${i.id}"]`); if(p) p.hidden = true;
}));
$('#setAlertBtn').addEventListener('click', () => {
  const v = validateAlert();
  if(!v){ window.dpToast('error', 'Check the alert thresholds', 'A few fields need attention before the alert can be set.'); return; }
  Object.assign(CFG, { psiMin:v.min, psiMax:v.max, tempBelow:v.lo, tempAbove:v.hi, notifyPsi:ddNotifyPsi.value, notifyTemp:ddNotifyTemp.value });
  renderZones(); dlgOpener = $('#setAlertBtn'); openDlg();
});
const dlg = $('#successDlg');
function openDlg(){
  dlg.hidden = false; document.body.classList.add('has-dialog');
  const p = dlg.querySelector('.dialog-panel'); p.classList.remove('snap');
  const y = p.getBoundingClientRect().top; if(Math.abs(y - Math.round(y)) > .01) p.classList.add('snap');
  const path = dlg.querySelector('.success-mark path'); path.style.animation = 'none'; void path.getBoundingClientRect(); path.style.animation = '';
  $('#sdContinue').focus();
}
function closeDlg(){ dlg.hidden = true; document.body.classList.remove('has-dialog'); }
$('#sdContinue').addEventListener('click', () => {
  closeDlg();
  const inp = $('#extraTable input.text-input:not([disabled])');
  if(inp){ inp.scrollIntoView({ block:'center', behavior:'smooth' }); setTimeout(() => inp.focus({ preventScroll:true }), 250); }
});
document.addEventListener('keydown', e => {
  if(dlg.hidden) return;
  if(e.key === 'Escape'){ closeDlg(); dlgOpener && dlgOpener.focus(); }
  if(e.key === 'Tab'){ e.preventDefault(); $('#sdContinue').focus(); }
});

/* ---------- notification tables ---------- */
function draft(){ return notifFor(byId(S.assetId)).draft; }
function chkCells(r, group, i){
  return CHAN.map(c => `<td class="chk"><input type="checkbox" class="row-checkbox" data-g="${group}" data-i="${i}" data-c="${c}" aria-label="${c === 'chat' ? 'ProChat' : c === 'sms' ? 'SMS' : 'Email'} for ${esc(r.name || 'new recipient')}"${r.ch[c] ? ' checked' : ''}${(!r.caps.includes(c) || r.blank) ? ' disabled' : ''}></td>`).join('');
}
function renderNotif(){
  const d = draft(), bb = $('#basicTable tbody'), eb = $('#extraTable tbody');
  bb.innerHTML = d.basic.map((r, i) => `
    <tr data-g="basic" data-i="${i}"><td class="role-text">${esc(r.role)}</td><td class="recipient-cell">${esc(r.name)}</td>${chkCells(r, 'basic', i)}
      <td class="actions"><div class="row-actions"><button class="icon-action-btn remove" type="button" data-rm="basic" data-i="${i}" aria-label="Remove ${esc(r.name)}"><i data-lucide="minus"></i></button></div></td></tr>`).join('');
  $('#basicEmpty').hidden = d.basic.length > 0; $('#basicTable').hidden = d.basic.length === 0;
  $('#basicCount').textContent = d.basic.length;
  const last = d.extra.length - 1;
  eb.innerHTML = d.extra.map((r, i) => {
    const lead = r.blank
      ? `<td colspan="2"><div class="recipient-search"><input class="text-input" type="text" placeholder="Search" autocomplete="off" data-i="${i}" role="combobox" aria-expanded="false" aria-label="Search recipients"><i data-lucide="search"></i></div></td>`
      : `<td class="role-text">${esc(r.role)}</td><td class="recipient-cell">${esc(r.name)}</td>`;
    const canAdd = i === last && !r.blank;
    return `<tr data-g="extra" data-i="${i}">${lead}${chkCells(r, 'extra', i)}
      <td class="actions"><div class="row-actions">
        <button class="icon-action-btn remove" type="button" data-rm="extra" data-i="${i}" aria-label="Remove row"${(d.extra.length === 1 && r.blank) ? ' disabled' : ''}><i data-lucide="minus"></i></button>
        ${i === last ? `<button class="icon-action-btn add" type="button" data-add aria-label="Add another recipient"${canAdd ? '' : ' disabled'}><i data-lucide="plus"></i></button>` : ''}
      </div></td></tr>`;
  }).join('');
  icons();
}
document.addEventListener('change', e => {
  const c = e.target.closest('.row-checkbox[data-g]'); if(!c) return;
  draft()[c.dataset.g][+c.dataset.i].ch[c.dataset.c] = c.checked;
});
document.addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if(rm){
    const g = rm.dataset.rm, i = +rm.dataset.i, d = draft(), tr = rm.closest('tr');
    tr.classList.add('removing');
    setTimeout(() => {
      d[g].splice(i, 1);
      if(g === 'extra' && !d.extra.length) d.extra.push(blankRow());
      renderNotif();
    }, 170);
    return;
  }
  if(e.target.closest('[data-add]')){
    const d = draft(); d.extra.push(blankRow()); renderNotif();
    const inp = $('#extraTable tbody tr:last-child input.text-input'); if(inp) inp.focus();
  }
});

/* recipient typeahead — one shared fixed panel */
const ta = document.createElement('div');
ta.className = 'dropdown-panel'; ta.hidden = true; ta.setAttribute('role', 'listbox'); document.body.appendChild(ta);
let taInput = null, taIdx = -1, taList = [];
function taClose(){ ta.hidden = true; if(taInput) taInput.setAttribute('aria-expanded', 'false'); taInput = null; }
function taRender(){
  const d = draft(), q = taInput.value.trim().toLowerCase();
  const used = new Set(d.basic.concat(d.extra).map(r => r.name));
  taList = DIRECTORY.filter(p => !used.has(p.name) && (!q || (p.name + ' ' + p.role).toLowerCase().includes(q)));
  ta.innerHTML = taList.length ? taList.map((p, i) => `
    <button type="button" role="option" class="dropdown-item person-item" data-i="${i}">
      <span class="mini-avatar">${esc(initials(p.name))}</span><span class="dd-label">${esc(p.name)}</span><span class="dd-meta">${esc(p.role)}</span></button>`).join('')
    : '<p class="dropdown-empty">No matching people.</p>';
  taIdx = taList.length ? 0 : -1; taMark();
}
function taMark(){ $$('.dropdown-item', ta).forEach((n, i) => n.classList.toggle('is-active-descendant', i === taIdx)); }
function taOpen(inp){
  closeDropdown(); taInput = inp; inp.setAttribute('aria-expanded', 'true');
  taRender(); ta.hidden = false; ta.style.visibility = 'hidden';
  positionPanel(inp, ta, 300); ta.style.visibility = '';
}
function taPick(i){
  const p = taList[i]; if(!p) return;
  const row = draft().extra[+taInput.dataset.i];
  Object.assign(row, { role:p.role, name:p.name, caps:p.caps || CHAN.slice(), blank:false, ch:{ email:false, chat:false, sms:false } });
  taClose(); renderNotif();
  const first = $$('#extraTable tbody tr:last-child .row-checkbox:not([disabled])')[0] || $$('#extraTable .row-checkbox:not([disabled])').pop();
  if(first) first.focus();
}
document.addEventListener('focusin', e => { if(e.target.matches('#extraTable input.text-input')) taOpen(e.target); });
document.addEventListener('input', e => { if(e.target.matches('#extraTable input.text-input')){ if(ta.hidden) taOpen(e.target); else { taRender(); positionPanel(taInput, ta, 300); } } });
document.addEventListener('keydown', e => {
  if(ta.hidden || !taInput || e.target !== taInput) return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); taIdx = taList.length ? (taIdx + 1) % taList.length : -1; taMark(); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); taIdx = taList.length ? (taIdx - 1 + taList.length) % taList.length : -1; taMark(); }
  else if(e.key === 'Enter'){ e.preventDefault(); taPick(taIdx); }
  else if(e.key === 'Escape'){ taClose(); }
});
ta.addEventListener('mousedown', e => e.preventDefault());
ta.addEventListener('click', e => { const it = e.target.closest('.dropdown-item'); if(it) taPick(+it.dataset.i); });
document.addEventListener('click', e => { if(!ta.hidden && !ta.contains(e.target) && e.target !== taInput) taClose(); });
document.addEventListener('scroll', e => { if(!ta.hidden && !ta.contains(e.target)) taClose(); }, true);

$('#setSave').addEventListener('click', () => {
  const a = byId(S.assetId), n = notifFor(a), d = n.draft || cloneNotif(n.saved);
  const nochan = d.extra.find(r => !r.blank && !CHAN.some(c => r.ch[c]));
  if(nochan){ window.dpToast('error', 'Pick a channel', `Choose Email, ProChat or SMS for ${nochan.name}, or remove the row.`); return; }
  d.extra = d.extra.filter(r => !r.blank); if(!d.extra.length) d.extra.push(blankRow());
  n.saved = cloneNotif(d); n.draft = cloneNotif(d); renderNotif();
  window.dpToast('success', 'Settings saved', `Alert and notification settings for ${a.id} are up to date.`);
});


/* ---------- live zone preview: shows how readings will be classified as the inputs change ---------- */
function renderZones(){
  const val = (id, dflt) => { const v = num(id); return Number.isFinite(v) && v != null ? v : dflt; };
  const min = val('psiMin', CFG.psiMin), max = val('psiMax', CFG.psiMax), above = val('tempAbove', CFG.tempAbove);
  const bar = (target, cap, right, domain, segs, labels) => {
    const [lo, hi] = domain, p = v => clamp((v - lo) / (hi - lo) * 100, 0, 100);
    $(target).innerHTML = `<div class="zones-cap"><span>${cap}</span><span>${right}</span></div>
      <div class="zbar">${segs.map(s => ({ k:s[0], w:p(s[2]) - p(s[1]) })).filter(s => s.w > 0).map(s => `<span class="z-${s.k}" style="width:${s.w}%"></span>`).join('')}</div>
      <div class="zlabels">${labels.map(l => `<span style="left:${p(l[0])}%;${l[1]}">${l[2]}</span>`).join('')}</div>`;
  };
  bar('#zonesPsi', 'Pressure zones', `<b style="color:var(--text-heading);font-weight:500">${min}–${max} PSI</b> in range`, [60, 130],
    [['crit', 60, min - 10], ['warn', min - 10, min], ['ok', min, max], ['warn', max, max + 15], ['crit', max + 15, 130]],
    [[60, '', '60'], [min, 'transform:translateX(-50%)', min], [max, 'transform:translateX(-50%)', max], [130, 'transform:translateX(-100%)', '130']]);
  const warn = CFG.tempSetpoint + above, crit = warn + 10;
  bar('#zonesTemp', 'Temperature zones', `alert at <b style="color:var(--text-heading);font-weight:500">${warn}°F</b>`, [60, 240],
    [['ok', 60, warn], ['warn', warn, crit], ['crit', crit, 240]],
    [[60, '', '60°'], [warn, 'transform:translateX(-100%);padding-right:3.75px', warn + '°'], [crit, 'padding-left:3.75px', crit + '°'], [240, 'transform:translateX(-100%)', '240°']]);
}
$$('#psiMin,#psiMax,#tempBelow,#tempAbove').forEach(i => i.addEventListener('input', renderZones));

/* ======================================================================
   live simulation + boot
   ====================================================================== */
let tick = 0, lastSig = '';
function simTick(){
  tick++;
  ASSETS.forEach(a => {
    if(a.tires[0].off) return;
    a.tires.forEach(t => {
      t.psi = clamp(t.psi + (t.base.psi - t.psi) * .12 + (Math.random() - .5) * .55, t.base.psi - 2.2, t.base.psi + 2.2);
      t.temp = clamp(t.temp + (t.base.temp - t.temp) * .12 + (Math.random() - .5) * .9, t.base.temp - 2.5, t.base.temp + 2.5);
    });
    if(a.moving) a.speedNow = clamp((a.speedNow ?? a.speed) + (Math.random() - .5) * 1.8, a.speed - 4, a.speed + 4);
  });
  const mv = ASSETS.filter(a => a.moving); if(mv.length && tick % 4 === 0) mv[(tick / 4) % mv.length | 0].updAt = Date.now();
  if(S.view === 'tmps'){
    const sig = ASSETS.map(a => assetState(a)).join() + ASSETS.map(agoText).join();
    if(sig !== lastSig){ lastSig = sig; if(!openDD) renderFleet(); }
  } else if(S.view === 'detail'){
    const a = byId(S.assetId);
    if(a.moving){ routeProg[a.id] = Math.min(.985, progOf(a) + .0006); moveHead(a); }
    updateStatusPanel();
  }
}
setInterval(simTick, 1500);

new MutationObserver(() => {
  setTiles(); updateSceneTheme();
  if(S.view === 'detail'){ renderLegend(); drawChart(); }
  if(S.view === 'tmps') renderDonut();
}).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

route();
icons();
</script>
