/* ==============================================================
   trizen-studios.js – FINAL: Search + Logo Links to Home
   ============================================================== */

const ALL_PAGES = [
  { file: 'trizen-studios.html', title: 'Home' },
  { file: 'about.html',         title: 'About' },
  { file: 'services.html',      title: 'Services' },
  { file: 'contact.html',       title: 'Contact' }
];

let searchIndex = [];
let currentPage = location.pathname.split('/').pop() || 'trizen-studios.html';

/* --------------------------------------------------------------
   1. Force rebuild index (once per session)
   -------------------------------------------------------------- */
if (!sessionStorage.getItem('trizenSearchIndex')) {
  document.body.style.cursor = 'wait';
  const r = document.getElementById('r');
  if (r) r.innerHTML = '<div class="suggestion">Building search index...</div>';
  buildFullIndex().finally(() => {
    document.body.style.cursor = 'auto';
    if (r) r.innerHTML = '';
  });
} else {
  searchIndex = JSON.parse(sessionStorage.getItem('trizenSearchIndex'));
}

/* --------------------------------------------------------------
   Build full index from ALL pages
   -------------------------------------------------------------- */
async function buildFullIndex() {
  const index = [];

  for (const pg of ALL_PAGES) {
    try {
      const resp = await fetch(pg.file + '?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) continue;
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, a, img').forEach(el => {
        const raw = (el.textContent || el.alt || el.title || '').trim();
        if (!raw) return;
        index.push({
          text: raw.toLowerCase(),
          fullText: raw,
          page: pg.file,
          pageTitle: pg.title,
          selector: makeSelector(el, doc)
        });
      });
    } catch (e) {
      console.error('Failed to load', pg.file, e);
    }
  }

  searchIndex = index;
  sessionStorage.setItem('trizenSearchIndex', JSON.stringify(index));
}

/* --------------------------------------------------------------
   Unique CSS selector
   -------------------------------------------------------------- */
function makeSelector(el, doc) {
  if (el.id) return `#${el.id}`;
  const path = [];
  let cur = el;
  while (cur && cur.nodeType === 1) {
    let s = cur.tagName.toLowerCase();
    if (cur.id) s += `#${cur.id}`;
    else {
      let n = 1, sib = cur;
      while (sib = sib.previousElementSibling) if (sib.tagName === cur.tagName) n++;
      if (n > 1) s += `:nth-of-type(${n})`;
    }
    path.unshift(s);
    cur = cur.parentNode;
  }
  return path.join(' > ');
}

/* --------------------------------------------------------------
   Sentence preview with highlighted keyword
   -------------------------------------------------------------- */
function makePreview(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  const start = Math.max(0, i - 50);
  const end = Math.min(text.length, i + q.length + 80);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet += '...';
  return snippet.replace(new RegExp(`(${q})`, 'gi'), '<strong style="color:cyan; font-weight:600">$1</strong>');
}

/* --------------------------------------------------------------
   2. Real-time dropdown
   -------------------------------------------------------------- */
document.getElementById('q')?.addEventListener('input', () => {
  const q = document.getElementById('q').value.toLowerCase().trim();
  const r = document.getElementById('r');
  if (!q) { r.innerHTML = ''; return; }

  const seen = new Set();
  const hits = searchIndex
    .filter(item => item.text.includes(q) && !seen.has(item.page) && seen.add(item.page))
    .slice(0, 6)
    .map(item => {
      const html = `
        <div class="suggestion" data-page="${item.page}" data-text="${item.fullText}" data-selector="${item.selector}">
          <strong>${item.pageTitle}</strong><br>
          ${makePreview(item.fullText, q)}
        </div>`;
      return html;
    });
  r.innerHTML = hits.join('') || '<div class="suggestion">No results</div>';
});

/* --------------------------------------------------------------
   3. Click handler
   -------------------------------------------------------------- */
document.getElementById('r')?.addEventListener('click', e => {
  const sug = e.target.closest('.suggestion');
  if (!sug) return;

  const targetPage = sug.dataset.page;
  const selector   = sug.dataset.selector || null;
  const display    = sug.dataset.text;

  if (targetPage === currentPage) {
    if (selector) document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = document.getElementById('q');
    if (input) input.value = display;
    document.getElementById('r').innerHTML = '';
    return;
  }

  sessionStorage.setItem('trizenJump', JSON.stringify({ page: targetPage, selector, display }));
  location.href = targetPage;
});

/* --------------------------------------------------------------
   4. After redirect → scroll + Make Logo Link to Home
   -------------------------------------------------------------- */
