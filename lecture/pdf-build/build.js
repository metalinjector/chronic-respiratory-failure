// Build HTML for the lecture PDF (pass 1: with page markers; pass 2: with TOC page numbers)
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const katex = require('katex');
const cheerio = require('cheerio');

const LEC = path.resolve(__dirname, '..');            // lecture markdown directory
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '_lecture.html')); // must live next to node_modules/
const PAGES = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null; // {idx: page}
const PASS2 = !!PAGES;

const order = ['00-vvedenie.md']
  .concat(fs.readdirSync(LEC).filter(f => /^02-\d\d-.*\.md$/.test(f)).sort())
  .concat(['03-diskussii.md', '04-praktika.md', '05-zaklyuchenie.md', '06-glossarij.md', '99-samoproverka.md']);

const md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });

// ---------- placeholders ----------
const blocks = [], maths = [], vizs = [], vers = [];
const MARK = /^\s*(📌|❗|💡|🔬|📝|❓|🎮|✅|🖼️|🖼)\uFE0F?\s*/u;

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function pre(text, fname) {
  let subtitle = '';
  if (fname === '00-vvedenie.md') {
    // strip H1 title + italic subtitle + first hr
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && !/^---\s*$/.test(lines[i])) { if (/^\*.*\*\s*$/.test(lines[i].trim())) subtitle = lines[i].trim().replace(/^\*|\*$/g, ''); i++; }
    text = lines.slice(i + 1).join('\n');
  }
  if (fname === '99-samoproverka.md') {
    text = '## Приложение. Самопроверка (служебный блок)\n\n' + text.replace(/^---\s*\n/, '');
  }
  if (fname === '06-glossarij.md') {
    text = text.replace(/^## Глоссарий/m, '## Глоссарий');
  }
  if (process.env.HEX !== '0') text = text.replace('ромбы — точки принятия решения', 'шестиугольники — точки принятия решения');
  // fenced blocks
  text = text.replace(/```(mermaid|svg)\s*\n([\s\S]*?)```/g, (m, kind, body) => {
    blocks.push({ kind, body });
    return `\n\nQQBLOCK${blocks.length - 1}QQ\n\n`;
  });
  // display math
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => {
    tex = tex.trim().replace(/\\quad\s*\((\d+)\)\s*$/, '\\tag{$1}');
    maths.push(katex.renderToString(tex, { displayMode: true, throwOnError: false, strict: 'ignore', output: 'html' }));
    return `QQMATH${maths.length - 1}QQ`;
  });
  // inline math
  text = text.replace(/\$([^$\n]+?)\$/g, (m, tex) => {
    maths.push(katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false, strict: 'ignore', output: 'html' }));
    return `QQMATH${maths.length - 1}QQ`;
  });
  // plain-text variables with subscripts (V_T, P_A, P_imax …) → typographic subscripts
  text = text.replace(/(?<![\w/$\\])P_AO₂/g, '<i>P</i><sub>A</sub>O₂');
  text = text.replace(/(?<![\w/$\\])([A-Za-z]{1,3})_([A-Za-z0-9]{1,4})(?![\w(])/g, '<i>$1</i><sub>$2</sub>');
  text = text.replace(/(<\/sub>\/)([A-Za-z]{1,3})_([A-Za-z0-9]{1,4})(?![\w(])/g, '$1<i>$2</i><sub>$3</sub>');
  // visualization anchors
  text = text.replace(/^\[🖼️?\s*ВИЗУАЛИЗАЦИЯ:\s*([^\]]*)\]\s*$/gmu, (m, body) => {
    vizs.push(body.trim());
    return `\n\nQQVIZ${vizs.length - 1}QQ\n\n`;
  });
  // verification flags
  text = text.replace(/\[⚠️?\s*([^\]]*)\]/gu, (m, body) => {
    vers.push(body.trim());
    return `QQVER${vers.length - 1}QQ`;
  });
  return { text, subtitle };
}

