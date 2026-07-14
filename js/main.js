;(function() {
'use strict';

// ── State ──
let index = null;
let books = [];
let currentSlug = null;
let currentData = null;
let currentCh = null;

// ── Cache ──
const cache = {};

// ── DOM refs ──
const $ = id => document.getElementById(id);
const sidebar = $('sidebar');
const menuBtn = $('menuBtn');
const bookList = $('bookList');
const bookSearch = $('bookSearch');
const reader = $('reader');
const welcome = $('welcome');
const bookTitle = $('bookTitle');
const chSelect = $('chSelect');
const prevCh = $('prevCh');
const nextCh = $('nextCh');
const versesEl = $('verses');
const hasNotes = $('hasNotes');
const darkToggle = $('darkToggle');

// ── Books by category ──
const CATEGORIES = {
  'Old Testament': [
    'genesis','leviticus','numbers','deuteronomy','joshua','judges',
    '1-chronicles','2-esdras','esther','tobit','judith',
    '1-maccabees','4-maccabees',
    'isaiah','jeremiah','lamentations','joel','obadiah','jonah','nahum',
    'habakkuk','zephaniah','haggai','zechariah','malachi',
    'psalms','proverbs','ecclesiastes','song-of-solomon',
    'wisdom-of-solomon','sirach','job'
  ],
  'New Testament': [
    'matthew','mark','luke','john','romans',
    '1-corinthians','2-corinthians','galatians','ephesians',
    'philippians','colossians','1-thessalonians','2-thessalonians',
    'hebrews','1-timothy','2-timothy','titus','philemon','acts',
    'james','1-peter','2-peter','1-john','2-john','3-john','jude','revelation'
  ],
  'Additional': [
    'epistle-of-barnabas','shepherd-of-hermas'
  ]
};

// ── Init ──
async function init() {
  await loadIndex();
  renderBookList();
  setupEventListeners();
  applyTheme();
  // Check URL hash
  const hash = location.hash.slice(1);
  if (hash) {
    const parts = hash.split('/');
    if (parts.length >= 2) openBook(parts[0], parseInt(parts[1]));
    else if (parts.length === 1) openBook(parts[0], 1);
  }
}

async function loadIndex() {
  if (index) return;
  const r = await fetch('data/index.json');
  index = await r.json();
  books = index.books;
}

function getBook(slug) {
  return books.find(b => b.slug === slug);
}

// ── Render sidebar ──
function renderBookList(filter) {
  filter = (filter || '').toLowerCase().trim();
  let html = '';
  for (const [cat, slugs] of Object.entries(CATEGORIES)) {
    const filtered = slugs.filter(s => {
      const b = getBook(s);
      if (!b) return false;
      return !filter || b.name.toLowerCase().includes(filter) || s.includes(filter);
    });
    if (filter && filtered.length === 0) continue;
    html += `<div class="book-group"><div class="book-group-label" data-cat="${cat}"><span class="collapse-arrow">▾</span>${cat}</div>`;
    for (const slug of filtered) {
      const b = getBook(slug);
      if (!b) continue;
      const active = slug === currentSlug ? ' active' : '';
      html += `<div class="book-item${active}" data-slug="${slug}">${b.name}</div>`;
    }
    html += '</div>';
  }
  bookList.innerHTML = html;
}

// ── Open book/chapter ──
async function openBook(slug, chapter) {
  welcome.style.display = 'none';
  reader.style.display = 'block';

  // Update sidebar active
  document.querySelectorAll('.book-item').forEach(el => el.classList.toggle('active', el.dataset.slug === slug));

  if (currentSlug !== slug) {
    currentSlug = slug;
    currentData = null;
    currentCh = null;
  }

  if (!cache[slug]) {
    versesEl.innerHTML = '<div class="loading">Loading…</div>';
  }

  try {
    if (!cache[slug]) {
      const r = await fetch(`data/translations/${slug}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      cache[slug] = await r.json();
    }
    currentData = cache[slug];
  } catch (e) {
    versesEl.innerHTML = `<div class="empty-state">Error loading: ${e.message}</div>`;
    return;
  }

  // Find a valid chapter
  const chapters = currentData.chapters;
  if (chapters.length === 0) {
    versesEl.innerHTML = '<div class="empty-state">No chapters found.</div>';
    return;
  }

  // Find chapter index — allow any chapter number the JSON has
  let chIdx = chapters.findIndex(c => c.chapter === chapter);
  if (chIdx === -1) chIdx = 0;
  const ch = chapters[chIdx];
  if (!ch) return;

  currentCh = ch.chapter;

  // Update header
  const info = getBook(slug);
  bookTitle.textContent = info ? info.name : slug;

  // Chapter select
  chSelect.innerHTML = chapters.map((c, i) =>
    `<option value="${c.chapter}" ${c.chapter === currentCh ? 'selected' : ''}>Chapter ${c.chapter}</option>`
  ).join('');

  // Update hash
  history.replaceState(null, '', `#${slug}/${currentCh}`);

  // Render verses
  renderChapter(ch, slug);
  updateNotes(ch, slug);
  updateNav(chapters.length, chIdx);
}

function renderChapter(ch, slug) {
  const v = ch.verses || [];
  if (v.length === 0) {
    versesEl.innerHTML = '<div class="empty-state">No verses in this chapter.</div>';
    return;
  }
  let html = '<div class="verses">';
  for (const verse of v) {
    const t = verse.translation || '';
    const o = verse.original || '';
    const fns = verse.footnotes || [];
    const hasFn = fns.length > 0;
    const hasVar = fns.some(f => f.type === 'variant');
    const hasMissing = fns.some(f => f.type === 'missing-text');

    if (!t && !o) continue; // skip empty structural entries

    html += `<div class="verse" data-verse="${verse.verse}">`;
    html += `<span class="vnum" data-verse="${verse.verse}">${verse.verse}</span>`;
    html += `<span class="translation">${escapeHtml(t)}</span>`;
    if (o) {
      html += `<span class="original">${escapeHtml(o)}</span>`;
    }
    if (hasVar) {
      html += `<span class="var-badge" data-fns='${JSON.stringify(fns.filter(f => f.type === 'variant'))}'>var</span>`;
    }
    if (hasFn) {
      for (const fn of fns) {
        const id = fn.id || `${slug}-${ch.chapter}-${verse.verse}-${fn.type}`;
        html += `<sup class="fn-marker" data-fn-id="${escapeHtml(id)}" data-fn-text="${escapeHtml(fn.text)}" data-fn-type="${escapeHtml(fn.type)}">†</sup>`;
      }
    }
    if (hasMissing && t) {
      html += ` <span style="font-size:12px;color:var(--text-dim);font-style:italic;">[text damaged]</span>`;
    }
    html += '</div>';
  }
  html += '</div>';
  versesEl.innerHTML = html;
}

function updateNotes(ch, slug) {
  // Collect all notes from the chapter
  const allNotes = [];
  for (const v of ch.verses) {
    for (const fn of (v.footnotes || [])) {
      allNotes.push(fn);
    }
  }
  if (allNotes.length > 0) {
    hasNotes.style.display = 'block';
  } else {
    hasNotes.style.display = 'none';
  }
}

function updateNav(totalCh, chIdx) {
  prevCh.disabled = chIdx <= 0;
  nextCh.disabled = chIdx >= totalCh - 1;
}

// ── Event handlers ──
function setupEventListeners() {
  // Book list click
  bookList.addEventListener('click', e => {
    const item = e.target.closest('.book-item');
    if (item) {
      const slug = item.dataset.slug;
      const b = getBook(slug);
      const ch = b ? 1 : 1;
      openBook(slug, ch);
      if (window.innerWidth <= 768) sidebar.classList.remove('open');
      return;
    }
    // Toggle group collapse
    const label = e.target.closest('.book-group-label');
    if (label) {
      label.parentElement.classList.toggle('collapsed');
      const arrow = label.querySelector('.collapse-arrow');
      if (arrow) arrow.textContent = label.parentElement.classList.contains('collapsed') ? '▸' : '▾';
    }
  });

  // Chapter select
  chSelect.addEventListener('change', () => {
    const ch = parseInt(chSelect.value);
    if (currentSlug) openBook(currentSlug, ch);
  });

  // Previous / Next chapter
  prevCh.addEventListener('click', () => {
    if (!currentData) return;
    const idx = currentData.chapters.findIndex(c => c.chapter === currentCh);
    if (idx > 0) openBook(currentSlug, currentData.chapters[idx - 1].chapter);
  });
  nextCh.addEventListener('click', () => {
    if (!currentData) return;
    const idx = currentData.chapters.findIndex(c => c.chapter === currentCh);
    if (idx < currentData.chapters.length - 1) openBook(currentSlug, currentData.chapters[idx + 1].chapter);
  });

  // Search
  bookSearch.addEventListener('input', () => renderBookList(bookSearch.value));

  // Menu toggle (mobile)
  menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Click outside sidebar to close on mobile
  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== menuBtn) {
      sidebar.classList.remove('open');
    }
  });

  // Verse number click → toggle Greek
  versesEl.addEventListener('click', e => {
    const vnum = e.target.closest('.vnum');
    if (vnum) {
      vnum.classList.toggle('show-orig');
    }
  });

  // Footnote marker click → show popup
  versesEl.addEventListener('click', e => {
    const fn = e.target.closest('.fn-marker');
    if (fn) {
      e.stopPropagation();
      // Close all other popups
      document.querySelectorAll('.fn-popup').forEach(p => p.remove());
      const popup = document.createElement('div');
      popup.className = 'fn-popup show';
      const type = fn.dataset.fnType || 'note';
      popup.innerHTML = `<div class="fn-type">${escapeHtml(type)}</div>${escapeHtml(fn.dataset.fnText || '')}`;
      document.body.appendChild(popup);
      const rect = fn.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;
      if (left + 400 > window.innerWidth) left = window.innerWidth - 410;
      if (top + 200 > window.innerHeight) top = rect.top - 10 - popup.offsetHeight;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    }
  });

  // Variant badge click → show popup
  versesEl.addEventListener('click', e => {
    const badge = e.target.closest('.var-badge');
    if (badge) {
      e.stopPropagation();
      document.querySelectorAll('.fn-popup').forEach(p => p.remove());
      let fns;
      try { fns = JSON.parse(badge.dataset.fns); } catch { fns = []; }
      const popup = document.createElement('div');
      popup.className = 'fn-popup show';
      popup.innerHTML = fns.map(f =>
        `<div style="margin-bottom:4px;"><div class="fn-type">${escapeHtml(f.type)}</div>${escapeHtml(f.text)}</div>`
      ).join('') || '<div class="fn-type">variant</div><em>No details</em>';
      document.body.appendChild(popup);
      const rect = badge.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;
      if (left + 400 > window.innerWidth) left = window.innerWidth - 410;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    }
  });

  // Close popups on click elsewhere
  document.addEventListener('click', e => {
    if (!e.target.closest('.fn-popup') && !e.target.closest('.fn-marker') && !e.target.closest('.var-badge')) {
      document.querySelectorAll('.fn-popup').forEach(p => p.remove());
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') prevCh.click();
    else if (e.key === 'ArrowRight') nextCh.click();
  });

  // Dark toggle
  darkToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark'
      || (!html.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      html.setAttribute('data-theme', 'light');
      darkToggle.textContent = '☾ Dark';
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-theme', 'dark');
      darkToggle.textContent = '☀ Light';
      localStorage.setItem('theme', 'dark');
    }
  });
}

// ── Theme ──
function applyTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkToggle.textContent = '☀ Light';
  } else if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    darkToggle.textContent = '☾ Dark';
  }
}

// ── Utils ──
function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Start ──
init();

})();