window.addEventListener('load', () => {
  const jump = sessionStorage.getItem('trizenJump');
  if (jump) {
    sessionStorage.removeItem('trizenJump');
    const { display, selector } = JSON.parse(jump);
    const input = document.getElementById('q');
    if (input) input.value = display;
    if (selector) {
      setTimeout(() => {
        const el = document.querySelector(selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }

  // Make TS Icon + Name link to Home
  const brand = document.querySelector('.brand-header');
  if (brand) {
    brand.style.cursor = 'pointer';
    brand.addEventListener('click', () => {
      location.href = 'trizen-studios.html';
    });
  }

  // Initial mobile layout
  const searchBar = document.querySelector('.search-bar');
  if (window.innerWidth <= 768) {
    searchBar.style.top = 'auto';
    searchBar.style.bottom = '20px';
  }
});

/* --------------------------------------------------------------
   5. Enter / Go
   -------------------------------------------------------------- */
document.getElementById('q')?.addEventListener('keypress', e => { if (e.key === 'Enter') search(); });
function search() { document.getElementById('q').dispatchEvent(new Event('input')); }

/* --------------------------------------------------------------
   6. Focus on click
   -------------------------------------------------------------- */
document.querySelector('.search-bar')?.addEventListener('click', e => {
  const input = document.getElementById('q');
  if (input && !input.contains(e.target) && e.target.tagName !== 'BUTTON') input.focus();
});

/* --------------------------------------------------------------
   7. Scroll: Shrink navbar + move beside logo (desktop)
   -------------------------------------------------------------- */
let scrollTimeout;
let lastScrollY = window.scrollY;
let isShrunk = false;

function handleScroll() {
  const navbar = document.querySelector('.navbar');
  const brandHeader = document.querySelector('.brand-header');
  const searchBar = document.querySelector('.search-bar');
  const isMobile = window.innerWidth <= 768;
  const currentScrollY = window.scrollY;
  
  // Only update if scroll position changed significantly or state needs to change
  const shouldBeShrunk = currentScrollY > 100;
  
  if (shouldBeShrunk !== isShrunk) {
    isShrunk = shouldBeShrunk;
    
    if (isShrunk) {
      navbar?.classList.add('shrunk');
      brandHeader?.classList.add('shrunk');
      searchBar?.classList.add('shrunk');
    } else {
      navbar?.classList.remove('shrunk');
      brandHeader?.classList.remove('shrunk');
      searchBar?.classList.remove('shrunk');
    }
  }

  if (isMobile) {
    searchBar.style.top = 'auto';
    searchBar.style.bottom = '20px';
  }
  
  lastScrollY = currentScrollY;
}

// Throttled scroll handler with passive listener for better performance
window.addEventListener('scroll', () => {
  if (!scrollTimeout) {
    scrollTimeout = requestAnimationFrame(() => {
      handleScroll();
      scrollTimeout = null;
    });
  }
}, { passive: true });

// Initialize scroll state on load
window.addEventListener('load', () => {
  handleScroll();
});

/* --------------------------------------------------------------
   8. Load state - handled by handleScroll() above
   -------------------------------------------------------------- */

/* New functions for mini-YouTube on watch.html */
async function loadVideos(query = '') {
  const url = query ? `/search-videos?q=${encodeURIComponent(query)}` : '/videos';
  try {
    const res = await fetch(url);
    const videos = await res.json();
    const grid = document.getElementById('video-grid');
    if (!grid) return; // Not on watch page
    grid.innerHTML = '';
    for (const v of videos) {
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `
        <video controls style="border-radius: 10px;">
          <source src="${v.file}" type="video/mp4">
          Your browser doesn't support video.
        </video>
        <h3>${v.title}</h3>
        <p>Views: <span class="views">${v.views}</span> | Likes: <span class="likes">${v.likes}</span></p>
        <button onclick="likeVideo('${v.id}', this)">Like</button>
        <p>${v.description}</p>
        <div class="comments">
          ${v.comments.map(c => `<p>${c.text} <small>${new Date(c.date).toLocaleString()}</small></p>`).join('')}
        </div>
        <form onsubmit="postComment(event, '${v.id}', this)">
          <input type="text" name="comment-text" placeholder="Add a comment" required>
          <button type="submit">Post</button>
        </form>
      `;
      const videoEl = card.querySelector('video');
      let viewed = false;
      videoEl.addEventListener('play', async () => {
        if (viewed) return;
        viewed = true;
        await fetch(`/view/${v.id}`, { method: 'POST' });
        // Refresh stats (optional, or poll)
        const newData = await (await fetch(`/video/${v.id}`)).json();
        card.querySelector('.views').textContent = newData.views;
      });
      grid.appendChild(card);
    }
  } catch (e) {
    console.error('Error loading videos:', e);
  }
}

async function likeVideo(id, button) {
  await fetch(`/like/${id}`, { method: 'POST' });
  const card = button.closest('.video-card');
  const newData = await (await fetch(`/video/${id}`)).json();
  card.querySelector('.likes').textContent = newData.likes;
}

async function postComment(event, id, form) {
  event.preventDefault();
  const text = form.querySelector('input[name="comment-text"]').value;
  await fetch(`/comment/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  form.querySelector('input').value = '';
  // Reload videos to show new comment
  loadVideos(document.getElementById('video-q')?.value || '');
}

function searchVideos() {
  const q = document.getElementById('video-q').value;
  loadVideos(q);
}

// Load videos on page load if on watch.html
window.addEventListener('load', () => {
  if (currentPage === 'watch.html') {
    loadVideos();
    document.getElementById('video-q')?.addEventListener('keypress', e => {
      if (e.key === 'Enter') searchVideos();
    });
  }
});