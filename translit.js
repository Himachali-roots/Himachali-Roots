/* ============================================================
   English letters -> Hindi (Devanagari). A simple, offline converter.
   It is a helper, not a translator: it writes the SOUNDS of what was typed in
   Devanagari, so "ghar" becomes घर. It is approximate (spelling of Pahari words
   varies), so the person can always edit the result.

   How to type:
     aa ā  -> आ / ा       ee ī  -> ई / ी       oo ū  -> ऊ / ू
     ai    -> ऐ / ै        au    -> औ / ौ
     kh gh ch chh jh th dh ph bh sh  -> ख घ च छ झ थ ध फ भ श
     For the hard sounds, put a CAPITAL letter in the MIDDLE of a word:
        T D N R  ->  ट ड ण ड़      (e.g. auNa -> औणा, pahaaRi -> पहाड़ी)
     Letters with marks also work: ṇ ṭ ḍ ṛ ś ṣ ā ī ū  (e.g. "auṇā" -> औणा)
   ============================================================ */
(function (root) {
  'use strict';

  // consonants, longest match first handled in code
  const CONS = {
    chh: 'छ', ksh: 'क्ष',
    kh: 'ख', gh: 'घ', ch: 'च', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', sh: 'श', gy: 'ज्ञ',
    Th: 'ठ', Dh: 'ढ', Rh: 'ढ़',
    k: 'क', g: 'ग', c: 'क', j: 'ज', t: 'त', d: 'द', n: 'न', p: 'प', b: 'ब', m: 'म',
    y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', f: 'फ़', z: 'ज़', q: 'क़',
    T: 'ट', D: 'ड', N: 'ण', R: 'ड़', S: 'ष', L: 'ळ',
    // letters with marks (written exactly as typed, case does not matter)
    'ṇ': 'ण', 'ṭ': 'ट', 'ḍ': 'ड', 'ṛ': 'ड़', 'ś': 'श', 'ṣ': 'ष', 'ḷ': 'ळ', 'ñ': 'ञ', 'ṅ': 'ङ',
  };
  // vowels: [independent form, matra (sign after a consonant)]
  const VOW = {
    aa: ['आ', 'ा'], ai: ['ऐ', 'ै'], au: ['औ', 'ौ'], ee: ['ई', 'ी'], ii: ['ई', 'ी'], oo: ['ऊ', 'ू'], uu: ['ऊ', 'ू'],
    a: ['अ', ''], i: ['इ', 'ि'], u: ['उ', 'ु'], e: ['ए', 'े'], o: ['ओ', 'ो'],
    'ā': ['आ', 'ा'], 'ī': ['ई', 'ी'], 'ū': ['ऊ', 'ू'],
  };
  const ACCENTED = { 'á': 'a', 'à': 'a', 'â': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'í': 'i', 'ì': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ú': 'u', 'ù': 'u' };
  const STOPS = new Set(['k', 'kh', 'g', 'gh', 'ch', 'chh', 'j', 'jh', 't', 'th', 'd', 'dh', 'p', 'ph', 'b', 'bh', 'T', 'Th', 'D', 'Dh']);

  // everyday words whose usual spelling does not follow the sound rules
  const SPECIAL = {
    mein: 'में', main: 'मैं', hain: 'हैं', nahin: 'नहीं', nahi: 'नहीं', kahin: 'कहीं', yahin: 'यहीं', wahin: 'वहीं',
    kuch: 'कुछ', accha: 'अच्छा', acha: 'अच्छा', bacha: 'बच्चा', bachche: 'बच्चे', tu: 'तू', woh: 'वह', yeh: 'यह',
    kyun: 'क्यों', kyon: 'क्यों', aaj: 'आज', kal: 'कल', mera: 'मेरा', meri: 'मेरी', tera: 'तेरा', teri: 'तेरी',
    hoon: 'हूँ', haan: 'हाँ', kahan: 'कहाँ', yahan: 'यहाँ', wahan: 'वहाँ', jahan: 'जहाँ', theek: 'ठीक', thik: 'ठीक',
    // districts and everyday Himachali words (these spellings drop sounds, so a typed sound-for-sound rule cannot get them right)
    shimla: 'शिमला', mandi: 'मंडी', kullu: 'कुल्लू', kangra: 'कांगड़ा', solan: 'सोलन', hamirpur: 'हमीरपुर', una: 'ऊना',
    bilaspur: 'बिलासपुर', chamba: 'चंबा', kinnaur: 'किन्नौर', lahaul: 'लाहौल', spiti: 'स्पीति', sirmaur: 'सिरमौर',
    himachal: 'हिमाचल', himachali: 'हिमाचली', pahadi: 'पहाड़ी', pahari: 'पहाड़ी', dham: 'धाम', dhaam: 'धाम', ghaur: 'घौर',
    daadi: 'दादी', dadi: 'दादी', naani: 'नानी', nani: 'नानी', amma: 'अम्मा', topi: 'टोपी', siddu: 'सिड्डू',
  };

  const LATIN = /\p{Script=Latin}+/gu;

  function tokenise(word) {
    // work out which letters keep their capital (hard-sound markers in the middle of a word)
    const allCaps = word.length > 1 && word === word.toUpperCase();
    const chars = Array.from(word.normalize('NFC')).map((ch, i) => {
      if (allCaps) return ch.toLowerCase();
      if (i === 0) return ch.toLowerCase();                    // a capital at the start is just a capital
      return /[TDNRSL]/.test(ch) ? ch : ch.toLowerCase();       // T D N R S L in the middle = hard sounds
    }).map((ch) => ACCENTED[ch] || ch);

    const toks = [];
    for (let i = 0; i < chars.length;) {
      const three = chars.slice(i, i + 3).join(''), two = chars.slice(i, i + 2).join(''), one = chars[i];
      if (CONS[three]) { toks.push({ t: 'C', key: three, dev: CONS[three] }); i += 3; continue; }
      if (CONS[two] && two.length === 2) { toks.push({ t: 'C', key: two, dev: CONS[two] }); i += 2; continue; }
      if (VOW[two] && two.length === 2) { toks.push({ t: 'V', key: two, v: VOW[two] }); i += 2; continue; }
      if (VOW[one]) { toks.push({ t: 'V', key: one, v: VOW[one] }); i++; continue; }
      if (CONS[one]) { toks.push({ t: 'C', key: one, dev: CONS[one] }); i++; continue; }
      if (one === 'M' || one === 'ṃ' || one === 'ṁ') { toks.push({ t: 'X', dev: 'ं' }); i++; continue; }
      if (one === 'H' || one === 'ḥ') { toks.push({ t: 'X', dev: 'ः' }); i++; continue; }
      if (one === 'x') { toks.push({ t: 'C', key: 'k', dev: 'क' }, { t: 'C', key: 's', dev: 'स' }); i++; continue; }
      toks.push({ t: 'O', dev: one }); i++;                      // anything else is left as it is
    }
    return toks;
  }

  function convertWord(word) {
    const special = SPECIAL[word.toLowerCase()];
    if (special) return special;
    const toks = tokenise(word);

    // a single final "a" or "i" after a consonant is almost always the long sound in everyday spelling (kya, ka, nahi, pani)
    const last = toks[toks.length - 1], before = toks[toks.length - 2];
    if (toks.length > 1 && last && last.t === 'V' && before && before.t === 'C') {
      if (last.key === 'a') toks[toks.length - 1] = { t: 'V', key: 'aa', v: VOW.aa };
      else if (last.key === 'i') toks[toks.length - 1] = { t: 'V', key: 'ii', v: VOW.ii };
    }

    // "a" between a consonant and another vowel is the long sound: jao -> जाओ, khao -> खाओ
    for (let i = 1; i < toks.length - 1; i++) {
      if (toks[i].t === 'V' && toks[i].key === 'a' && toks[i - 1].t === 'C' && toks[i + 1].t === 'V') toks[i] = { t: 'V', key: 'aa', v: VOW.aa };
    }

    let out = '', pending = false;                               // pending = a consonant is waiting for its vowel
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i], next = toks[i + 1], prev = toks[i - 1];
      if (tk.t === 'C') {
        // n / m before a hard or soft stop, right after a vowel, is the nasal dot: hindi -> हिंदी, chamba -> चंबा
        if ((tk.key === 'n' || tk.key === 'm') && prev && prev.t === 'V' && next && next.t === 'C' && STOPS.has(next.key)) {
          out += 'ं'; pending = false; continue;
        }
        if (pending) out += '्';                                  // two consonants together: join them (halant)
        out += tk.dev; pending = true;
      } else if (tk.t === 'V') {
        out += pending ? tk.v[1] : tk.v[0]; pending = false;
      } else if (tk.t === 'X') {
        out += tk.dev; pending = false;
      } else { out += tk.dev; pending = false; }
    }
    return out;
  }

  // Convert every run of English letters in a piece of text; Devanagari, numbers and punctuation stay as they are.
  function romanToDevanagari(text) {
    return String(text || '').replace(LATIN, (w) => convertWord(w));
  }

  const api = { romanToDevanagari, convertWord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.romanToDevanagari = romanToDevanagari;
})(typeof window !== 'undefined' ? window : globalThis);