function post(html) {
  html = html.replace(/<p>QQBLOCK(\d+)QQ<\/p>|QQBLOCK(\d+)QQ/g, (m, a, bb) => {
    const b = blocks[+(a ?? bb)];
    if (b.kind === 'mermaid') {
      let src = b.body.trim();
      // print optimisation: rhombus decision nodes are rendered by Mermaid about twice the size of their label;
      // hexagons keep the diagram compact, which matters on an A4 page
      if (process.env.HEX !== '0') src = src.replace(/(^|[^\w{])([A-Za-z][\w]*)\{(?!\{)([^{}\n]+)\}(?!\})/g, (m, pre, id, label) => `${pre}${id}{{${label}}}`);
      return `<div class="fig fig-mermaid"><pre class="mermaid">${esc(src)}</pre></div>`;
    }
    let svg = b.body.trim().replace(/\swidth="\d+"/, '').replace(/\sheight="\d+"/, '');
    return `<div class="fig fig-svg">${svg}</div>`;
  });
  html = html.replace(/QQMATH(\d+)QQ/g, (m, i) => maths[+i]);
  html = html.replace(/<p>QQVIZ(\d+)QQ<\/p>|QQVIZ(\d+)QQ/g, (m, a, b) => {
    const t = vizs[+(a ?? b)];
    return `<div class="viz"><span class="ico">🖼</span><div><span class="vizlabel">Визуализация (якорь для реальных данных):</span> ${esc(t)}</div></div>`;
  });
  html = html.replace(/QQVER(\d+)QQ/g, (m, i) => `<span class="verify"><span class="ico">⚠</span>${esc(vers[+i])}</span>`);
  return html;
}

// ---------- render all ----------
let subtitle = '';
let bodyHtml = '';
for (const f of order) {
  const raw = fs.readFileSync(path.join(LEC, f), 'utf8');
  const p = pre(raw, f);
  if (p.subtitle) subtitle = p.subtitle;
  bodyHtml += `\n<!-- file:${f} -->\n<div class="src" data-file="${f}">` + post(md.render(p.text)) + '</div>\n';
}

const $ = cheerio.load(`<body>${bodyHtml}</body>`, { decodeEntities: false });

// unwrap .src wrappers but remember file for glossary
$('div.src').each((_, d) => {
  const f = $(d).attr('data-file');
  if (f === '06-glossarij.md') $(d).addClass('glossary-src');
});

// ---------- headings: ids, markers, TOC ----------
const headings = []; // {idx, level, text, id, part, chapterOfPart2}
let hidx = 0;
$('h2, h3, h4, h5').each((_, h) => {
  const el = $(h);
  const level = +h.tagName[1];
  const text = el.text().replace(MARK, '').trim();
  const id = `h${hidx}`;
  el.attr('id', id);
  const markerText = `⟦${hidx}⟧`;
  el.prepend(`<span class="pm">${markerText}</span>`);
  headings.push({ idx: hidx, level, text, id });
  hidx++;
});

// classify
let currentPart = null;
for (const h of headings) {
  if (h.level === 2) currentPart = h;
  h.part = currentPart;
  h.isGlossaryLetter = (h.level === 3 && currentPart && /^Глоссарий/.test(currentPart.text) && h.text.length <= 3);
  h.isChapter2 = (h.level === 3 && /^2\.\d+\./.test(h.text));
}

// part openers
$('h2').each((_, h) => {
  const el = $(h);
  const hinfo = headings.find(x => x.id === el.attr('id'));
  const chapters = headings.filter(x => x.level === 3 && x.part === hinfo && !x.isGlossaryLetter);
  const m = hinfo.text.match(/^(\d+)\.\s*(.*)$/);
  const num = m ? m[1] : null;
  const title = m ? m[2] : hinfo.text;
  if (chapters.length > 0 && num) {
    const list = chapters.map(c => `<li>${c.id ? `<a href="#${c.id}">${esc(c.text)}</a>` : esc(c.text)}</li>`).join('');
    const opener = $(`<section class="part-opener"><div class="part-kicker">Раздел ${num}</div><div class="part-title-wrap"></div><div class="part-chapters-label">В этом разделе</div><ul class="part-chapters ${chapters.length > 12 ? 'two-col' : ''}">${list}</ul></section>`);
    el.before(opener);
    opener.find('.part-title-wrap').append(el);
    el.html(`<span class="pm">⟦${hinfo.idx}⟧</span>${esc(title)}`);
    hinfo.opener = true;
  } else {
    el.addClass('plain');
  }
});

$('h3').each((_, h) => {
  const el = $(h);
  const hinfo = headings.find(x => x.id === el.attr('id'));
  if (hinfo.isChapter2) el.addClass('chapter');
  if (hinfo.isGlossaryLetter) el.addClass('gl-letter');
});

// ---------- callouts ----------
const MARKERS = { '📌': 'def', '❗': 'err', '💡': 'fact', '🔬': 'deep', '📝': 'summary', '❓': 'questions', '🎮': 'game', '✅': 'selfcheck' };
function markerOf(el) {
  if (!el || el.type !== 'tag' || el.tagName !== 'p') return null;
  const t = $(el).text().trimStart();
  for (const k of Object.keys(MARKERS)) if (t.startsWith(k)) return k;
  return null;
}
function stripMarker(pEl) {
  // remove leading emoji from first text node(s)
  const p = $(pEl);
  const first = pEl.children[0];
  if (first && first.type === 'text') {
    first.data = first.data.replace(MARK, '');
  }
}
function isHeadingOrHr(el) {
  return el.type === 'tag' && (/^h[1-6]$/.test(el.tagName) || el.tagName === 'hr' || el.tagName === 'section');
}
const container = $('body');
$('div.src').each((_, src) => {
  const kids = $(src).children().toArray();
  let i = 0;
  const wrapRange = (a, b, cls, icon, titleMode) => {
    const w = $(`<div class="callout ${cls}"></div>`);
    $(kids[a]).before(w);
    if (icon) w.append(`<span class="ico">${icon}</span>`);
    const inner = $('<div class="co-body"></div>');
    w.append(inner);
    for (let k = a; k < b; k++) inner.append(kids[k]);
    if (titleMode) { stripMarker(kids[a]); $(kids[a]).addClass('co-title'); } else { stripMarker(kids[a]); }
  };
  while (i < kids.length) {
    const el = kids[i];
    const mk = markerOf(el);
    if (!mk) { i++; continue; }
    const cls = MARKERS[mk];
    if (cls === 'def' || cls === 'err' || cls === 'fact' || cls === 'deep') {
      wrapRange(i, i + 1, cls, mk, false); i++; continue;
    }
    // multi-element blocks
    let j = i + 1;
    while (j < kids.length) {
      const e = kids[j];
      if (isHeadingOrHr(e)) break;
      if (markerOf(e)) break;
      if (cls === 'summary' && e.type === 'tag' && e.tagName === 'p' && /^Главный вывод/.test($(e).text().trim())) { j++; break; }
      j++;
    }
    wrapRange(i, j, cls, mk, true);
    i = j;
  }
});

// remove remaining hr
$('hr').remove();

// remove empty paragraphs left by block placeholders
$('p').each((_, p) => { if ($(p).children().length === 0 && $(p).text().trim() === '') $(p).remove(); });

// ---------- figures & tables ----------
$('p').each((_, p) => {
  const el = $(p);
  const strong = el.children().first();
  if (!strong.length || strong[0].tagName !== 'strong' || p.children[0] !== strong[0]) return;
  const st = strong.text().trim();
  if (/^Рис\.\s*\d+\./.test(st)) {
    el.addClass('figcaption');
    const prev = el.prev();
    if (prev.length && prev.hasClass('fig')) {
      const fig = $('<figure class="figure"></figure>');
      prev.before(fig);
      fig.append(prev); fig.append(el);
    }
  } else if (/^Табл\.\s*\d+\./.test(st)) {
    el.addClass('tabcaption');
    const next = el.next();
    if (next.length && next[0].tagName === 'table') {
      const box = $('<div class="tbl"></div>');
      el.before(box);
      box.append(el); box.append(next);
    }
  }
});
$('table').each((_, t) => {
  const el = $(t);
  const ncol = el.find('tr').first().children().length;
  if (ncol >= 6) el.addClass('cols-many');
  if (ncol >= 8) el.addClass('cols-xl');
  if (!el.parent().hasClass('tbl')) el.wrap('<div class="tbl"></div>');
});

// glossary: entries
$('div.glossary-src p').each((_, p) => {
  const el = $(p);
  if (el.children().first().length && el.children().first()[0].tagName === 'strong' && p.children[0] === el.children().first()[0]) el.addClass('gl-entry');
});
// wrap glossary letters+entries into a columns container (after the h2 and intro paragraph)
(() => {
  const src = $('div.glossary-src');
  const kids = src.children().toArray();
  const firstLetter = kids.findIndex(k => k.type === 'tag' && k.tagName === 'h3');
  if (firstLetter < 0) return;
  const cols = $('<div class="gl-cols"></div>');
  $(kids[firstLetter]).before(cols);
  for (let k = firstLetter; k < kids.length; k++) cols.append(kids[k]);
})();


// ---------- hyphenation (soft hyphens; stripped from the text layer in post-processing) ----------
const { hyphenateSync } = require('hyphen/ru');
const hcache = new Map();
function hyphWord(w) {
  if (hcache.has(w)) return hcache.get(w);
  let r;
  try { r = hyphenateSync(w, { hyphenChar: '\u00AD', minWordLength: 7 }); } catch (e) { r = w; }
  hcache.set(w, r); return r;
}
function hyphText(t) {
  return t.replace(/[А-Яа-яЁё]{7,}/g, w => (/^[А-ЯЁ][А-ЯЁ]/.test(w) ? w : hyphWord(w)));
}
const SKIP_TAGS = new Set(['h1','h2','h3','h4','h5','h6','pre','code','svg','script','style','th']);
function walkHyph(node) {
  if (node.type === 'text') { node.data = hyphText(node.data); return; }
  if (node.type !== 'tag') return;
  if (SKIP_TAGS.has(node.name)) return;
  const cls = node.attribs && node.attribs.class || '';
  if (/\b(katex|pm|mermaid|tabcaption|figcaption|co-title|part-opener)\b/.test(cls)) return;
  for (const c of node.children || []) walkHyph(c);
}
$('div.src').each((_, src) => walkHyph(src));

// ---------- TOC ----------
const tocEntries = headings.filter(h => (h.level === 2) || (h.level === 3 && !h.isGlossaryLetter));
function pageOf(h) { return PASS2 ? (PAGES[h.idx] ?? '') : '000'; }
let toc = '<section class="toc"><h2 class="toc-title">Содержание</h2>';
for (const h of tocEntries) {
  const cls = h.level === 2 ? 'toc-part' : 'toc-ch';
  toc += `<a class="${cls}" href="#${h.id}"><span class="t">${esc(h.text)}</span><span class="dots"></span><span class="pg">${pageOf(h)}</span></a>`;
}
toc += '</section>';

// ---------- cover & legend ----------
const cover = `
<section class="cover">
  <div class="cover-inner">
    <div class="cover-kicker">Учебная лекция</div>
    <h1 class="cover-title">Хроническая дыхательная недостаточность</h1>
    <div class="cover-sub">Физиология и патогенез · диагностика · длительная кислородотерапия и домашняя вентиляция · острая декомпенсация · организация помощи · паллиативные и этические аспекты</div>
    <svg class="cover-art" viewBox="0 0 600 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><linearGradient id="cg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#7fd1c9" stop-opacity="0.15"/><stop offset="1" stop-color="#7fd1c9" stop-opacity="0.9"/></linearGradient></defs>
      <line x1="40" y1="230" x2="580" y2="230" stroke="#9fb8d0" stroke-width="1"/>
      <line x1="40" y1="230" x2="40" y2="20" stroke="#9fb8d0" stroke-width="1"/>
      <path d="M40 228 C 120 226, 150 215, 190 180 C 230 140, 250 80, 320 55 C 380 35, 470 30, 580 28" fill="none" stroke="url(#cg)" stroke-width="5" stroke-linecap="round"/>
      <line x1="236" y1="230" x2="236" y2="92" stroke="#7fd1c9" stroke-width="1.2" stroke-dasharray="4 4"/>
      <line x1="40" y1="92" x2="236" y2="92" stroke="#7fd1c9" stroke-width="1.2" stroke-dasharray="4 4"/>
      <circle cx="236" cy="92" r="6" fill="#7fd1c9"/>
      <text x="246" y="86" fill="#d6e6f2" font-family="PT Sans, DejaVu Sans, sans-serif" font-size="15">PaO₂ 60 мм рт. ст. · SaO₂ ≈ 90 %</text>
      <text x="560" y="252" fill="#9fb8d0" font-family="PT Sans, DejaVu Sans, sans-serif" font-size="13" text-anchor="end">PaO₂</text>
      <text x="48" y="22" fill="#9fb8d0" font-family="PT Sans, DejaVu Sans, sans-serif" font-size="13">SaO₂</text>
    </svg>
    <div class="cover-aud">${esc(subtitle)}</div>
    <div class="cover-meta">
      <div>Объём: 5 разделов · 31 глава основной части · 24 дискуссионных вопроса · 15 практических инструментов</div>
      <div>30 рисунков · 50 таблиц · 14 формул · 4 интерактивных элемента · глоссарий (144 термина)</div>
    </div>
    <div class="cover-foot"><span>2026</span><span>Материал подготовлен в Arena.ai Agent Mode</span></div>
  </div>
</section>`;

const legend = `
<section class="legend">
  <h2 class="plain nobreak">Как пользоваться лекцией</h2>
  <p>Лекция построена по единому плану: введение (раздел 1), основная часть из 31 главы (раздел 2), дискуссионные вопросы (раздел 3), практические инструменты (раздел 4), заключение с итоговыми контрольными вопросами (раздел 5) и глоссарий. Базовый уровень изложения рассчитан на студентов старших курсов; вставки «Углубление» и разделы 3–4 адресованы ординаторам и врачам. Нумерация рисунков, таблиц и формул сквозная по всему тексту. Все клинические примеры (Пример 1, Пример 2, пациенты В–Л) — учебные и составлены для иллюстрации; они не описывают реальных людей.</p>
  <table class="legend-table">
    <tbody>
      <tr><td><span class="ico c-def">📌</span></td><td><b>Определение</b> — формальное определение ключевого термина; все определения собраны в глоссарии.</td></tr>
      <tr><td><span class="ico c-summary">📝</span></td><td><b>Обобщение</b> — краткие выводы главы и «главный вывод», связывающий её со следующей.</td></tr>
      <tr><td><span class="ico c-err">❗</span></td><td><b>Типичная ошибка</b> — распространённое заблуждение или ошибка практики и способ её избежать.</td></tr>
      <tr><td><span class="ico c-fact">💡</span></td><td><b>Интересный факт</b> — проверяемый исторический или научный факт, помогающий запомнить материал.</td></tr>
      <tr><td><span class="ico c-deep">🔬</span></td><td><b>Углубление</b> — материал повышенной сложности для специалистов; при первом чтении может быть пропущен.</td></tr>
      <tr><td><span class="ico c-q">❓</span></td><td><b>Контрольные вопросы</b> — вопросы для самопроверки после каждой главы и итоговые вопросы в заключении.</td></tr>
      <tr><td><span class="ico c-game">🎮</span></td><td><b>Интерактивный элемент</b> — сценарий семинарского занятия (разбор случаев, симуляция, дискуссия).</td></tr>
      <tr><td><span class="ico c-viz">🖼</span></td><td><b>Визуализация</b> — якорь для диаграммы, требующей реальных данных из указанных источников.</td></tr>
      <tr><td><span class="ico c-ver">⚠</span></td><td><b>Требуется верификация</b> — число или деталь, которые следует сверить с актуальными национальными документами и первоисточниками перед использованием.</td></tr>
    </tbody>
  </table>
  <p class="legend-note">Рекомендации (GOLD, ERS, ATS, BTS, CHEST, ESC/ERS) обновляются каждые 2–4 года: перед использованием материала в преподавании проверьте актуальные версии. Перечень источников — в п. 4.15.</p>
</section>`;

// ---------- in-browser script ----------
const script = `
<script src="node_modules/mermaid/dist/mermaid.min.js"></script>
<script>
mermaid.initialize({ startOnLoad: false });
(async () => {
  try {
    await Promise.all(['12px "PT Sans"','bold 12px "PT Sans"','12px "PT Serif"','bold 12px "PT Serif"','italic 12px "PT Serif"','12px "Noto Emoji"'].map(f => document.fonts.load(f)));
    await document.fonts.ready;
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'loose', theme: 'base', look: 'classic',
      themeVariables: { fontFamily: 'PT Sans, DejaVu Sans, sans-serif', fontSize: '16px', primaryColor: '#e9f0f7', primaryBorderColor: '#2c5f8a', primaryTextColor: '#15293f', lineColor: '#2c5f8a', secondaryColor: '#f3f6f9', tertiaryColor: '#fbfbfb', noteBkgColor: '#fff6df', noteBorderColor: '#c98a00', clusterBkg: '#f6f8fa', clusterBorder: '#b9c6d3', edgeLabelBackground: '#ffffff', cScale0: '#2c5f8a', cScale1: '#2b7a78', cScale2: '#6b4fa0', cScale3: '#b23a3a', cScale4: '#c98a00', cScale5: '#4a6fa5' },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 8, nodeSpacing: 22, rankSpacing: 30, wrappingWidth: 480 },
      markdownAutoWrap: true,
      timeline: { useMaxWidth: true }
    });
    await mermaid.run({ querySelector: '.mermaid' });
  } catch (e) { window.__err = String(e && e.stack || e); }
  // size all figure SVGs to fit the page; big diagrams get their own (portrait or landscape) page with narrow margins
  const maxW = document.querySelector('.content').clientWidth;
  const mm = 96 / 25.4;
  const maxH = Math.round(222 * mm);
  const tallW = Math.round(182 * mm), tallH = Math.round(243 * mm);
  const landW = Math.round(269 * mm), landH = Math.round(160 * mm);
  document.querySelectorAll('.fig svg').forEach(svg => {
    let vb = svg.viewBox && svg.viewBox.baseVal;
    let ratio;
    if (vb && vb.width && vb.height) ratio = vb.width / vb.height;
    else { const bb = svg.getBoundingClientRect(); ratio = bb.width / Math.max(1, bb.height); }
    const isMermaid = !!svg.closest('.fig-mermaid');
    const natural = isMermaid ? (parseFloat((svg.style.maxWidth || '').replace('px', '')) || (vb ? vb.width : maxW)) : maxW;
    const fit = (W, H) => { let w = Math.min(W, natural); let h = w / ratio; if (h > H) { h = H; w = h * ratio; } return [w, h]; };
    let [w, h] = fit(maxW, maxH);
    const scale = w / natural;
    const figure = svg.closest('figure');
    if (isMermaid && figure && scale < 0.62) {
      if (ratio > 1.25) { figure.classList.add('wide'); [w, h] = fit(landW, landH); }
      else { figure.classList.add('tall'); [w, h] = fit(tallW, tallH); }
    }
    svg.removeAttribute('height'); svg.removeAttribute('width');
    svg.style.maxWidth = 'none';
    svg.style.width = w + 'px'; svg.style.height = h + 'px';
    svg.style.display = 'block'; svg.style.margin = '0 auto';
  });
  window.__ready = true;
})();
</script>`;

const css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Хроническая дыхательная недостаточность — лекция</title>
<meta name="author" content="Arena.ai Agent Mode">
<link rel="stylesheet" href="node_modules/@fontsource/pt-serif/400.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-serif/700.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-serif/400-italic.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-serif/700-italic.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-sans/400.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-sans/700.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-sans/400-italic.css">
<link rel="stylesheet" href="node_modules/@fontsource/pt-sans/700-italic.css">
<link rel="stylesheet" href="node_modules/@fontsource/noto-emoji/400.css">
<link rel="stylesheet" href="node_modules/@fontsource/noto-sans-symbols-2/400.css">
<link rel="stylesheet" href="node_modules/@fontsource/noto-sans-math/400.css">
<link rel="stylesheet" href="node_modules/katex/dist/katex.min.css">
<style>${css}</style>
</head><body class="${PASS2 ? 'pass2' : 'pass1'}">
${cover}
<div class="content">
${legend}
${toc}
${$('body').html()}
</div>
${script}
</body></html>`;

fs.writeFileSync(OUT, html);
fs.writeFileSync(path.join(__dirname, 'headings.json'), JSON.stringify(headings.map(h => ({ idx: h.idx, level: h.level, text: h.text, opener: !!h.opener, isChapter2: !!h.isChapter2, isGlossaryLetter: !!h.isGlossaryLetter, partIdx: h.part ? h.part.idx : null })), null, 0));
console.log('html written', OUT, 'headings', headings.length, 'blocks', blocks.length, 'maths', maths.length, 'viz', vizs.length, 'ver', vers.length, PASS2 ? 'PASS2' : 'PASS1');
