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
const BASE_TYPES = ['All','Word','Phrase','Song','Story','Recipe','Culture','Audio','Memory'];
const CONTRIBUTION_TYPES = ['Word','Phrase','Story','Memory','Recipe','Song','Audio','Culture'];
const AUDIO_BASE = `${SUPABASE_URL}/storage/v1/object/public/Audio-files/`;

let ENTRIES = [];
let ARCHIVE_ORDER = [];      // the entries in a random order, fixed for this visit
let homePickIds = null;      // the six cards on the home page, chosen once per visit
let ARCHIVE_STATE = 'loading';   // loading | live | error
let ARCHIVE_ERROR = '';

// ---------- Language (English / Hindi) — all Hindi wording lives in i18n.js ----------
const I18N = window.I18N || { hi: {}, js: { en: {}, hi: {} }, types: {}, districts: {} };
const LANG_KEY = 'hr_lang';
let LANG = 'en', READY = false;
const ASK_EVERY_TIME = true;   // true = ask English / Hindi every time the site is opened. false = only on a visitor's very first visit
const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const HI_TYPES = lower({ ...(I18N.words || {}), ...I18N.types }), HI_DISTRICTS = lower(I18N.districts);
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
// Old type names fold into the current ones: Lullaby -> Story, Ballad -> Song, Proverb and Riddle -> Phrase, Food -> Recipe.
const TYPE_MAP = { food: 'Recipe', recipe: 'Recipe', lullaby: 'Story', ballad: 'Song', proverb: 'Phrase', riddle: 'Phrase' };
function normType(tp){
  const v = (tp || 'Word').trim();
  return TYPE_MAP[v.toLowerCase()] || (v.charAt(0).toUpperCase() + v.slice(1));
}
// ...and the old name is kept as a small tag, so a Lullaby still says "Lullaby"
function legacyTag(tp){
  const v = String(tp || '').trim().toLowerCase();
  return ['lullaby', 'ballad', 'proverb', 'riddle'].includes(v) ? v.charAt(0).toUpperCase() + v.slice(1) : '';
}
// Older rows hold "Loki Verma · translated & romanised by Pranjal Singh" in one box: split it into artist, translator and sharer.
function parseCredit(row){
  let contributor = str(row, 'contributor_name', 'name', 'submitted_by');
  let artist = str(row, 'artist_name', 'artist'), translator = str(row, 'translator_name');
  const m = contributor.match(/^(.*?)\s*[·|]\s*translated\s*(?:&|and)?\s*romani[sz]ed\s+by\s+(.+)$/i);
  if (m){ if (!artist) artist = m[1].trim(); if (!translator) translator = m[2].trim(); contributor = translator; }
  return { contributor, artist, translator };
}
// People's names in Hindi: an exact spelling from the "_hi" column if there is one, otherwise the names list, otherwise by sound.
function nameToHindi(name){
  const n = String(name || '').trim();
  if (!n || /[\u0900-\u097f]/.test(n)) return n;
  return n.split(/\s+/).map(w => {
    const k = w.toLowerCase().replace(/[^a-z]/g, '');
    return (I18N.names || {})[k] || (window.romanToDevanagari ? window.romanToDevanagari(w) : w);
  }).join(' ');
}
const personName = (e, key) => LANG === 'hi' ? (e[key + 'Hi'] || nameToHindi(e[key])) : e[key];
const titleOf = (e) => (LANG === 'hi' && e.titleHi) ? e.titleHi : e.title;
const descriptionOf = (e) => (LANG === 'hi' && e.descriptionHi) ? e.descriptionHi : e.description;
const recipeOf = (e) => (LANG === 'hi' && e.recipeHi) ? e.recipeHi : e.recipe;
const dialectText = (e) => splitList(e.dialect).map(typeName).join(', ');
const splitList = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const splitVideos = (s) => String(s || '').split('|').map(x => x.trim()).filter(Boolean);     // several videos in one cell are separated with |
function shuffled(list){
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--){ const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}

