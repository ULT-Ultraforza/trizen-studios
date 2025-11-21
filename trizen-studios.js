/* ==============================================================
   trizen-studios.js – Enhanced Search with Lunr.js + YouTube Thumbnails + Fixes
   ============================================================== */

   const ALL_PAGES = [
    { file: 'index.html',          title: 'Home' },
    { file: 'trizen-studios.html', title: 'Home' },
    { file: 'about.html',          title: 'About' },
    { file: 'contact.html',        title: 'Contact' },
    { file: 'watch.html',          title: 'Watch' },
    { file: 'watch-video.html',    title: 'Watch Video' }
  ];
  
  let searchIndex = [];
  let currentPage = location.pathname.split('/').pop() || 'trizen-studios.html';
  let lunrIndex;  // Global Lunr index
  
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
    console.log('Total documents in index:', searchIndex.length);  // Debug
    const videoCount = searchIndex.filter(d => d.type === 'video').length;
    console.log('Video documents:', videoCount);  // Debug
  
    // If no videos are indexed, force a rebuild (likely API failure)
    if (videoCount === 0) {
      console.log('No videos in cache, rebuilding...');
      sessionStorage.removeItem('trizenSearchIndex');
      location.reload();
      // Reload will happen, preventing further execution
    }
  
    // Always rebuild Lunr index from cached data
    try {
      lunrIndex = lunr(function() {
        this.ref('id');
        this.field('text');
        this.field('pageTitle');
        searchIndex.forEach(doc => this.add(doc));
      });
      console.log('Lunr index rebuilt from cache');
    } catch (error) {
      console.error('Error rebuilding Lunr index from cache:', error);
      // Fallback: Clear cache and rebuild
      sessionStorage.removeItem('trizenSearchIndex');
      location.reload();
    }
  }
  
  /* --------------------------------------------------------------
     Build full index with Lunr.js + YouTube integration
     -------------------------------------------------------------- */
  async function buildFullIndex() {
    const documents = [];  // Array for Lunr documents
  
    for (const pg of ALL_PAGES) {
      try {
        // Fetch and parse static HTML
        const resp = await fetch(pg.file + '?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) continue;
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
  
        // Index static content
        doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, a, img, span, div').forEach((el, idx) => {
          const raw = (el.textContent || el.alt || el.title || '').trim();
          if (!raw) return;
  
          // Find thumbnail (img src)
          let thumbnail = null;
          if (el.tagName === 'IMG') {
            thumbnail = el.src;
          } else {
            const img = el.querySelector('img');
            if (img) thumbnail = img.src;
          }
  
          documents.push({
            id: `${pg.file}-${idx}`,
            text: raw,
            fullText: raw,
            page: pg.file,
            pageTitle: pg.title,
            selector: makeSelector(el, doc),
            thumbnail: thumbnail,
            type: 'static'  // For filtering in results
          });
        });
  
        // Index images separately for media search
        doc.querySelectorAll('img').forEach((img, idx) => {
          const alt = img.alt || '';
          const title = img.title || '';
          const fileName = img.src.split('/').pop().split('.')[0];  // e.g., "Jason-vs-Malachi-Final"
          let nearbyText = '';
          const parent = img.parentElement;
          if (parent) {
            nearbyText = parent.textContent || '';
          }
          const text = (alt + ' ' + title + ' ' + nearbyText + ' ' + fileName).trim();
          if (text) {
            documents.push({
              id: `${pg.file}-img-${idx}`,
              text: text,
              fullText: alt || title || fileName || 'Image',
              page: pg.file,
              pageTitle: pg.title,
              selector: makeSelector(img, doc),
              thumbnail: img.src,
              type: 'image'
            });
          }
        });
  
        // Index dynamic video content for watch pages
        if (pg.file === 'watch.html' || pg.file === 'watch-video.html') {
          const API_KEY = 'AIzaSyDNxZGB5JB_Btuj1nEhsdCN0Fvrw4ikGrU';
          const UPLOADS_PLAYLIST = 'UUI_3Xab-gpJkN22hR8rOWEQ';
          const playlistResp = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${UPLOADS_PLAYLIST}&key=${API_KEY}`);
          if (playlistResp.ok) {
            const data = await playlistResp.json();
            console.log('YouTube videos fetched:', data.items.length);  // Debug
            data.items.forEach((item, idx) => {
              const title = item.snippet.title;
              const description = item.snippet.description;
              const thumbnail = item.snippet.thumbnails.medium?.url;  // Thumbnail URL
              const videoId = item.snippet.resourceId.videoId;
              if (title) {
                console.log('Indexing video:', title);  // Debug
                documents.push({
                  id: `${pg.file}-video-${idx}`,
                  text: title + ' ' + (description || ''),
                  fullText: title,
                  page: pg.file,
                  pageTitle: pg.title,
                  selector: `#videos`,  // Scroll to video grid top
                  type: 'video',
                  thumbnail: thumbnail,
                  videoId: videoId
                });
              }
            });
          } else {
            console.error('YouTube API failed:', playlistResp.status);  // Debug
          }
        }
      } catch (e) {
        console.error('Failed to load', pg.file, e);
      }
    }
  
    // Build Lunr index
    lunrIndex = lunr(function() {
      this.ref('id');
      this.field('text');
      this.field('pageTitle');
      documents.forEach(doc => this.add(doc));
    });
  
    console.log('Lunr index built from scratch');  // Debug
  
    // Store for persistence (optional, but limits rebuilds)
    searchIndex = documents;
    sessionStorage.setItem('trizenSearchIndex', JSON.stringify(documents));
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
     2. Real-time dropdown with Lunr + thumbnails + instant search
     -------------------------------------------------------------- */
  document.getElementById('q')?.addEventListener('input', () => {
    const q = document.getElementById('q').value.toLowerCase().trim();
    const r = document.getElementById('r');
    if (!q) { r.innerHTML = ''; return; }
  
    console.log('Instant search for:', q);  // Debug
    console.log('lunrIndex exists:', !!lunrIndex);  // Debug
  
    // Use Lunr for instant search with prefix matching
    const results = lunrIndex.search(q + '*').slice(0, 6);
    console.log('Instant results:', results);  // Debug
  
    const hits = results.map(res => {
      const doc = searchIndex.find(d => d.id === res.ref);
      if (!doc) return '';
  
      let thumbnailHtml = '';
      if (doc.thumbnail) {
        thumbnailHtml = `<img src="${doc.thumbnail}" alt="Thumbnail" style="width:60px; height:34px; float:left; margin-right:10px; border-radius:4px;">`;
      }
  
      return `
        <div class="suggestion" data-page="${doc.page}" data-text="${doc.fullText}" data-selector="${doc.selector}" data-videoid="${doc.videoId || ''}">
          ${thumbnailHtml}
          <strong>${doc.pageTitle}</strong><br>
          ${makePreview(doc.fullText, q)}
        </div>`;
    });
  
    r.innerHTML = hits.join('') || '<div class="suggestion">No results</div>';
  });
  
  /* --------------------------------------------------------------
     3. Click handler with improved scrolling and video redirects
     -------------------------------------------------------------- */
  document.getElementById('r')?.addEventListener('click', e => {
    const sug = e.target.closest('.suggestion');
    if (!sug) return;
  
    const targetPage = sug.dataset.page;
    const selector = sug.dataset.selector || null;
    const display = sug.dataset.text;
    const videoId = sug.dataset.videoid || null;
  
    if (targetPage === currentPage) {
      if (selector) {
        const el = document.querySelector(selector);
        if (el) {
          // For videos, scroll to top of grid instead of center to avoid over-scrolling
          const block = videoId ? 'start' : 'center';
          el.scrollIntoView({ behavior: 'smooth', block: block });
          // If video, highlight or focus the specific card after a delay (videos load dynamically)
          if (videoId) {
            setTimeout(() => {
              const videoCard = Array.from(document.querySelectorAll('.video-card')).find(card =>
                card.querySelector('h3')?.textContent.includes(display) ||
                card.querySelector('iframe')?.src.includes(videoId)
              );
              if (videoCard) videoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 1000);  // Wait for videos to load
          }
        }
      }
      const input = document.getElementById('q');
      if (input) input.value = display;
      document.getElementById('r').innerHTML = '';
      return;
    }
  
    // For video suggestions, redirect to individual video page
    let redirectUrl = targetPage;
    if (videoId && targetPage === 'watch-video.html') {
      redirectUrl = `watch-video.html?id=${videoId}`;
    }
  
    sessionStorage.setItem('trizenJump', JSON.stringify({ page: redirectUrl, selector, display, videoId }));
    location.href = redirectUrl;
  });
  
  /* --------------------------------------------------------------
     4. After redirect → scroll + Make Logo Link to Home
     -------------------------------------------------------------- */
  window.addEventListener('load', () => {
    const jump = sessionStorage.getItem('trizenJump');
    if (jump) {
      sessionStorage.removeItem('trizenJump');
      const { display, selector, videoId } = JSON.parse(jump);
      const input = document.getElementById('q');
      if (input) input.value = display;
      if (selector) {
        setTimeout(() => {
          const el = document.querySelector(selector);
          if (el) {
            const block = videoId ? 'start' : 'center';
            el.scrollIntoView({ behavior: 'smooth', block: block });
            // Handle video scrolling on page load
            if (videoId) {
              setTimeout(() => {
                const videoCard = Array.from(document.querySelectorAll('.video-card')).find(card =>
                  card.querySelector('h3')?.textContent.includes(display) ||
                  card.querySelector('iframe')?.src.includes(videoId)
                );
                if (videoCard) videoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 1500);  // Longer delay for page load
            }
          }
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
  });
  
  /* --------------------------------------------------------------
     5. Enter / Go - Both redirect to search results
     -------------------------------------------------------------- */
  function performSearch() {
    const q = document.getElementById('q').value.toLowerCase().trim();
    if (q) {
      window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
    }
  }
  
  document.getElementById('q')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') performSearch();
  });
  
  /* --------------------------------------------------------------
     6. Search button click (same as Enter)
     -------------------------------------------------------------- */
  document.querySelector('.search-bar button')?.addEventListener('click', performSearch);
  
  /* --------------------------------------------------------------
     7. Focus on click
     -------------------------------------------------------------- */
  document.querySelector('.search-bar')?.addEventListener('click', e => {
    const input = document.getElementById('q');
    if (input && !input.contains(e.target) && e.target.tagName !== 'BUTTON') input.focus();
  });
  
  /* --------------------------------------------------------------
     8. Scroll: Shrink navbar + move beside logo (desktop)
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
        if (!isMobile) {
          searchBar?.classList.add('shrunk');
        }
      } else {
        navbar?.classList.remove('shrunk');
        brandHeader?.classList.remove('shrunk');
        if (!isMobile) {
          searchBar?.classList.remove('shrunk');
        }
      }
    }
  
    // Update search bar position (handles mobile positioning)
    updateSearchBarPosition();
    
    lastScrollY = currentScrollY;
  }
  
  // Function to update search bar position based on viewport
  function updateSearchBarPosition() {
    const searchBar = document.querySelector('.search-bar');
    if (!searchBar) return;
    
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // Mobile: always at bottom, remove inline styles that might conflict
      searchBar.style.top = 'auto';
      searchBar.style.bottom = '20px';
      searchBar.style.left = '50%';
      searchBar.style.transform = 'translateX(-50%)';
      searchBar.style.right = 'auto';
      // Remove shrunk class on mobile
      searchBar.classList.remove('shrunk');
    } else {
      // Desktop: reset inline styles, let CSS handle positioning
      searchBar.style.top = '';
      searchBar.style.bottom = '';
      searchBar.style.left = '';
      searchBar.style.transform = '';
      searchBar.style.right = '';
      // Apply shrunk class if scrolled
      if (window.scrollY > 100) {
        searchBar.classList.add('shrunk');
      } else {
        searchBar.classList.remove('shrunk');
      }
    }
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
  
  // Handle window resize to update search bar position
  let resizeTimeout;
  window.addEventListener('resize', () => {
    if (!resizeTimeout) {
      resizeTimeout = requestAnimationFrame(() => {
        updateSearchBarPosition();
        handleScroll(); // Also update scroll state
        resizeTimeout = null;
      });
    }
  }, { passive: true });
  
  // Initialize scroll state and search bar position on load
  window.addEventListener('load', () => {
    handleScroll();
    updateSearchBarPosition();
  });
  
  /* --------------------------------------------------------------
     9. Load state - handled by handleScroll() above
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
    const newData = await (await fetch(`/video/${v.id}`)).json();
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

  /* --------------------------------------------------------------
   10. Hamburger Menu and Toggles
   -------------------------------------------------------------- */
document.getElementById('hamburger-btn')?.addEventListener('click', () => {
  const menu = document.getElementById('dropdown-menu');
  menu.classList.toggle('show');
});

document.getElementById('dark-mode-toggle')?.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
  document.getElementById('dropdown-menu').classList.remove('show');
});

document.getElementById('icons-mode-toggle')?.addEventListener('click', () => {
  const links = document.querySelectorAll('.navbar a');
  links.forEach(link => link.classList.toggle('icon-mode'));
  localStorage.setItem('iconsMode', document.querySelector('.navbar a').classList.contains('icon-mode'));
  document.getElementById('dropdown-menu').classList.remove('show');
});

// Load saved preferences
window.addEventListener('load', () => {
  if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
  }
  if (localStorage.getItem('iconsMode') === 'true') {
      document.querySelectorAll('.navbar a').forEach(link => link.classList.add('icon-mode'));
  }
});