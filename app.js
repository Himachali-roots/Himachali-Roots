/* Himachali Roots — site script.
   Layout/behaviour is the approved mockup. Every entry, phrase and count on the
   site comes from the Supabase "Entries" table — there is no built-in sample data. */

// ---------- Supabase ----------
const SUPABASE_URL = 'https://evsmrehmwbtgcwvcigrb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ul0lAuJtt2RZ1f1g-WC85g_eQ4F14xt';
const ENTRY_TABLES = ['Entries', 'entries'];
const SUBMISSION_TABLES = ['submissions', 'Submissions'];
// Publishable keys go in the apikey header. Some projects also expect it as a Bearer
// token, so the second variant is tried if the first is rejected.
const HEADER_VARIANTS = [
  { apikey: SUPABASE_KEY },
  { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
];
const PUBLISHED = ['approved', 'published', 'live'];

// ---------- Static data ----------
const DISTRICTS = ['Shimla','Mandi','Kullu','Kangra','Solan','Hamirpur','Una','Bilaspur','Chamba','Kinnaur','Lahaul & Spiti','Sirmaur'];
const BASE_TYPES = ['All','Word','Phrase','Song','Ballad','Story','Culture','Food','Audio','Memory','Proverb','Riddle','Lullaby'];
const CONTRIBUTION_TYPES = ['Word','Phrase','Story','Memory','Recipe','Song','Audio','Culture'];
const AUDIO_BASE = `${SUPABASE_URL}/storage/v1/object/public/Audio-files/`;

let ENTRIES = [];
let ARCHIVE_STATE = 'loading';   // loading | live | error
let ARCHIVE_ERROR = '';

// ---------- Language (English / Hindi) — all Hindi wording lives in i18n.js ----------
const I18N = window.I18N || { hi: {}, js: { en: {}, hi: {} }, types: {}, districts: {} };
const LANG_KEY = 'hr_lang';
let LANG = 'en', READY = false;
const ASK_EVERY_TIME = true;   // true = ask English / Hindi every time the site is opened. false = only on a visitor's very first visit
const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const HI_TYPES = lower(I18N.types), HI_DISTRICTS = lower(I18N.districts);
function t(key, ...args){
  let v = (I18N.js[LANG] || {})[key];
  if (v === undefined) v = I18N.js.en[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(...args) : v;
}
const typeName = (tp) => LANG === 'hi' ? (HI_TYPES[String(tp).toLowerCase()] || tp) : tp;
const districtName = (d) => LANG === 'hi' ? (HI_DISTRICTS[String(d).toLowerCase()] || d) : d;
const descOf = (e) => (LANG === 'hi' && e.descHi) ? e.descHi : e.desc;   // Hindi meaning if the table has one
function storedLang(){ try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; } }
function saveLang(l){ try { localStorage.setItem(LANG_KEY, l); } catch (e) {} }

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function str(row, ...keys){
  for (const k of keys){ const v = row[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}
function slug(s){ return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,60) || 'entry'; }
function isAllDistricts(d){ return !d || /^all( districts)?$/i.test(d.trim()); }
function districtsOf(e){ return isAllDistricts(e.district) ? ['All'] : e.district.split(',').map(s => s.trim()).filter(Boolean); }
function districtLabel(e){ return isAllDistricts(e.district) ? t('ui.allDistricts') : districtsOf(e).map(districtName).join(t('ui.and')); }
function inDistrict(e, d){
  if (d === 'All') return true;
  const ds = districtsOf(e);
  return ds.includes('All') || ds.some(x => x.toLowerCase() === d.toLowerCase());
}
function sameType(e, t){ return t === 'All' || e.type.toLowerCase() === t.toLowerCase(); }
function normType(t){
  const v = (t || 'Word').trim();
  if (/^recipes?$/i.test(v)) return 'Food'; // Recipe was merged into Food
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// ---------- Live archive ----------
function normalizeRow(row, i){
  const title = str(row, 'title', 'word');
  const desc = str(row, 'translation', 'english_translation', 'meaning', 'context');
  const original = str(row, 'original_text', 'originalText');
  if (!title && !desc && !original) return null;
  const status = str(row, 'status').toLowerCase();
  if (status && !PUBLISHED.includes(status)) return null;
  return {
    id: `${slug(title || desc)}-${i}`,
    title: title || desc.slice(0, 40),
    trans: str(row, 'transliteration', 'romanization', 'pronunciation'),
    desc,
    descHi: str(row, 'translation_hi', 'hindi_translation', 'meaning_hi'),
    original,
    district: str(row, 'district', 'region') || 'All',
    type: normType(str(row, 'type', 'entry_type')),
    dialect: str(row, 'dialect', 'tags', 'language'),
    contributor: str(row, 'contributor_name', 'name', 'submitted_by'),
    audio: str(row, 'audio_url', 'audioUrl', 'pronunciation_url'),
  };
}

async function fetchRows(){
  let lastError = 'unknown error';
  for (const table of ENTRY_TABLES){
    for (const headers of HEADER_VARIANTS){
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*`, { headers });
        if (!res.ok){ lastError = `${table}: HTTP ${res.status} ${await res.text().catch(()=> '')}`; continue; }
        const rows = await res.json();
        if (Array.isArray(rows)) return { table, rows };
        lastError = `${table}: unexpected response`;
      } catch (err){ lastError = `${table}: ${err.message}`; }
    }
  }
  throw new Error(lastError);
}

async function loadArchive(){
  try {
    const { table, rows } = await fetchRows();
    const entries = rows.map(normalizeRow).filter(Boolean);
    if (!rows.length){
      ARCHIVE_STATE = 'error';
      ARCHIVE_ERROR = `Supabase answered, but the "${table}" table gave back no rows. If the table has entries, its Row Level Security is hiding them from the public — add a read (SELECT) policy for the anon role.`;
    } else if (!entries.length){
      ARCHIVE_STATE = 'error';
      ARCHIVE_ERROR = `"${table}" has ${rows.length} row(s), but none have a published status. Only rows whose status is empty, "approved", "published" or "live" are shown.`;
    } else {
      ENTRIES = entries;
      ARCHIVE_STATE = 'live';
      console.info(`[Himachali Roots] Loaded ${entries.length} entries from "${table}" (${rows.length - entries.length} hidden by status).`);
    }
  } catch (err){
    ARCHIVE_STATE = 'error';
    ARCHIVE_ERROR = `Could not reach Supabase: ${err.message}`;
  }
  if (ARCHIVE_STATE === 'error') console.warn('[Himachali Roots] ' + ARCHIVE_ERROR);
  document.documentElement.dataset.archive = ARCHIVE_STATE;
  renderShared();
  router();
}

// Shown in place of cards while loading, or if the archive can't be read.
function stateHTML(){
  if (ARCHIVE_STATE === 'loading')
    return `<div class="archive-state" style="grid-column:1/-1"><p class="archive-state-title">${esc(t('ui.loading'))}</p></div>`;
  return `<div class="archive-state" style="grid-column:1/-1">
    <p class="archive-state-title">${esc(t('ui.errTitle'))}</p>
    <p class="archive-state-detail">${esc(ARCHIVE_ERROR)}</p>
  </div>`;
}

// ---------- Rich text for songs, stories and recipes ----------
function inline(s){ return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function richText(text){
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const h = lines.length === 1 && lines[0].match(/^#{2,4}\s+(.*)/);
    if (h) return `<h4>${inline(h[1])}</h4>`;
    if (lines.length > 1 && lines.every(l => /^\d+[.)]\s+/.test(l)))
      return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    if (lines.length > 1 && lines.every(l => /^[-*•]\s+/.test(l)))
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
function isLong(e){ return Boolean(e.original) || e.desc.length > 220 || (e.descHi || '').length > 220 || e.trans.length > 160; }
function preview(text, max = 150){
  const flat = (text || '').replace(/^#{1,4}\s+.*$/gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, '') + '…' : flat;
}

// ---------- Cards ----------
function audioButton(e){
  return e.audio
    ? `<button class="audio-btn" type="button" data-audio-id="${esc(e.id)}" data-audio-src="${esc(e.audio)}" aria-label="${esc(t('ui.playAria'))}">▶</button>`
    : '';
}
function entryCardHTML(e, cls = '', style = 'position:relative'){
  const long = isLong(e);
  return `<article class="entry-card ${cls}" style="${style}">
    <p class="entry-eyebrow">${esc(typeName(e.type))} · ${esc(districtLabel(e))}</p>
    <h3 class="entry-title">${esc(e.title)}</h3>
    ${!long && e.trans ? `<p class="entry-trans">${esc(e.trans)}</p>` : ''}
    <p class="entry-desc">${esc(long ? preview(descOf(e) || e.original) : descOf(e))}</p>
    ${long ? `<button class="read-more-btn" type="button" data-entry="${esc(e.id)}">${esc(t('ui.readMore'))}</button>` : ''}
    ${audioButton(e)}
  </article>`;
}

// Home: six featured cards, same light/sage rhythm and stacking as the mockup.
const FEATURE_STYLE = [['sage',1],['',2],['',6],['',7],['sage',2],['sage',4]];
function renderFeatured(){
  if (ARCHIVE_STATE !== 'live'){ $('card-grid').innerHTML = stateHTML(); return; }
  const withAudio = ENTRIES.filter(e => e.audio);
  const rest = ENTRIES.filter(e => !e.audio);
  const picks = [...withAudio, ...rest].slice(0, 6);
  $('card-grid').innerHTML = picks.map((e, i) => {
    const [cls, z] = FEATURE_STYLE[i];
    return entryCardHTML(e, cls, `position:relative;z-index:${z}`);
  }).join('');
}

function renderCounts(){
  const names = new Set(ENTRIES.map(e => e.contributor.split('·')[0].trim().toLowerCase()).filter(Boolean));
  const n = ARCHIVE_STATE === 'live' ? (names.size || ENTRIES.length) : '—';
  $('counter-num').textContent = n;
  $('footer-count').textContent = n;
  alignCounter();
}

// On phones the number and its label sit side by side: put the middle of the label level with the middle of the number's digits.
// (Georgia's numerals hang below the baseline, so this is measured from the real glyphs rather than guessed.)
function alignCounter(){
  const num = $('counter-num'), label = document.querySelector('.counter-label');
  if (!num || !label) return;
  label.style.transform = '';
  if (!isPhoneHero()) return;                       // desktop stacks the label under the number
  const ctx = alignCounter.ctx || (alignCounter.ctx = document.createElement('canvas').getContext('2d'));
  const cs = getComputedStyle(num);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = ctx.measureText(num.textContent.trim() || '0');
  if (m.fontBoundingBoxAscent === undefined) return;
  const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
  const lineH = parseFloat(cs.lineHeight) || (asc + desc);
  const baseline = (lineH - (asc + desc)) / 2 + asc;                       // from the top of the line box
  const inkCentre = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  label.style.transform = `translateY(${(inkCentre - lineH / 2).toFixed(1)}px)`;   // label is centred on the line box; nudge to the glyphs
}
function renderShared(){ renderFeatured(); renderCounts(); }

// ---------- Detail view ----------
function openEntry(id){
  const e = ENTRIES.find(x => x.id === id);
  if (!e) return;
  const credit = [e.contributor && t('ui.sharedBy', e.contributor), e.dialect].filter(Boolean).join(' · ');
  const meaningLabel = e.type === 'Food' ? t('ui.recipe') : t('ui.translation');
  $('entry-modal-body').innerHTML = `
    <p class="entry-eyebrow">${esc(typeName(e.type))} · ${esc(districtLabel(e))}</p>
    <h2 class="modal-title" id="modal-title">${esc(e.title)}</h2>
    ${credit ? `<p class="modal-credit">${esc(credit)}</p>` : ''}
    ${e.audio ? `<button class="audio-btn-inline" type="button" data-audio-id="${esc(e.id)}-full" data-audio-src="${esc(e.audio)}">${esc(t('ui.play'))}</button>` : ''}
    ${e.original ? `<section class="modal-section original"><p class="eyebrow">${esc(t('ui.original'))}</p><div class="rt">${richText(e.original)}</div></section>` : ''}
    ${e.trans ? `<section class="modal-section roman"><p class="eyebrow">${esc(t('ui.romanised'))}</p><div class="rt">${richText(e.trans)}</div></section>` : ''}
    ${descOf(e) ? `<section class="modal-section"><p class="eyebrow">${meaningLabel}</p><div class="rt">${richText(descOf(e))}</div></section>` : ''}`;
  $('entry-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('entry-modal').querySelector('.entry-modal-scroll').scrollTop = 0;
}
function closeEntry(){
  $('entry-modal').hidden = true;
  if ($('lang-gate').hidden) document.body.classList.remove('modal-open');   // keep the page locked while the language popup is up
}

// ---------- Audio (one player shared across the site) ----------
let activeAudio = null, activeBtn = null, activeId = null;
function resetBtn(btn){
  if (!btn) return;
  if (btn.classList.contains('audio-btn-inline')) btn.textContent = t('ui.play');
  else { btn.textContent = '▶'; btn.style.paddingLeft = '3px'; }
}
function stopAudio(){ if (activeAudio) activeAudio.pause(); resetBtn(activeBtn); activeAudio = activeBtn = activeId = null; }
function toggleAudio(id, src, btn){
  if (activeId === id){ stopAudio(); return; }
  stopAudio();
  const audio = new Audio(src);
  activeAudio = audio; activeBtn = btn; activeId = id;
  if (btn.classList.contains('audio-btn-inline')) btn.textContent = t('ui.pause');
  else { btn.textContent = '❚❚'; btn.style.paddingLeft = '0px'; }
  const p = audio.play();
  if (p && p.catch) p.catch(() => { if (activeId === id) stopAudio(); });
  audio.addEventListener('ended', () => { if (activeId === id) stopAudio(); });
}

document.addEventListener('click', (ev) => {
  const langBtn = ev.target.closest('[data-set-lang]');
  if (langBtn){ chooseLang(langBtn.dataset.setLang); return; }
  const audioBtn = ev.target.closest('[data-audio-src]');
  if (audioBtn){ toggleAudio(audioBtn.dataset.audioId, audioBtn.dataset.audioSrc, audioBtn); return; }
  const more = ev.target.closest('[data-entry]');
  if (more){ openEntry(more.dataset.entry); return; }
  if (ev.target.closest('[data-close-modal]')) closeEntry();
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('entry-modal').hidden) closeEntry(); });

// ---------- Hero ----------
// Background photos come from backgrounds.js — add or remove files there, no code changes needed.
const BG = Object.assign({ desktop: [], mobile: [], seconds: 6 }, window.HERO_BACKGROUNDS || {});
const isPhoneHero = () => window.matchMedia('(max-width:860px) and (max-aspect-ratio:1/1)').matches;
const heroBox = $('hero-photos');
let heroMode = null, heroTimer = null, heroIdx = 0;
const heroSrc = (p) => /^data:/.test(p) ? p : encodeURI(p);

function buildHero(){
  const mode = isPhoneHero() ? 'mobile' : 'desktop';
  if (mode === heroMode) return;
  heroMode = mode; heroIdx = 0; clearInterval(heroTimer);
  const other = mode === 'mobile' ? 'desktop' : 'mobile';
  const list = (BG[mode].length ? BG[mode] : BG[other]).filter(Boolean);   // fall back to the other list if one is empty
  heroBox.innerHTML = '';
  list.forEach((path, i) => {
    const img = document.createElement('img');
    img.className = 'hero-photo'; img.alt = ''; img.decoding = 'async';
    img.style.opacity = i === 0 ? 1 : 0;
    if (i === 0){ img.src = heroSrc(path); img.fetchPriority = 'high'; } else img.dataset.src = heroSrc(path);
    img.addEventListener('error', () => {            // a wrong file name just skips that photo
      console.warn('[Himachali Roots] Background photo not found:', path);
      img.remove();
      const left = [...heroBox.children];
      if (left.length && !left.some(x => x.style.opacity === '1')) left[0].style.opacity = 1;
    });
    heroBox.appendChild(img);
  });
  // the first photo loads straight away; the rest load once the page is ready
  const loadRest = () => heroBox.querySelectorAll('img[data-src]').forEach(i => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
  if (document.readyState === 'complete') loadRest(); else window.addEventListener('load', loadRest, { once: true });
  if (list.length > 1) heroTimer = setInterval(() => {
    const imgs = [...heroBox.querySelectorAll('img')];
    if (imgs.length < 2) return;
    imgs.forEach(i => i.style.opacity = 0);
    heroIdx = (heroIdx + 1) % imgs.length;
    imgs[heroIdx].style.opacity = 1;
  }, Math.max(2, Number(BG.seconds) || 6) * 1000);
}
buildHero();
window.addEventListener('resize', buildHero);
$('hero-scroll').addEventListener('click', () => $('featured').scrollIntoView({ behavior: 'smooth' }));

// ---------- Pages ----------
function parseHash(){
  const [route, qs] = location.hash.replace(/^#/, '').split('?');
  return { route: route || 'home', params: new URLSearchParams(qs || '') };
}
function setActiveNav(route){
  document.querySelectorAll('.nav-link[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
}
function typeList(){
  const extra = [...new Set(ENTRIES.map(e => e.type))].filter(t => !BASE_TYPES.some(b => b.toLowerCase() === t.toLowerCase()));
  return [...BASE_TYPES, ...extra];
}
function archiveHash(p){ return `archive${p.toString() ? '?' + p.toString() : ''}`; }

function renderArchive(params){
  const district = params.get('district') || 'All';
  const type = params.get('type') || 'All';
  const filtered = ENTRIES.filter(e => inDistrict(e, district) && sameType(e, type));
  const bar = $('archive-active-filters');
  bar.innerHTML = (district !== 'All' ? `<button class="chip-x" data-remove="district">${esc(districtName(district))} ✕</button>` : '')
                + (type !== 'All' ? `<button class="chip-x" data-remove="type">${esc(typeName(type))} ✕</button>` : '');
  bar.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = () => {
    const p = new URLSearchParams(location.hash.split('?')[1] || '');
    p.delete(btn.dataset.remove);
    location.hash = archiveHash(p);
  });
  const typeBar = $('archive-type-filter');
  typeBar.innerHTML = typeList().map(tp => `<button class="${tp.toLowerCase() === type.toLowerCase() ? 'active' : ''}" data-type="${esc(tp)}">${esc(typeName(tp))}</button>`).join('');
  typeBar.querySelectorAll('[data-type]').forEach(btn => btn.onclick = () => {
    const p = new URLSearchParams();
    if (district !== 'All') p.set('district', district);
    if (btn.dataset.type !== 'All') p.set('type', btn.dataset.type);
    location.hash = archiveHash(p);
  });
  if (ARCHIVE_STATE !== 'live'){ $('archive-count').textContent = ''; $('archive-grid').innerHTML = stateHTML(); return; }
  $('archive-count').textContent = t('archive.count', filtered.length, district !== 'All' ? districtName(district) : '', type !== 'All' ? typeName(type) : '');
  $('archive-grid').innerHTML = filtered.length
    ? filtered.map(e => entryCardHTML(e)).join('')
    : `<div class="archive-empty" style="grid-column:1/-1"><h2>${esc(t('archive.emptyTitle', district !== 'All' ? districtName(district) : ''))}</h2><p>${esc(t('archive.emptyBody'))}</p><a href="#submissions" class="btn-terra" style="margin-top:18px;display:inline-flex">${esc(t('archive.emptyBtn'))}</a></div>`;
}

function renderDistricts(){
  $('districts-grid').innerHTML = DISTRICTS.map((d, i) => {
    const count = ENTRIES.filter(e => districtsOf(e).some(x => x.toLowerCase() === d.toLowerCase())).length;
    return `<a class="district-card" href="#archive?district=${encodeURIComponent(d)}">
      <div class="d-top"><span class="d-num">${String(i + 1).padStart(2, '0')}</span><span>→</span></div>
      <h2>${esc(districtName(d))}</h2>
      <p class="d-count">${ARCHIVE_STATE !== 'live' ? '&nbsp;' : esc(count ? t('districts.count', count) : t('districts.none'))}</p>
    </a>`;
  }).join('');
}

function renderDictionary(query){
  const q = (query || '').trim().toLowerCase();
  const phraseSection = document.querySelector('.phrase-section');
  if (ARCHIVE_STATE !== 'live'){
    $('dict-results-label').textContent = q ? t('dict.matching') : t('dict.start');
    $('dict-grid').innerHTML = stateHTML();
    phraseSection.style.display = 'none';
    return;
  }
  const results = q
    ? ENTRIES.filter(e => `${e.title} ${e.trans} ${e.desc} ${e.original} ${e.district} ${e.type}`.toLowerCase().includes(q))
    : ENTRIES.filter(e => !isLong(e)).slice(0, 6);
  $('dict-results-label').textContent = q ? t('dict.matching') : t('dict.start');
  $('dict-grid').innerHTML = results.length
    ? results.map(e => entryCardHTML(e)).join('')
    : `<div class="archive-empty" style="grid-column:1/-1"><h2>${esc(t('dict.noTitle'))}</h2><p>${esc(t('dict.noBody'))}</p><a href="#submissions" class="btn-terra" style="margin-top:18px;display:inline-flex">${esc(t('dict.noBtn'))}</a></div>`;
  // "Common phrases" = entries whose type is Phrase in Supabase; hidden if there are none.
  const phrases = ENTRIES.filter(e => e.type.toLowerCase() === 'phrase');
  phraseSection.style.display = phrases.length ? '' : 'none';
  $('phrase-grid').innerHTML = phrases.map(e => `<article class="phrase-card">
      <p class="p-word">${esc(e.title)}</p>
      ${e.trans ? `<p class="p-roman">${esc(e.trans)}</p>` : ''}
      <p class="p-meaning">${esc(descOf(e))}</p>
      ${e.audio ? `<button class="audio-btn-inline" type="button" data-audio-id="${esc(e.id)}-phrase" data-audio-src="${esc(e.audio)}">${esc(t('ui.play'))}</button>` : ''}
    </article>`).join('');
}

// ---------- Submissions ----------
async function uploadRecording(file){
  const ext = (file.name.split('.').pop() || 'm4a').toLowerCase();
  const path = `submissions/${Date.now()}_audio.${ext}`;
  for (const headers of HEADER_VARIANTS){
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/Audio-files/${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: file,
    });
    if (res.ok) return AUDIO_BASE + path;
  }
  throw new Error(t('sub.errUpload'));
}

async function postSubmission(full){
  // If the submissions table doesn't have every column, retry with the core fields only.
  const core = ['type','district','dialect','title','translation','context','contributor_name','status'];
  const minimal = Object.fromEntries(core.map(k => [k, full[k]]));
  for (const table of SUBMISSION_TABLES){
    for (const body of [full, minimal]){
      for (const headers of HEADER_VARIANTS){
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(body),
        });
        if (res.ok) return;
        console.warn(`[Himachali Roots] Submission to "${table}" failed`, res.status, await res.text().catch(() => ''));
      }
    }
  }
  throw new Error(t('sub.errSend'));
}

function initSubmissionsPage(){
  const chipGrid = $('type-chip-grid');
  if (chipGrid.dataset.filled) return;
  chipGrid.innerHTML = CONTRIBUTION_TYPES.map((tp, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-type="${tp}">${esc(typeName(tp))}</button>`).join('');
  chipGrid.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    chipGrid.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
  chipGrid.dataset.filled = '1';
  const sel = $('sub-district');
  DISTRICTS.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = districtName(d); sel.appendChild(o); });

  const form = $('submission-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('form-error'), btn = $('submit-btn');
    err.hidden = true;
    const fd = new FormData(form);
    const val = (k) => String(fd.get(k) || '').trim();
    btn.disabled = true; btn.textContent = t('sub.sending');
    try {
      const file = fd.get('audio');
      const audio_url = file && file.size ? await uploadRecording(file) : '';
      await postSubmission({
        type: chipGrid.querySelector('button.active')?.dataset.type || 'Word',
        district: val('district'), dialect: val('dialect'), village: val('village'),
        title: val('title'), original_text: val('original_text'), transliteration: val('transliteration'),
        translation: val('translation'), context: val('context'), memory: '',
        contributor_name: val('contributor_name'), contributor_email: val('contributor_email'),
        contributor_connection: val('contributor_connection'), audio_url, status: 'pending',
      });
      form.reset();
      $('submission-form-wrap').style.display = 'none';
      $('submission-thanks').style.display = 'block';
      window.scrollTo(0, 0);
    } catch (e){
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = t('sub.submitBtn');
    }
  });
}

// ---------- Router ----------
function showPage(route){
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const target = $(`page-${route}`) || $('page-home');
  target.style.display = target.id === 'page-home' ? '' : 'block';
  setActiveNav(target.id.replace('page-', ''));
}
let lastRoute = null;
function router(){
  const { route, params } = parseHash();
  closeEntry();
  showPage(route);
  if (route === 'archive') renderArchive(params);
  if (route === 'districts') renderDistricts();
  if (route === 'dictionary') renderDictionary($('dict-search').value);
  if (route === 'submissions') {
    initSubmissionsPage();
    if (lastRoute !== 'submissions'){ $('submission-form-wrap').style.display = ''; $('submission-thanks').style.display = 'none'; }
  }
  if (route !== lastRoute && route !== 'archive') window.scrollTo(0, 0);
  lastRoute = route;
}

// ---------- Nav ----------
const nav = $('sitenav');
const navLinks = $('nav-links');
const navToggle = $('nav-toggle');
const distWrap = document.querySelector('.dist-wrap');
const isPhoneNav = () => window.matchMedia('(max-width:860px)').matches;

// On phones the menu opens under the header and pushes the whole page down by its height.
function syncMenuHeight(){
  const open = nav.classList.contains('menu-open') && isPhoneNav();
  navLinks.style.maxHeight = open ? navLinks.scrollHeight + 'px' : '';
  document.body.style.paddingTop = open ? navLinks.scrollHeight + 'px' : '';
}
function setMenu(open){
  nav.classList.toggle('menu-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  if (!open) distWrap.classList.remove('open');
  syncMenuHeight();
  if (open) nav.style.transform = 'translateY(0)';
}
navToggle.addEventListener('click', () => setMenu(!nav.classList.contains('menu-open')));
distWrap.querySelector('button.nav-link').addEventListener('click', (e) => {
  e.preventDefault();
  distWrap.classList.toggle('open');
  requestAnimationFrame(syncMenuHeight);          // panel grows/shrinks, so the page follows
});
document.querySelectorAll('.nav-links a, .dist-menu a, .nav-about-m').forEach(a => a.addEventListener('click', () => setMenu(false)));
window.addEventListener('resize', () => { if (!isPhoneNav()) setMenu(false); else syncMenuHeight(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setMenu(false); });

let lastY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (nav.classList.contains('menu-open')) { lastY = y; return; }   // never hide the header while the menu is open
  nav.style.transform = (y < 80 || y < lastY) ? 'translateY(0)' : 'translateY(-100%)';
  lastY = y;
}, { passive: true });

// ---------- Language switching ----------
const HI_FONTS = 'https://fonts.googleapis.com/css2?family=Hind:wght@400;500;600;700&family=Kalam:wght@400;700&family=Khand:wght@500;600&family=Rozha+One&family=Tiro+Devanagari+Hindi:ital@0;1&display=swap';
function loadHindiFonts(){            // only downloaded when Hindi is actually used
  if ($('hi-fonts')) return;
  const l = document.createElement('link'); l.id = 'hi-fonts'; l.rel = 'stylesheet'; l.href = HI_FONTS;
  document.head.appendChild(l);
  if (document.fonts) document.fonts.addEventListener('loadingdone', alignCounter);
}
function relabelForm(){               // the Submit form builds its chips and district list itself
  const chips = $('type-chip-grid');
  chips.querySelectorAll('button[data-type]').forEach(b => b.textContent = typeName(b.dataset.type));
  const sel = $('sub-district');
  [...sel.options].forEach(o => { if (o.value) o.textContent = districtName(o.value); });
}
function applyLang(l){
  LANG = l === 'hi' ? 'hi' : 'en';
  const root = document.documentElement;
  root.lang = LANG; root.classList.toggle('lang-hi', LANG === 'hi');
  if (LANG === 'hi') loadHindiFonts();
  document.title = t('doc.title');
  document.querySelectorAll('[data-i18n]').forEach(el => {            // English is whatever index.html says; remember it so we can switch back
    if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
    const hi = I18N.hi[el.dataset.i18n];
    el.innerHTML = (LANG === 'hi' && hi !== undefined) ? hi : el.dataset.en;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    if (el.dataset.enPh === undefined) el.dataset.enPh = el.getAttribute('placeholder') || '';
    const hi = I18N.hi[el.dataset.i18nPh];
    el.setAttribute('placeholder', (LANG === 'hi' && hi !== undefined) ? hi : el.dataset.enPh);
  });
  document.querySelectorAll('.dist-menu a[href^="#archive?district="]').forEach(a => {
    if (a.dataset.en === undefined) a.dataset.en = a.textContent;
    const raw = decodeURIComponent(a.getAttribute('href').split('district=')[1]);
    a.textContent = LANG === 'hi' ? districtName(raw) : a.dataset.en;
  });
  const tg = $('lang-toggle'); tg.textContent = t('lang.toggle'); tg.setAttribute('aria-label', t('lang.toggleAria'));
  document.querySelectorAll('[data-set-lang]').forEach(b => b.classList.toggle('active', b.dataset.setLang === LANG));
  relabelForm();
  if (READY){ renderShared(); router(); syncMenuHeight(); }          // redraw everything the script builds itself
}
const gate = $('lang-gate');
function showGate(last){
  loadHindiFonts();                    // the popup itself shows Hindi text
  gate.querySelectorAll('.lang-opt').forEach(b => {      // mark the language they picked last time
    const isLast = b.dataset.setLang === last;
    b.classList.toggle('is-last', isLast);
    b.querySelector('.lang-last').hidden = !isLast;
  });
  gate.hidden = false; document.body.classList.add('modal-open');
  const card = gate.querySelector('.lang-gate-card'); card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true });
}
function chooseLang(l){
  saveLang(l); applyLang(l);
  gate.hidden = true; document.body.classList.remove('modal-open');
}
$('lang-toggle').addEventListener('click', () => chooseLang(LANG === 'hi' ? 'en' : 'hi'));

// ---------- Start ----------
const urlLang = new URLSearchParams(location.search).get('lang');          // e.g. yoursite.com/?lang=hi opens Hindi with no question
const linkLang = (urlLang === 'hi' || urlLang === 'en') ? urlLang : null;
const lastLang = storedLang();                                              // what they chose on a previous visit
if (linkLang) saveLang(linkLang);
applyLang(linkLang || lastLang || 'en');                                    // the page behind the popup starts in their last language
if (!linkLang && (ASK_EVERY_TIME || !lastLang)) showGate(lastLang);
// download the Hindi fonts quietly once the page is idle, so switching language later is instant
if ('requestIdleCallback' in window) requestIdleCallback(loadHindiFonts, { timeout: 4000 }); else setTimeout(loadHindiFonts, 2500);
window.addEventListener('hashchange', router);
$('dict-search').addEventListener('input', (e) => renderDictionary(e.target.value));
renderShared();
router();
READY = true;
loadArchive();