// ---------- Live archive ----------
function normalizeRow(row, i){
  const title = str(row, 'title', 'word');
  const desc = str(row, 'translation', 'english_translation', 'meaning', 'context');
  const original = str(row, 'original_text', 'originalText');
  if (!title && !desc && !original) return null;
  const status = str(row, 'status').toLowerCase();
  if (status && !PUBLISHED.includes(status)) return null;
  const credit = parseCredit(row);
  return {
    id: `${slug(title || desc)}-${i}`,
    title: title || desc.slice(0, 40),
    trans: str(row, 'transliteration', 'romanization', 'pronunciation'),
    desc,
    descHi: str(row, 'translation_hi', 'hindi_translation', 'meaning_hi'),
    original,
    district: str(row, 'district', 'region') || 'All',
    type: normType(str(row, 'type', 'entry_type')),
    dialect: str(row, 'dialect', 'language'),
    tags: [...new Set([...splitList(str(row, 'tags')), legacyTag(str(row, 'type', 'entry_type'))].filter(Boolean))],
    description: str(row, 'description'),
    recipe: str(row, 'recipe'),
    image: str(row, 'image_url', 'imageUrl', 'picture_url'),
    video: str(row, 'video_url'),
    artist: credit.artist,
    translator: credit.translator,
    source: str(row, 'source_name'),
    titleHi: str(row, 'title_hi'),
    descriptionHi: str(row, 'description_hi'),
    recipeHi: str(row, 'recipe_hi'),
    artistHi: str(row, 'artist_name_hi'),
    contributorHi: str(row, 'contributor_name_hi'),
    sourceHi: str(row, 'source_name_hi'),
    translatorHi: str(row, 'translator_name_hi'),
    spellings: splitList(str(row, 'spellings')),
    contributor: credit.contributor,
    contributorRaw: str(row, 'contributor_name', 'name', 'submitted_by'),
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
      ARCHIVE_ORDER = shuffled(entries);
      homePickIds = null;
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
    if (h){ const txt = /^method( of preparation)?:?$/i.test(h[1].trim()) ? t('ui.recipeHeading') : h[1]; return `<h4>${inline(txt)}</h4>`; }
    if (lines.length > 1 && lines.every(l => /^\d+[.)]\s+/.test(l)))
      return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    if (lines.length > 1 && lines.every(l => /^[-*•]\s+/.test(l)))
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
function isLong(e){ return Boolean(e.original || e.description || e.recipe || e.image || e.video) || e.desc.length > 220 || (e.descHi || '').length > 220 || e.trans.length > 160; }
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
function cardText(e){ return descriptionOf(e) || descOf(e) || e.original || ''; }
function entryCardHTML(e, cls = '', style = 'position:relative'){
  const long = isLong(e);
  const tag = e.tags[0] ? ` · ${typeName(e.tags[0])}` : '';
  return `<article class="entry-card ${cls}" style="${style}">
    <p class="entry-eyebrow">${esc(typeName(e.type))}${esc(tag)} · ${esc(districtLabel(e))}</p>
    <h3 class="entry-title">${esc(titleOf(e))}</h3>
    ${!long && e.trans ? `<p class="entry-trans">${esc(e.trans)}</p>` : ''}
    <p class="entry-desc">${esc(long ? preview(cardText(e)) : descOf(e))}</p>
    ${long ? `<button class="read-more-btn" type="button" data-entry="${esc(e.id)}">${esc(t('ui.readMore'))}</button>` : ''}
    ${audioButton(e)}
  </article>`;
}
// a picture that fails to load simply disappears
function wireImages(root){
  root.querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
}

// Home: six featured cards, same light/sage rhythm and stacking as the mockup.
const FEATURE_STYLE = [['sage',1],['',2],['',6],['',7],['sage',2],['sage',4]];
const HOME_CATEGORIES = ['Word', 'Story', 'Song', 'Recipe', 'Culture', 'Phrase'];   // Phrase is 6th: the illustration covers the last card, and a short card suits that spot
function pickHome(){
  homePickIds = HOME_CATEGORIES.map(cat => {
    const pool = ENTRIES.filter(e => e.type === cat);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
  }).filter(Boolean);
}
function renderFeatured(){
  if (ARCHIVE_STATE !== 'live'){ $('card-grid').innerHTML = stateHTML(); return; }
  if (!homePickIds) pickHome();
  const picks = homePickIds.map(id => ENTRIES.find(e => e.id === id)).filter(Boolean);
  $('card-grid').innerHTML = picks.map((e, i) => {
    const [cls, z] = FEATURE_STYLE[i];
    return entryCardHTML(e, cls, `position:relative;z-index:${z}`);
  }).join('');
  wireImages($('card-grid'));
}

function renderCounts(){
  // the number of voices counts exactly as before: the name in the credit box (before any "·"), plus a song's artist
  const names = new Set(ENTRIES.flatMap(e => [e.contributorRaw.split('·')[0], e.artist]).map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
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
function modalSection(label, text, cls = ''){
  return text ? `<section class="modal-section ${cls}"><p class="eyebrow">${esc(label)}</p><div class="rt">${richText(text)}</div></section>` : '';
}
function openEntry(id){
  const e = ENTRIES.find(x => x.id === id);
  if (!e) return;
  const lines = [];
  if (e.artist) lines.push(t('ui.artist', personName(e, 'artist')));
  if (e.source) lines.push(t('ui.source', personName(e, 'source')));
  if (e.translator) lines.push(t('ui.translator', personName(e, 'translator')));
  if (e.contributor && e.contributor.toLowerCase() !== (e.translator || '').toLowerCase()) lines.push(t('ui.sharedBy', personName(e, 'contributor')));
  if (dialectText(e)) lines.push(dialectText(e));
  const tags = e.tags.length ? `<div class="modal-tags">${e.tags.map(tg => `<span class="modal-tag">${esc(typeName(tg))}</span>`).join('')}</div>` : '';
  const pic = e.image && !e.video ? `<img class="modal-pic" src="${esc(e.image)}" alt="${esc(titleOf(e))}" loading="lazy" data-fallback/>` : '';
  const vids = splitVideos(e.video).length ? `<div class="modal-videos">${splitVideos(e.video).map((v, i) => videoTag({ src: v, poster: i === 0 ? e.image : v.replace(/\.[a-z0-9]+$/i, '.webp') }, titleOf(e))).join('')}</div>` : '';
  let body;
  if (e.type === 'Recipe' && (e.description || e.recipe)){            // recipes sent through the new form
    const names = [e.trans, descOf(e)].filter(Boolean).join(' · ');
    body = `${names ? `<p class="modal-sub">${esc(names)}</p>` : ''}
      ${modalSection(t('ui.description'), descriptionOf(e))}
      ${modalSection(t('ui.recipeHeading'), recipeOf(e))}`;
  } else {
    const meaningLabel = e.type === 'Recipe' ? t('ui.description') : t('ui.translation');   // older recipes keep their text; it is labelled Description
    body = `${modalSection(t('ui.original'), e.original, 'original')}
      ${modalSection(t('ui.romanised'), e.trans, 'roman')}
      ${modalSection(meaningLabel, descOf(e))}`;
  }
  $('entry-modal-body').innerHTML = `
    <p class="entry-eyebrow">${esc(typeName(e.type))} · ${esc(districtLabel(e))}</p>
    <h2 class="modal-title" id="modal-title">${esc(titleOf(e))}</h2>
    ${lines.length ? `<p class="modal-credit">${lines.map(l => `<span>${esc(l)}</span>`).join('')}</p>` : ''}
    ${tags}
    ${e.audio ? `<button class="audio-btn-inline" type="button" data-audio-id="${esc(e.id)}-full" data-audio-src="${esc(e.audio)}">${esc(t('ui.play'))}</button>` : ''}
    ${pic}
    ${vids}
    ${body}`;
  wireImages($('entry-modal-body'));
  $('entry-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('entry-modal').querySelector('.entry-modal-scroll').scrollTop = 0;
}
function closeEntry(){
  document.querySelectorAll('#entry-modal-body video').forEach(v => v.pause());     // a video must not keep playing after the pop-up closes
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
document.addEventListener('click', (ev) => {
  const plc = ev.target.closest('[data-place]');
  if (plc && !ev.target.closest('a')){ const [s, si, i] = plc.dataset.place.split(':'); openPlace(s, +si, +i); return; }
  const mb = ev.target.closest('[data-placemore]');
  if (mb){                                                                    // "Show more" / "Show fewer"
    const key = mb.dataset.placemore, on = !placeExpanded[key], sec = mb.closest('.place-section');
    placeExpanded[key] = on;
    sec.querySelectorAll('.place-extra').forEach(el => { el.hidden = !on; });
    mb.textContent = on ? t('d.showLess') : t('d.showMore', sec.querySelectorAll('.place-extra').length);
    mb.setAttribute('aria-expanded', String(on));
    return;
  }
  const ga = ev.target.closest('[data-gscroll]');
  if (ga){ const s = document.querySelector('#district-gallery .gallery-strip'); s.scrollBy({ left: +ga.dataset.gscroll * Math.max(240, s.clientWidth * 0.75), behavior: 'smooth' }); return; }
  const gal = ev.target.closest('[data-gallery]');
  if (gal){ const [s, i] = gal.dataset.gallery.split(':'); openGalleryPhoto(s, +i); return; }
  const chip = ev.target.closest('[data-dtype]');
  if (!chip) return;
  districtType = chip.dataset.dtype;
  renderDistrictEntries(DISTRICT_BY_SLUG[parseHash().route.slice(9)]);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('entry-modal').hidden) closeEntry();
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-place],[data-gallery]')){ ev.preventDefault(); ev.target.click(); }
});

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
  const filtered = ARCHIVE_ORDER.filter(e => inDistrict(e, district) && sameType(e, type));
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

const slugOf = (name) => String(name).toLowerCase().replace(/&/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const DISTRICT_BY_SLUG = Object.fromEntries(DISTRICTS.map(d => [slugOf(d), d]));
let districtType = 'All', districtShown = '';
const pickLang = (o) => (o && ((LANG === 'hi' && o.hi) ? o.hi : o.en)) || '';
const placePics = (p) => (p.photos && p.photos.length) ? p.photos : (p.photo ? [p.photo] : []);
const placeVideos = (p) => p.videos || [];                                    // [{ src: 'images/....mp4', poster: 'images/....webp' }]
const placeCover = (p) => placePics(p)[0] || (placeVideos(p)[0] || {}).poster || '';
const videoTag = (v, title) => `<video controls playsinline preload="metadata"${v.poster ? ` poster="${esc(v.poster)}"` : ''} src="${esc(v.src)}" aria-label="${esc(title || '')}"></video>`;

function renderDistricts(){
  $('districts-grid').innerHTML = DISTRICTS.map((d, i) => {
    const count = ENTRIES.filter(e => districtsOf(e).some(x => x.toLowerCase() === d.toLowerCase())).length;
    return `<a class="district-card" href="#district/${slugOf(d)}">
      <div class="d-top"><span class="d-num">${String(i + 1).padStart(2, '0')}</span><span>→</span></div>
      <h2>${esc(districtName(d))}</h2>
      <p class="d-count">${ARCHIVE_STATE !== 'live' ? '&nbsp;' : esc(count ? t('districts.count', count) : t('districts.none'))}</p>
    </a>`;
  }).join('');
}

// A district can have several groups of places: the first is "Locals' favourites", the others (like "Beyond Shimla city") follow it.
function placeSections(info){
  const out = [];
  if ((info.places || []).length) out.push({ eyebrow: null, intro: info.placesIntro, places: info.places });
  (info.extraSections || []).forEach(s => { if ((s.places || []).length) out.push(s); });
  return out;
}
const PLACES_SHOWN = 6;              // places shown at first; the rest open under "Show more"
const placeOrders = {};              // each group is shuffled once per visit and keeps that order
const placeExpanded = {};            // which groups have "Show more" opened
function placeOrder(key, places){
  if (!placeOrders[key]){
    const withPhoto = [], without = [];
    places.forEach((p, i) => (placeCover(p) ? withPhoto : without).push(i));
    placeOrders[key] = [...shuffled(withPhoto), ...shuffled(without)];     // places with photos first, each part in random order
  }
  return placeOrders[key];
}
function placeTileHTML(slug, si, p, i, pick, extra, hide){
  const pics = placePics(p), vids = placeVideos(p), cover = placeCover(p), open = pics.length > 1 || vids.length || pick(p.about) || pick(p.memory);
  const badge = [pics.length > 1 ? t('d.photos', pics.length) : '', vids.length ? '▶ ' + t('d.videos', vids.length) : ''].filter(Boolean).join(' · ');
  return `<article class="place-tile${open ? ' has-more' : ''}${extra ? ' place-extra' : ''}"${hide ? ' hidden' : ''}${open ? ` data-place="${esc(slug)}:${si}:${i}" role="button" tabindex="0" aria-label="${esc(pick(p.name))}"` : ''}>
      <div class="place-photo">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" style="object-position:${esc(p.photoPos || 'center')}" data-fallback/>` : ''}</div>
      <div class="place-scrim"></div>
      ${badge ? `<span class="place-count">${esc(badge)}</span>` : ''}
      <div class="place-body">
        ${p.kind ? `<span class="place-kind">${esc(typeName(p.kind))}</span>` : ''}
        <h3 class="place-name">${esc(pick(p.name))}</h3>
        ${pick(p.line) ? `<p class="place-line">${esc(pick(p.line))}</p>` : ''}
        ${p.map ? `<a class="place-map" href="${esc(p.map)}" target="_blank" rel="noopener noreferrer">${esc(t('d.maps'))} ↗</a>` : ''}
      </div></article>`;
}
function placeSectionHTML(slug, si, sec, pick){
  const key = `${slug}:${si}`, order = placeOrder(key, sec.places), total = order.length, open = !!placeExpanded[key];
  const tiles = order.map((i, pos) => placeTileHTML(slug, si, sec.places[i], i, pick, pos >= PLACES_SHOWN, pos >= PLACES_SHOWN && !open)).join('');
  const more = total > PLACES_SHOWN
    ? `<div class="place-more"><button type="button" class="btn-ghost place-more-btn" data-placemore="${esc(key)}" aria-expanded="${open}">${esc(open ? t('d.showLess') : t('d.showMore', total - PLACES_SHOWN))}</button></div>` : '';
  const eyebrow = sec.eyebrow ? pick(sec.eyebrow) : t('d.places');
  const intro = pick(sec.intro) || (si === 0 ? t('d.placesIntro') : '');
  return `<div class="inner-wrap place-section">
    <p class="eyebrow">${esc(eyebrow)}</p>
    ${intro ? `<h2 class="district-h2 serif">${esc(intro)}</h2>` : ''}
    <div class="place-grid">${tiles}</div>${more}</div>`;
}

// The picture strip: each photo is a little tilted print that fades in as it comes into view
const TILTS = [-1.8, 1.4, -0.8, 1.9, -1.3, 0.9, -1.6, 1.1];
const LIFTS = [12, -4, 18, 2, 10, -6, 16, 0];
function initGallery(){
  const strip = document.querySelector('#district-gallery .gallery-strip');
  if (!strip) return;
  const cards = [...strip.querySelectorAll('.polaroid')];
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) cards.forEach(c => c.classList.add('in'));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach(en => { if (en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    cards.forEach(c => io.observe(c));
  }
  const prev = document.querySelector('#district-gallery .gallery-arrow.prev'), next = document.querySelector('#district-gallery .gallery-arrow.next');
  const arrows = () => { if (prev) prev.disabled = strip.scrollLeft < 8; if (next) next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 8; };
  strip.addEventListener('scroll', arrows, { passive: true }); arrows();
}

// One page for every district: banner photo, what makes the place special, local favourites, then the archive entries from there.
function renderDistrictPage(slug){
  const name = DISTRICT_BY_SLUG[slug];
  if (!name){ location.hash = 'districts'; return; }
  if (districtShown !== slug){ districtType = 'All'; districtShown = slug; }
  const info = (window.DISTRICT_INFO || {})[slug] || {};
  const pick = (o) => (o && ((LANG === 'hi' && o.hi) ? o.hi : o.en)) || '';
  const dName = districtName(name);

  $('district-back').textContent = t('d.back');
  $('district-eyebrow').textContent = t('d.eyebrow');
  $('district-title').textContent = dName;
  $('district-tagline').textContent = pick(info.tagline);
  $('district-hero-bg').innerHTML = info.banner ? `<img src="${esc(info.banner)}" alt="" style="object-position:${esc(info.bannerPos || 'center')}" data-fallback/>` : '';
  const credit = $('district-credit');
  credit.hidden = !info.credit; credit.textContent = info.credit ? `${t('d.photo')}: ${info.credit}` : '';

  $('district-about').innerHTML = `<div class="inner-wrap">
    <p class="eyebrow">${esc(t('d.about'))}</p>
    <p class="district-about-text">${esc(pick(info.about) || t('d.noAbout'))}</p></div>`;

  const sections = placeSections(info), box = $('district-places');
  box.hidden = !sections.length;
  box.innerHTML = sections.map((sec, si) => placeSectionHTML(slug, si, sec, pick)).join('');

  // pictures of the town itself, as a strip of little prints
  const gal = info.gallery || [], gbox = $('district-gallery');
  gbox.hidden = !gal.length;
  gbox.innerHTML = gal.length ? `<div class="inner-wrap">
    <p class="eyebrow">${esc(t('d.photosEyebrow'))}</p>
    <h2 class="district-h2 serif">${esc(pick(info.galleryTitle) || t('d.gallery', dName))}</h2></div>
    <div class="gallery-wrap">
      <button type="button" class="gallery-arrow prev" data-gscroll="-1" aria-label="${esc(t('d.prev'))}">‹</button>
      <div class="gallery-strip">${gal.map((g, i) => `<figure class="polaroid" style="--tilt:${TILTS[i % TILTS.length]}deg;--lift:${LIFTS[i % LIFTS.length]}px;--i:${i}" data-gallery="${esc(slug)}:${i}" role="button" tabindex="0">
        <span class="tape" aria-hidden="true"></span>
        <div class="polaroid-photo"><img src="${esc(g.photo)}" alt="${esc(pick(g.caption))}" loading="lazy" data-fallback/></div>
        ${pick(g.caption) ? `<figcaption>${esc(pick(g.caption))}</figcaption>` : ''}</figure>`).join('')}</div>
      <button type="button" class="gallery-arrow next" data-gscroll="1" aria-label="${esc(t('d.next'))}">›</button>
    </div>` : '';
  initGallery();

  renderDistrictEntries(name);
  wireImages($('page-district'));
}
function renderDistrictEntries(name){
  const host = $('district-entries'), dName = districtName(name);
  if (ARCHIVE_STATE !== 'live'){ host.innerHTML = `<div class="inner-wrap"><div class="district-state">${stateHTML()}</div></div>`; return; }
  const mine = ARCHIVE_ORDER.filter(e => districtsOf(e).some(x => x.toLowerCase() === name.toLowerCase()));
  const kinds = BASE_TYPES.filter(tp => tp !== 'All' && mine.some(e => e.type === tp));
  const shown = mine.filter(e => districtType === 'All' || e.type === districtType);
  host.innerHTML = `<div class="inner-wrap">
    <p class="eyebrow">${esc(t('d.fromArchive'))}</p>
    <h2 class="district-h2 serif">${esc(t('d.entries', dName))}</h2>
    ${mine.length ? `<div class="type-filter" id="district-chips">${['All', ...kinds].map(tp => `<button type="button" class="${tp === districtType ? 'active' : ''}" data-dtype="${esc(tp)}">${esc(tp === 'All' ? t('ui.all') : typeName(tp))}</button>`).join('')}</div>` : ''}
    ${shown.length
      ? `<div class="grid-2" id="district-grid">${shown.map(e => entryCardHTML(e)).join('')}</div>`
      : `<div class="archive-empty"><h2>${esc(t('d.emptyTitle', dName))}</h2><p>${esc(t('d.emptyBody'))}</p></div>`}
    <div class="district-actions">
      <a class="btn-terra" href="#archive?district=${encodeURIComponent(name)}">${esc(t('d.seeArchive'))}</a>
      <a class="btn-ghost" href="#submissions?district=${encodeURIComponent(name)}">${esc(t('d.share', dName))}</a>
    </div></div>`;
  wireImages(host);
}

// Opens the pop-up for a place (or for one picture of the town): the first photo, the text, a personal memory, then the other photos
function openPhotos(o){
  const paras = String(o.about || '').split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  const pics = o.pics || [], img = (src) => `<img src="${esc(src)}" alt="${esc(o.title)}" loading="lazy" data-fallback/>`;
  $('entry-modal-body').innerHTML = `
    ${o.kind ? `<p class="entry-eyebrow">${esc(typeName(o.kind))}</p>` : ''}
    <h2 class="modal-title" id="modal-title">${esc(o.title)}</h2>
    ${o.line ? `<p class="modal-sub">${esc(o.line)}</p>` : ''}
    ${pics[0] ? `<div class="modal-gallery first">${img(pics[0])}</div>` : ''}
    ${paras ? `<div class="place-about">${paras}</div>` : ''}
    ${o.memory ? `<blockquote class="place-memory"><p class="eyebrow">${esc(t('d.memory'))}</p><p>${esc(o.memory)}</p></blockquote>` : ''}
    ${(o.videos || []).length ? `<div class="modal-videos">${o.videos.map(v => videoTag(v, o.title)).join('')}</div>` : ''}
    ${o.map ? `<p><a class="place-map dark" href="${esc(o.map)}" target="_blank" rel="noopener noreferrer">${esc(t('d.maps'))} ↗</a></p>` : ''}
    ${pics.length > 1 ? `<div class="modal-gallery">${pics.slice(1).map(img).join('')}</div>` : ''}`;
  wireImages($('entry-modal-body'));
  $('entry-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('entry-modal').querySelector('.entry-modal-scroll').scrollTop = 0;
}
function openPlace(slug, si, i){
  const sec = placeSections((window.DISTRICT_INFO || {})[slug] || {})[si], p = sec && sec.places[i];
  if (p) openPhotos({ title: pickLang(p.name), kind: p.kind, line: pickLang(p.line), about: pickLang(p.about), memory: pickLang(p.memory), map: p.map, pics: placePics(p), videos: placeVideos(p) });
}
function openGalleryPhoto(slug, i){
  const g = (((window.DISTRICT_INFO || {})[slug] || {}).gallery || [])[i];
  if (g) openPhotos({ title: pickLang(g.caption) || districtName(DISTRICT_BY_SLUG[slug]), pics: [g.photo] });
}

// Words people type around the one they want ("what is me in pahari") are ignored. "me" and "i" are real words, so they are kept.
const SEARCH_FILLER = new Set(['what','whats','is','are','was','the','a','an','in','on','of','to','how','do','does','you','say','said','mean','meaning','means','word','words','for','called','call','pahari','himachali','hindi','english','translation','translate','definition','dictionary','tell','please']);
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u093c]/g, '').replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim();   // ignores accents, capitals and the Devanagari dot

// "Sound" of a word, whichever script it is written in: ama, amma, ammaa and अम्मा all give the same key.
const hasDev = (s) => /[\u0900-\u097f]/.test(s);
const devLoose = (s) => String(s || '').normalize('NFC')
  .replace(/\u093c/g, '').replace(/\u0901/g, '\u0902')                                   // the dot under a letter, chandrabindu
  .replace(/(\p{Script=Devanagari})\u094d\1/gu, '$1')                                      // doubled letter: म्म -> म
  .replace(/\u0940/g, '\u093f').replace(/\u0942/g, '\u0941').replace(/\u0948/g, '\u0947').replace(/\u094c/g, '\u094b')   // long and short vowel signs count the same
  .replace(/\u0923/g, '\u0928').replace(/\u0933/g, '\u0932').replace(/\u0937/g, '\u0936')   // ण/न, ळ/ल, ष/श
  .replace(/\s+/g, ' ').trim();
const toDev = (s) => hasDev(s) ? s : (window.romanToDevanagari ? window.romanToDevanagari(s) : s);
const soundKey = (s) => devLoose(toDev(String(s || '')));

function entryKeys(e){
  if (e._k) return e._k;
  const names = [e.title, e.trans, ...e.spellings].filter(Boolean);
  e._k = {
    title: fold(e.title), roman: fold(e.trans), alias: e.spellings.map(fold),
    meaning: fold(e.desc), hindi: fold(e.descHi),
    extra: fold([e.original, e.description, e.type, e.tags.join(' '), e.district].join(' ')),
    sound: new Set(names.map(soundKey).filter(Boolean)),
    soundWords: new Set(names.flatMap(x => x.split(/[\s,;/।]+/)).map(soundKey).filter(Boolean)),
  };
  return e._k;
}

// Returns three groups, best first: exact matches, then the same sound spelled differently, then looser mentions.
function searchEntries(raw){
  const empty = { exact: [], similar: [], related: [] };
  const typed = fold(raw).split(' ').filter(Boolean);
  let q = typed.filter(w => !SEARCH_FILLER.has(w));
  if (!q.length) q = typed;
  if (!q.length) return empty;
  const whole = q.join(' '), qSounds = q.map(soundKey), wholeSound = soundKey(whole);
  const words = (s) => s.split(' ').filter(Boolean), out = { exact: [], similar: [], related: [] };
  const bump = (e, s) => s + ((e.type === 'Word' || e.type === 'Phrase') ? 6 : 0) - (isLong(e) ? 5 : 0);
  for (const e of ARCHIVE_ORDER){
    const K = entryKeys(e);
    const nameWords = [...words(K.title), ...words(K.roman), ...K.alias.flatMap(words)];
    const meanWords = [...words(K.meaning), ...words(K.hindi)];
    // 1. every word typed is a whole word of the entry, or of its meaning
    if (q.every(tok => nameWords.includes(tok) || meanWords.includes(tok))){
      let s = 50 * q.length + 10 * q.filter(tok => nameWords.includes(tok)).length;
      if ([K.title, K.roman, ...K.alias].includes(whole)) s += 100;
      if (K.meaning === whole || K.hindi === whole) s += 90;
      out.exact.push({ e, s: bump(e, s) }); continue;
    }
    // 2. same sound, different spelling
    if (qSounds.every(s => s && K.soundWords.has(s)) || (wholeSound.length >= 3 && K.sound.has(wholeSound))){
      out.similar.push({ e, s: bump(e, 60) }); continue;
    }
    // 3. looser: starts with it, contains it, or mentions it in the text
    let ok = true, sc = 0;
    for (const tok of q){
      let s = 0;
      if (tok.length >= 3 && [...nameWords, ...meanWords].some(w => w.startsWith(tok))) s = 20;
      else if (tok.length >= 3 && [K.title, K.roman, K.meaning, K.hindi].some(x => x.includes(tok))) s = 8;
      else if (tok.length >= 3 && K.extra.includes(tok)) s = 4;
      if (!s){ ok = false; break; }
      sc += s;
    }
    if (ok) out.related.push({ e, s: bump(e, sc) });
  }
  for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => b.s - a.s).map(x => x.e);
  return out;
}

function renderDictionary(query){
  const q = (query || '').trim();
  const phraseSection = document.querySelector('.phrase-section');
  if (ARCHIVE_STATE !== 'live'){
    $('dict-results-label').textContent = q ? t('dict.matching') : t('dict.start');
    $('dict-grid').innerHTML = stateHTML();
    phraseSection.style.display = 'none';
    return;
  }
  let html = '', total = 0;
  if (q){
    const r = searchEntries(q);
    const group = (label, list) => list.length ? `<h3 class="dict-group" style="grid-column:1/-1">${esc(label)} <span>${list.length}</span></h3>${list.map(e => entryCardHTML(e)).join('')}` : '';
    html = group(t('dict.groupExact'), r.exact) + group(t('dict.groupSimilar'), r.similar) + group(t('dict.groupRelated'), r.related);
    total = r.exact.length + r.similar.length + r.related.length;
  } else {
    const shortOnes = ARCHIVE_ORDER.filter(e => (e.type === 'Word' || e.type === 'Phrase') && !isLong(e));
    const list = (shortOnes.length ? shortOnes : ARCHIVE_ORDER.filter(e => !isLong(e))).slice(0, 6);
    html = list.map(e => entryCardHTML(e)).join(''); total = list.length;
  }
  $('dict-results-label').textContent = q ? t('dict.matching') : t('dict.start');
  $('dict-grid').innerHTML = total ? html
    : `<div class="archive-empty" style="grid-column:1/-1"><h2>${esc(t('dict.noTitle'))}</h2><p>${esc(t('dict.noBody'))}</p><a href="#submissions" class="btn-terra" style="margin-top:18px;display:inline-flex">${esc(t('dict.noBtn'))}</a></div>`;
  wireImages($('dict-grid'));
  // "Common phrases" = entries whose type is Phrase in Supabase; hidden if there are none.
  const phrases = ENTRIES.filter(e => e.type.toLowerCase() === 'phrase');
  phraseSection.style.display = phrases.length ? '' : 'none';
  $('phrase-grid').innerHTML = phrases.map(e => `<article class="phrase-card">
      <p class="p-word">${esc(titleOf(e))}</p>
      ${e.trans ? `<p class="p-roman">${esc(e.trans)}</p>` : ''}
      <p class="p-meaning">${esc(descOf(e))}</p>
      ${e.audio ? `<button class="audio-btn-inline" type="button" data-audio-id="${esc(e.id)}-phrase" data-audio-src="${esc(e.audio)}">${esc(t('ui.play'))}</button>` : ''}
    </article>`).join('');
}

// ---------- Submissions ----------
const LIMITS = { short: 100, long: 5000 };          // words
const MAX_AUDIO_MB = 25, MAX_IMAGE_MB = 10;
const IMAGE_BUCKET = 'Pictures';
const STORY_TAGS = ['Lullaby', 'Folk tale', 'Legend', 'Bedtime story'];

// Every box a form can show. "label", "ph" and hints are keys into i18n.js.
const FIELD = {
  title:        { name: 'title',           kind: 'input', label: 'f.title', ph: 'f.titlePh', req: true },
  tags:         { name: 'tags',            kind: 'tags',  label: 'f.tags' },
  artist:       { name: 'artist_name',     kind: 'input', label: 'f.artist' },
  translator:   { name: 'translator_name', kind: 'input', label: 'f.translator' },
  source:       { name: 'source_name',     kind: 'input', label: 'f.source' },
  hindi:        { name: 'original_text',   kind: 'text',  label: 'f.hindi', convert: true, rows: 3 },
  roman:        { name: 'transliteration', kind: 'text',  label: 'f.roman', hint: 'f.romanHint', rows: 2 },
  english:      { name: 'translation',     kind: 'text',  label: 'f.english', req: true, rows: 3 },
  hindiMeaning: { name: 'translation_hi',  kind: 'text',  label: 'f.hindiMeaning', rows: 2 },
  context:      { name: 'context',         kind: 'text',  label: 'f.context', ph: 'f.contextPh', rows: 3 },
  description:  { name: 'description',     kind: 'text',  label: 'f.description', ph: 'f.descriptionPh', req: true, rows: 4 },
  recipe:       { name: 'recipe',          kind: 'text',  label: 'f.recipe', ph: 'f.recipePh', req: true, rows: 6 },
  audio:        { name: 'audio',           kind: 'file',  label: 'f.audio', accept: 'audio/*' },
  audioReq:     { name: 'audio',           kind: 'file',  label: 'f.audioReq', accept: 'audio/*', req: true },
  image:        { name: 'image',           kind: 'file',  label: 'f.image', accept: 'image/*' },
};
// What each kind of contribution asks for, in order. (District, dialect, village and "About you" are the same for all.)
const FORMS = {
  Word:    { limit: 'short', hindi: 'word',   english: 'word',   fields: ['hindi', 'roman', 'english', 'hindiMeaning', 'audio', 'image'] },
  Phrase:  { limit: 'short', hindi: 'phrase', english: 'word',   fields: ['hindi', 'roman', 'english', 'hindiMeaning', 'context', 'audio', 'image'] },
  Story:   { limit: 'long',  hindi: 'long',   english: 'long',   fields: ['title', 'tags', 'hindi', 'roman', 'english', 'context', 'audio', 'image'] },
  Memory:  { limit: 'long',  hindi: 'long',   english: 'long',   fields: ['title', 'hindi', 'roman', 'english', 'context', 'audio', 'image'] },
  Recipe:  { limit: 'long',  hindi: 'recipe', english: 'recipe', fields: ['hindi', 'roman', 'english', 'description', 'recipe', 'image'] },
  Song:    { limit: 'long',  hindi: 'long',   english: 'long',   fields: ['title', 'artist', 'translator', 'hindi', 'roman', 'english', 'context', 'audio', 'image'] },
  Audio:   { limit: 'long',  hindi: 'long',   english: 'long',   fields: ['title', 'hindi', 'roman', 'english', 'context', 'audioReq', 'image'] },
  Culture: { limit: 'long',  hindi: 'long',   english: 'long',   fields: ['title', 'source', 'hindi', 'roman', 'english', 'context', 'audio', 'image'] },
};
let formType = 'Word', beforeConvert = null;

const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
function limitFor(name){
  if (name === 'translation_hi') return LIMITS.short;
  if (name === 'description' || name === 'recipe') return LIMITS.long;
  return LIMITS[FORMS[formType].limit];
}

// On computers some boxes sit side by side (two columns); the others use the full width
const HALF = {
  Word: ['hindi', 'roman', 'english', 'hindiMeaning', 'audio', 'image'],
  Phrase: ['hindi', 'roman', 'english', 'hindiMeaning', 'audio', 'image'],
  Story: ['audio', 'image'],
  Memory: ['audio', 'image'],
  Recipe: ['hindi', 'roman'],
  Song: ['artist', 'translator', 'audio', 'image'],
  Audio: ['audioReq', 'image'],
  Culture: ['title', 'source', 'audio', 'image'],
};

function fieldHTML(key){
  const f = FIELD[key], cfg = FORMS[formType];
  const half = (HALF[formType] || []).includes(key) ? ' half' : '';
  const label = `${esc(t(f.label))}${f.req ? ' <b>*</b>' : ''}`;
  const ph = f.ph ? ` placeholder="${esc(t(f.ph))}"` : '', req = f.req ? ' required' : '';
  const none = '<span class="field-hint empty"></span>';
  if (f.kind === 'tags')
    return `<div class="field-block${half}"><span class="field-label">${label}</span>${none}
      <div class="tag-row">${STORY_TAGS.map(tg => `<button type="button" class="tag-chip" data-tag="${esc(tg)}" aria-pressed="false">${esc(typeName(tg))}</button>`).join('')}</div><span class="field-extra"></span></div>`;
  if (f.kind === 'input')
    return `<label class="field-block${half}"><span class="field-label">${label}</span>${none}<input class="field" name="${f.name}"${ph}${req} autocomplete="off"/><span class="field-extra"></span></label>`;
  if (f.kind === 'file')
    return `<label class="field-block${half}"><span class="field-label">${label}</span>${none}<input class="field" name="${f.name}" type="file" accept="${f.accept}"${req}/><span class="field-extra"></span></label>`;
  let hint = f.hint ? t(f.hint) : '';
  if (key === 'hindi') hint = t('f.hindiHint.' + cfg.hindi);
  if (key === 'english') hint = t('f.englishHint.' + cfg.english);
  const convert = f.convert ? `
      <div class="convert-row"><button type="button" class="convert-btn" data-convert>${esc(t('f.convert'))}</button><button type="button" class="convert-undo" data-undo hidden>${esc(t('f.undo'))}</button></div>
      <p class="field-hint small">${esc(t('f.convertTip'))}</p>
      <p class="convert-note" data-note hidden>${esc(t('f.convertNote'))}</p>` : '';
  return `<div class="field-block${half}" data-field="${f.name}">
      <label class="field-label" for="f-${f.name}">${label}</label>
      ${hint ? `<p class="field-hint">${esc(hint)}</p>` : '<p class="field-hint empty"></p>'}
      <textarea class="field" id="f-${f.name}" name="${f.name}" rows="${f.rows || 3}"${ph}${req}></textarea>
      <div class="field-extra"><div class="field-meta"><span class="word-count" data-count="${f.name}"></span></div>${convert}</div>
    </div>`;
}

// Switching the kind of entry, or the language, redraws the boxes — keep whatever has already been typed or chosen.
function captureFields(){
  const saved = { text: {}, files: {}, tags: [] };
  document.querySelectorAll('#contribution-fields input[name], #contribution-fields textarea[name]').forEach(el => {
    if (el.type === 'file'){ if (el.files && el.files[0]) saved.files[el.name] = el.files[0]; }
    else saved.text[el.name] = el.value;
  });
  document.querySelectorAll('#contribution-fields .tag-chip.active').forEach(b => saved.tags.push(b.dataset.tag));
  return saved;
}
function restoreFields(saved){
  document.querySelectorAll('#contribution-fields input[name], #contribution-fields textarea[name]').forEach(el => {
    if (el.type === 'file'){
      const f = saved.files[el.name];
      if (f){ try { const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files; } catch (e) {} }
    } else if (saved.text[el.name] !== undefined) el.value = saved.text[el.name];
  });
  document.querySelectorAll('#contribution-fields .tag-chip').forEach(b => {
    const on = saved.tags.includes(b.dataset.tag);
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  });
}
function renderContributionFields(type){
  const box = $('contribution-fields');
  const saved = box.dataset.type ? captureFields() : { text: {}, files: {}, tags: [] };
  formType = FORMS[type] ? type : 'Word';
  box.dataset.type = formType;
  box.innerHTML = FORMS[formType].fields.map(k => fieldHTML(k)).join('');
  restoreFields(saved);
  updateCounts();
}
function updateCounts(){
  document.querySelectorAll('#contribution-fields [data-count]').forEach(span => {
    const el = document.querySelector(`#contribution-fields [name="${span.dataset.count}"]`);
    const n = wordCount(el ? el.value : ''), lim = limitFor(span.dataset.count);
    span.textContent = t('f.words', n, lim);
    span.classList.toggle('over', n > lim);
  });
}

// "Convert English letters to Hindi" — uses translit.js (works offline, approximate)
function convertHindiField(){
  const ta = document.querySelector('#contribution-fields [name="original_text"]');
  if (!ta) return;
  let source = ta.value;
  if (!source.trim()){                                           // nothing typed here yet: use the Romanised box
    const rm = document.querySelector('#contribution-fields [name="transliteration"]');
    if (rm && rm.value.trim()) source = rm.value;
  }
  if (!source.trim()) return;
  beforeConvert = ta.value;
  ta.value = window.romanToDevanagari ? window.romanToDevanagari(source) : source;
  const holder = ta.closest('.field-block');
  holder.querySelector('[data-note]').hidden = false; holder.querySelector('[data-undo]').hidden = false;
  updateCounts();
}
function undoConvert(){
  const ta = document.querySelector('#contribution-fields [name="original_text"]');
  if (!ta || beforeConvert === null) return;
  ta.value = beforeConvert; beforeConvert = null;
  const holder = ta.closest('.field-block');
  holder.querySelector('[data-note]').hidden = true; holder.querySelector('[data-undo]').hidden = true;
  updateCounts();
}

// ----- sending -----
class SubmitError extends Error { constructor(message, details){ super(message); this.details = details || ''; } }

async function explain(res, what){            // turn a failed Supabase answer into a readable reason
  let text = ''; try { text = await res.text(); } catch (e) {}
  let msg = text;
  try { const j = JSON.parse(text); msg = [j.message || j.error, j.details, j.hint].filter(Boolean).join(' — ') + (j.code ? ` (${j.code})` : ''); } catch (e) {}
  return `${what}: HTTP ${res.status} ${msg}`.trim();
}
function friendlyReason(status, why){
  if (/column/i.test(why) && /(find|exist)/i.test(why)) return t('sub.errColumn');
  if (status === 401 || status === 403 || /row-level security|42501|permission/i.test(why)) return t('sub.errPermission');
  return t('sub.errSend');
}
function showFormError(message, details){
  const err = $('form-error');
  err.innerHTML = `<span>${esc(message)}</span>` + (details ? `<details class="err-details"><summary>${esc(t('sub.details'))}</summary><pre>${esc(details)}</pre></details>` : '');
  err.hidden = false;
  err.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function uploadFile(bucket, file){
  const ext = ((file.name.split('.').pop() || 'bin').toLowerCase()).replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `submissions/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const problems = [];
  for (const headers of HEADER_VARIANTS){
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
    } catch (err){ problems.push(`Upload to "${bucket}": network error (${err.message})`); break; }
    if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    problems.push(await explain(res, `Upload to "${bucket}"`));
    if (res.status !== 401 && res.status !== 403) break;         // only try the other key style when this one was refused
  }
  throw new SubmitError('', problems.join('\n'));
}

// Phone photos are big: shrink to at most 1600px (JPEG) before sending.
async function shrinkImage(file, maxDim = 1600, quality = 0.85){
  if (!/^image\//.test(file.type) || /gif|svg/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 700 * 1024) return file;
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name.replace(/\.\w+$/, '') || 'photo') + '.jpg', { type: 'image/jpeg' });
  } catch (e) { return file; }
}

async function postSubmission(payload){
  const problems = []; let lastStatus = 0, lastWhy = '';
  for (const table of SUBMISSION_TABLES){
    for (const headers of HEADER_VARIANTS){
      let res;
      try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
      } catch (err){ problems.push(`Table "${table}": network error (${err.message})`); lastWhy = String(err.message); break; }
      if (res.ok) return;
      lastStatus = res.status; lastWhy = await explain(res, `Table "${table}"`); problems.push(lastWhy);
      console.warn('[Himachali Roots] Submission failed —', lastWhy);
      if (res.status === 404) break;                              // table not found: try the other spelling
      if (res.status !== 401 && res.status !== 403) throw new SubmitError(friendlyReason(res.status, lastWhy), problems.join('\n'));
    }
  }
  throw new SubmitError(friendlyReason(lastStatus, lastWhy), problems.join('\n'));
}

function initSubmissionsPage(){
  const chipGrid = $('type-chip-grid');
  if (chipGrid.dataset.filled) return;
  chipGrid.innerHTML = CONTRIBUTION_TYPES.map((tp, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-type="${tp}">${esc(typeName(tp))}</button>`).join('');
  chipGrid.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    chipGrid.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderContributionFields(btn.dataset.type);
  });
  chipGrid.dataset.filled = '1';
  const sel = $('sub-district');
  DISTRICTS.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = districtName(d); sel.appendChild(o); });

  const box = $('contribution-fields');
  renderContributionFields('Word');
  box.addEventListener('input', updateCounts);
  box.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.tag-chip');
    if (chip){ chip.classList.toggle('active'); chip.setAttribute('aria-pressed', String(chip.classList.contains('active'))); return; }
    if (ev.target.closest('[data-convert]')){ convertHindiField(); return; }
    if (ev.target.closest('[data-undo]')) undoConvert();
  });

  const form = $('submission-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('submit-btn'); $('form-error').hidden = true;
    const fd = new FormData(form);
    const val = (k) => String(fd.get(k) || '').trim();
    const cfg = FORMS[formType];
    // checks the browser cannot do by itself
    for (const key of cfg.fields){
      const f = FIELD[key]; if (f.kind !== 'text') continue;
      const lim = limitFor(f.name);
      if (wordCount(val(f.name)) > lim){ showFormError(t('f.over', lim)); box.querySelector(`[name="${f.name}"]`).focus(); return; }
    }
    if (['Word', 'Phrase', 'Recipe'].includes(formType) && !val('original_text') && !val('transliteration')){ showFormError(t('f.errHindiOrRoman')); return; }
    const audioFile = fd.get('audio'), imageFile = fd.get('image');
    if (audioFile && audioFile.size > MAX_AUDIO_MB * 1024 * 1024){ showFormError(t('f.errAudioBig', MAX_AUDIO_MB)); return; }
    btn.disabled = true; btn.textContent = t('sub.sending');
    try {
      let audio_url = '', image_url = '';
      if (audioFile && audioFile.size){
        try { audio_url = await uploadFile('Audio-files', audioFile); }
        catch (e){ throw new SubmitError(t('sub.errUpload'), e.details || e.message); }
      }
      if (imageFile && imageFile.size){
        try {
          const small = await shrinkImage(imageFile);
          if (small.size > MAX_IMAGE_MB * 1024 * 1024) throw new SubmitError(t('f.errImageBig', MAX_IMAGE_MB));
          image_url = await uploadFile(IMAGE_BUCKET, small);
        } catch (e){ throw (e instanceof SubmitError && e.message) ? e : new SubmitError(t('sub.errImage'), e.details || e.message); }
      }
      const tags = [...box.querySelectorAll('.tag-chip.active')].map(b => b.dataset.tag).join(', ');
      const firstLine = (s) => s.split('\n')[0].trim().slice(0, 120);
      const title = val('title') || firstLine(val('original_text')) || firstLine(val('transliteration')) || firstLine(val('translation'));
      const all = {
        type: formType, district: val('district'), dialect: val('dialect'), village: val('village'),
        title, original_text: val('original_text'), transliteration: val('transliteration'), translation: val('translation'),
        translation_hi: val('translation_hi'), context: val('context'), description: val('description'), recipe: val('recipe'),
        artist_name: val('artist_name'), translator_name: val('translator_name'), source_name: val('source_name'), tags, audio_url, image_url,
        contributor_name: val('contributor_name'), contributor_email: val('contributor_email'), contributor_connection: val('contributor_connection'),
        status: 'pending',
      };
      // only send what was actually filled in
      await postSubmission(Object.fromEntries(Object.entries(all).filter(([, v]) => v !== '')));
      form.reset();
      chipGrid.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === 0));
      box.dataset.type = ''; renderContributionFields('Word');
      $('submission-form-wrap').style.display = 'none';
      $('submission-thanks').style.display = 'block';
      window.scrollTo(0, 0);
    } catch (e){
      showFormError(e.message || t('sub.errSend'), e.details);
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
  setActiveNav(target.id === 'page-district' ? 'districts' : target.id.replace('page-', ''));
}
const ROUTE_TITLES = { home: 'doc.title', archive: 'doc.titleArchive', districts: 'doc.titleDistricts', dictionary: 'doc.titleDictionary', submissions: 'doc.titleSubmit', about: 'doc.titleAbout' };
function setDocTitle(route){
  if (route.startsWith('district/')){
    const nm = DISTRICT_BY_SLUG[route.slice(9)];
    if (nm){ document.title = t('doc.titleDistrict', districtName(nm)); return; }
  }
  document.title = t(ROUTE_TITLES[route] || 'doc.title');
}
let lastRoute = null;
function router(){
  const { route, params } = parseHash();
  setDocTitle(route);
  closeEntry();
  showPage(route.startsWith('district/') ? 'district' : route);
  if (route.startsWith('district/')) renderDistrictPage(route.slice(9));
  if (route === 'archive'){ renderArchive(params); wireImages($('archive-grid')); }
  if (route === 'districts') renderDistricts();
  if (route === 'dictionary') renderDictionary($('dict-search').value);
  if (route === 'submissions') {
    initSubmissionsPage();
    const dd = params.get('district');                                  // coming from a district page: that district is pre-selected
    if (dd && DISTRICTS.includes(dd)) $('sub-district').value = dd;
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
  const box = $('contribution-fields');
  if (box && box.dataset.type) renderContributionFields(box.dataset.type);
}
function applyLang(l){
  LANG = l === 'hi' ? 'hi' : 'en';
  const root = document.documentElement;
  root.lang = LANG; root.classList.toggle('lang-hi', LANG === 'hi');
  if (LANG === 'hi') loadHindiFonts();
  setDocTitle(parseHash().route);
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
  document.querySelectorAll('.dist-menu a[data-d]').forEach(a => {
    if (a.dataset.en === undefined) a.dataset.en = a.textContent;
    a.textContent = LANG === 'hi' ? districtName(a.dataset.d) : a.dataset.en;
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
