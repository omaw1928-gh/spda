import './style.css';
import { createIcons, icons } from 'lucide';
import { FlipbookManager } from './flipbookManager.js';
import { pdfService } from './pdfService.js';
import { hotspotManager } from './hotspotManager.js';
import { audioEngine } from './audioEngine.js';

class FlipbookApp {
  constructor() {
    this.pages = [];
    this.docTitle = 'sp da';
    this.flipbook = null;
    this.zoomLevel = 1.0;
    this.isThumbnailsOpen = false;
    this.availableAudioDocs = [];
    this.resizeTimer = null;

    this.init();
  }

  async init() {
    this.renderAppShell();
    this.bindGlobalEvents();
    this.bindAudioEngineEvents();
    this.bindHotspotManagerEvents();

    // Clear any stale local cache with audio on pageIndex 0
    try {
      const stored = localStorage.getItem('flipbook_audio_hotspots');
      if (stored && stored.includes('"pageIndex":0')) {
        localStorage.removeItem('flipbook_audio_hotspots');
      }
    } catch (_) {}

    // 1. Fetch available audio files from audio-docs
    await this.fetchAudioDocsList();

    // 2. Automatically sync audio files to slides (slide 1 -> slide 1, etc.)
    hotspotManager.syncFromAudioDocs(this.availableAudioDocs);

    // 3. Load sp da.pdf document
    await this.loadSpDaDocument();

    this.refreshIcons();
  }

  refreshIcons() {
    createIcons({ icons });
  }

  // Fetch list of files in audio-docs (from dev backend or static audio-docs.json)
  async fetchAudioDocsList() {
    try {
      const res = await fetch('/api/audio-docs?_t=' + Date.now());
      if (res.ok) {
        this.availableAudioDocs = await res.json();
        return;
      }
    } catch (_) {}

    try {
      const res = await fetch('/audio-docs.json?_t=' + Date.now());
      if (res.ok) {
        this.availableAudioDocs = await res.json();
        return;
      }
    } catch (_) {}

    // Fallback list of known files in audio-docs
    this.availableAudioDocs = [
      'slide 1 story 3.wav',
      'slide 2 story 3.wav',
      'slide 3 story 3.wav',
      'slide 4 story 3.wav',
    ];
  }

  renderAppShell() {
    const app = document.querySelector('#app');
    app.innerHTML = `
      <!-- LOADER OVERLAY -->
      <div class="app-loader-overlay" id="app-loader">
        <div class="app-loader-spinner"></div>
        <div class="app-loader-text">Loading "sp da" Publication...</div>
        <div class="app-loader-sub" id="app-loader-sub">Preparing high-resolution pages</div>
      </div>

      <!-- MAIN STAGE / FLIPBOOK VIEWPORT -->
      <main class="stage-container" id="stage-container">
        <!-- Side Navigation Arrows -->
        <button class="side-nav-arrow left" id="btn-prev-page" title="Previous Page (Left Arrow)">
          <i data-lucide="chevron-left"></i>
        </button>

        <div class="flipbook-wrapper" id="flipbook-wrapper">
          <div id="flipbook-container"></div>
        </div>

        <button class="side-nav-arrow right" id="btn-next-page" title="Next Page (Right Arrow)">
          <i data-lucide="chevron-right"></i>
        </button>
      </main>

      <!-- THUMBNAILS CAROUSEL BAR -->
      <div class="thumbnails-bar" id="thumbnails-bar"></div>

      <!-- READER CONTROLS BOTTOM BAR (CLEAN GLASSMORPHIC) -->
      <div class="reader-controls-bar" id="reader-controls-bar">
        <button class="btn-icon" id="btn-reader-prev" title="Previous Page">
          <i data-lucide="chevron-left"></i>
        </button>

        <div class="page-indicator" id="page-indicator">
          <span>Page 1</span>
        </div>

        <button class="btn-icon" id="btn-reader-next" title="Next Page">
          <i data-lucide="chevron-right"></i>
        </button>

        <div class="divider-vert"></div>

        <button class="btn-icon" id="btn-toggle-thumbs" title="Toggle Page Thumbnails">
          <i data-lucide="layout-grid"></i>
        </button>

        <button class="btn-icon" id="btn-zoom-in" title="Zoom In">
          <i data-lucide="zoom-in"></i>
        </button>

        <button class="btn-icon" id="btn-zoom-out" title="Zoom Out">
          <i data-lucide="zoom-out"></i>
        </button>

        <button class="btn-icon" id="btn-reader-sound" title="Page Flip Sound FX">
          <i data-lucide="volume-2"></i>
        </button>

        <button class="btn-icon" id="btn-fullscreen" title="Fullscreen Mode">
          <i data-lucide="maximize"></i>
        </button>
      </div>
    `;
  }

  // Load "sp da.pdf" automatically
  async loadSpDaDocument() {
    const loader = document.querySelector('#app-loader');
    const loaderSub = document.querySelector('#app-loader-sub');

    try {
      if (loaderSub) loaderSub.textContent = 'Parsing sp da publication...';

      const pages = await pdfService.loadPdf('/sp-da.pdf', ({ current, total, percentage }) => {
        if (loaderSub) {
          loaderSub.textContent = `Rendering page ${current} of ${total} (${percentage}%)...`;
        }
      });

      this.pages = pages;
      this.docTitle = 'sp da';

      // Automatically map audio files to slides
      hotspotManager.syncFromAudioDocs(this.availableAudioDocs);

      this.setupFlipbook();
      this.renderThumbnails();

      // Hide loader
      if (loader) {
        loader.classList.add('hidden');
      }
    } catch (e) {
      console.error('PDF Load Error:', e);
      if (loaderSub) {
        loaderSub.textContent = 'Error loading sp da.pdf: ' + e.message;
      }
    }
  }

  setupFlipbook() {
    this.initFlipbook();
  }

  initFlipbook() {
    const wrapper = document.querySelector('#flipbook-wrapper');
    if (!wrapper || this.pages.length === 0) return;

    // Destroy existing instance cleanly if re-initializing
    if (this.flipbook) {
      try {
        this.flipbook.destroy();
      } catch (err) {
        console.warn('Flipbook destroy warning:', err);
      }
      this.flipbook = null;
    }

    // Ensure a fresh, clean #flipbook-container element exists inside wrapper
    let container = wrapper.querySelector('#flipbook-container');
    if (container) {
      container.remove();
    }
    container = document.createElement('div');
    container.id = 'flipbook-container';
    wrapper.appendChild(container);

    // Create page-block elements
    this.pages.forEach((page, idx) => {
      const pageEl = document.createElement('div');
      pageEl.className = 'page-block';
      pageEl.setAttribute('data-density', idx === 0 || idx === this.pages.length - 1 ? 'hard' : 'soft');
      pageEl.setAttribute('data-page-index', idx);

      const content = document.createElement('div');
      content.className = 'page-content';

      const img = document.createElement('img');
      img.className = 'page-img';
      img.src = page.dataUrl;
      img.alt = `Page ${page.pageNumber}`;

      const hotspotLayer = document.createElement('div');
      hotspotLayer.className = 'page-hotspots-layer';
      hotspotLayer.setAttribute('data-page-index', idx);

      content.appendChild(img);
      content.appendChild(hotspotLayer);
      pageEl.appendChild(content);
      container.appendChild(pageEl);
    });

    // Calculate dynamic proportions based on PDF page aspect ratio and screen size
    const isSinglePage = window.innerWidth < 850;
    const firstPage = this.pages[0];
    const aspectRatio = firstPage && firstPage.aspectRatio ? firstPage.aspectRatio : 0.707;

    // Fullscreen PDF sizing - maximize viewport usage without arbitrary caps
    const availableHeight = Math.max(380, window.innerHeight - (isSinglePage ? 20 : 36));
    const availableWidth = Math.max(320, window.innerWidth - (isSinglePage ? 16 : 40));
    const spreadFactor = isSinglePage ? 1 : 2;

    let baseHeight = availableHeight;
    let baseWidth = Math.round(baseHeight * aspectRatio);

    if (baseWidth * spreadFactor > availableWidth) {
      baseWidth = Math.floor(availableWidth / spreadFactor);
      baseHeight = Math.round(baseWidth / aspectRatio);
    }

    // Set fixed dimensions so StPageFlip never shifts
    const totalWidth = baseWidth * spreadFactor;
    container.style.width = `${totalWidth}px`;
    container.style.height = `${baseHeight}px`;

    // Initialize centering immediately based on initial page
    this.updateFlipbookCentering(0, this.pages.length);

    this.flipbook = new FlipbookManager(container, {
      width: baseWidth,
      height: baseHeight,
      usePortrait: isSinglePage,
      showCover: true,
    });

    this.flipbook.init('.page-block');

    this.flipbook.subscribe(({ currentPage, totalPages }) => {
      this.updatePageIndicator(currentPage, totalPages);
      this.updateActiveThumbnail(currentPage);
      this.updateFlipbookCentering(currentPage, totalPages);
      this.updateNavButtons(currentPage, totalPages);

      // When turning pages, pause any previously playing voice
      if (audioEngine.isPlaying) {
        audioEngine.pause();
      }
    });

    this.updateNavButtons(0, this.pages.length);
    this.renderHotspotsOnPages();
  }

  updateFlipbookCentering(current, total) {
    const container = document.querySelector('#flipbook-container');
    if (!container) return;

    const isSinglePage = window.innerWidth < 850;
    if (isSinglePage) {
      container.style.transform = 'translateX(0)';
      return;
    }

    // Inspect StPageFlip collection if initialized
    if (this.flipbook && this.flipbook.pageFlip) {
      try {
        const pageCol = this.flipbook.pageFlip.getPageCollection();
        const spreadIdx = pageCol.getCurrentSpreadIndex();
        const spreads = pageCol.getSpread();
        const currentSpread = spreads[spreadIdx];
        if (currentSpread && currentSpread.length === 1) {
          if (currentSpread[0] === 0) {
            // Front cover on right leaf -> shift left by 25% of 2-page container to center it
            container.style.transform = 'translateX(-25%)';
            return;
          } else if (currentSpread[0] >= total - 1) {
            // Back cover on left leaf -> shift right by 25% of 2-page container to center it
            container.style.transform = 'translateX(25%)';
            return;
          }
        }
      } catch (_) {}
    }

    if (current === 0) {
      // Single page front cover
      container.style.transform = 'translateX(-25%)';
    } else if (current >= total - 1) {
      // Single page back cover
      container.style.transform = 'translateX(25%)';
    } else {
      // Regular two-page spread
      container.style.transform = 'translateX(0)';
    }
  }

  updateNavButtons(current, total) {
    const isFirst = current === 0;
    const isLast = current >= total - 1;

    const prevBtns = [document.querySelector('#btn-prev-page'), document.querySelector('#btn-reader-prev')];
    const nextBtns = [document.querySelector('#btn-next-page'), document.querySelector('#btn-reader-next')];

    prevBtns.forEach((btn) => {
      if (btn) {
        btn.style.opacity = isFirst ? '0.2' : '1';
        btn.style.pointerEvents = isFirst ? 'none' : 'auto';
      }
    });

    nextBtns.forEach((btn) => {
      if (btn) {
        btn.style.opacity = isLast ? '0.2' : '1';
        btn.style.pointerEvents = isLast ? 'none' : 'auto';
      }
    });
  }

  updatePageIndicator(current, total) {
    const indicator = document.querySelector('#page-indicator');
    if (indicator) {
      if (current === 0) {
        indicator.textContent = `Cover (Page 1 of ${total})`;
      } else if (current === total - 1) {
        indicator.textContent = `Back Cover (Page ${total} of ${total})`;
      } else {
        const leftPage = current + 1;
        const rightPage = Math.min(total, current + 2);
        indicator.textContent = `Pages ${leftPage}-${rightPage} of ${total}`;
      }
    }
  }

  /**
   * Render audio pins strictly for slides that have matching audio files in audio-docs.
   * Renders as a translucent glassmorphic button with crisp black speaker SVG.
   */
  renderHotspotsOnPages() {
    const layers = document.querySelectorAll('.page-hotspots-layer');
    layers.forEach((layer) => {
      layer.innerHTML = '';
      const pageIndex = parseInt(layer.getAttribute('data-page-index'), 10);

      // Slide 1 (Cover / pageIndex 0) strictly has NO audio
      if (pageIndex === 0) return;

      const pageHotspots = hotspotManager.getHotspotsForPage(pageIndex);

      pageHotspots.forEach((hs) => {
        const pin = document.createElement('div');
        pin.className = 'hotspot-pin';
        pin.id = `pin-${hs.id}`;
        pin.style.left = `${hs.x}%`;
        pin.style.top = `${hs.y}%`;
        pin.style.color = '#000000';

        const isCurrentPlaying = audioEngine.isPlaying && audioEngine.currentHotspotId === hs.id;
        if (isCurrentPlaying) {
          pin.classList.add('is-playing');
        }

        pin.innerHTML = `
          <div class="hotspot-badge" title="${hs.title}">
            <svg class="speaker-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#000000" stroke="#000000"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </div>
          <div class="hotspot-tooltip">
            <span class="hotspot-tooltip-title">${hs.title}</span>
            <span class="hotspot-tooltip-sub">${hs.subtitle || 'Click to play audio'}</span>
          </div>
        `;

        // Prevent flipbook drag interference
        pin.addEventListener('mousedown', (e) => e.stopPropagation());
        pin.addEventListener('touchstart', (e) => e.stopPropagation());

        // Play / pause audio on click
        pin.addEventListener('click', (e) => {
          e.stopPropagation();
          audioEngine.playHotspotAudio(hs);
        });

        layer.appendChild(pin);
      });
    });

    this.refreshIcons();
  }

  renderThumbnails() {
    const bar = document.querySelector('#thumbnails-bar');
    if (!bar) return;

    bar.innerHTML = this.pages
      .map(
        (p, idx) => `
      <div class="thumb-item ${idx === 0 ? 'active' : ''}" data-page="${idx}">
        <img class="thumb-img" src="${p.dataUrl}" alt="Page ${idx + 1}" loading="lazy" />
        <span class="thumb-label">${idx === 0 ? 'Cover' : idx + 1}</span>
      </div>
    `
      )
      .join('');

    bar.querySelectorAll('.thumb-item').forEach((item) => {
      item.addEventListener('click', () => {
        const pageIdx = parseInt(item.getAttribute('data-page'), 10);
        if (this.flipbook) {
          this.updateFlipbookCentering(pageIdx, this.pages.length);
          this.flipbook.goToPage(pageIdx);
        }
      });
    });
  }

  updateActiveThumbnail(pageIdx) {
    document.querySelectorAll('.thumb-item').forEach((item) => {
      const idx = parseInt(item.getAttribute('data-page'), 10);
      item.classList.toggle('active', idx === pageIdx);
    });
  }

  bindGlobalEvents() {
    const onNext = () => {
      if (!this.flipbook) return;
      const cur = this.flipbook.getCurrentPage();
      const tot = this.pages.length;
      if (cur === 0) {
        this.updateFlipbookCentering(1, tot);
      } else if (cur + 2 >= tot - 1) {
        this.updateFlipbookCentering(tot - 1, tot);
      }
      this.flipbook.flipNext();
    };

    const onPrev = () => {
      if (!this.flipbook) return;
      const cur = this.flipbook.getCurrentPage();
      const tot = this.pages.length;
      if (cur >= tot - 1) {
        this.updateFlipbookCentering(tot - 3, tot);
      } else if (cur <= 2) {
        this.updateFlipbookCentering(0, tot);
      }
      this.flipbook.flipPrev();
    };

    // Navigation arrows
    document.querySelector('#btn-prev-page')?.addEventListener('click', onPrev);
    document.querySelector('#btn-next-page')?.addEventListener('click', onNext);
    document.querySelector('#btn-reader-prev')?.addEventListener('click', onPrev);
    document.querySelector('#btn-reader-next')?.addEventListener('click', onNext);

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      }
    });

    // Thumbnails toggle
    document.querySelector('#btn-toggle-thumbs')?.addEventListener('click', () => {
      this.isThumbnailsOpen = !this.isThumbnailsOpen;
      document.querySelector('#thumbnails-bar')?.classList.toggle('open', this.isThumbnailsOpen);
    });

    // Fullscreen toggle
    document.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => console.warn(err));
      } else {
        document.exitFullscreen().catch((err) => console.warn(err));
      }
    });

    // Zoom controls
    document.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.zoomLevel = Math.min(1.8, this.zoomLevel + 0.15);
      const wrapper = document.querySelector('#flipbook-wrapper');
      if (wrapper) wrapper.style.transform = `scale(${this.zoomLevel})`;
    });
    document.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.zoomLevel = Math.max(0.7, this.zoomLevel - 0.15);
      const wrapper = document.querySelector('#flipbook-wrapper');
      if (wrapper) wrapper.style.transform = `scale(${this.zoomLevel})`;
    });

    // Master Voice Audio toggle (Turn Voice Off / Turn Voice On)
    document.querySelector('#btn-reader-sound')?.addEventListener('click', () => {
      this.toggleMasterAudio();
    });

    // Auto-detect newly added audio files when window regains focus
    let lastFocusSync = 0;
    window.addEventListener('focus', async () => {
      const now = Date.now();
      if (now - lastFocusSync < 1500) return;
      lastFocusSync = now;

      const prevJson = JSON.stringify(this.availableAudioDocs);
      await this.fetchAudioDocsList();
      if (JSON.stringify(this.availableAudioDocs) !== prevJson) {
        hotspotManager.syncFromAudioDocs(this.availableAudioDocs);
        this.renderHotspotsOnPages();
      }
    });

    // Auto-resize on window resize and fullscreen toggle
    window.addEventListener('resize', () => this.handleWindowResize());
    document.addEventListener('fullscreenchange', () => this.handleWindowResize());
  }

  getCurrentPageHotspot() {
    if (!this.flipbook) return null;
    const cur = this.flipbook.getCurrentPage();
    // In spread mode, check left page first (cur)
    let hotspots = hotspotManager.getHotspotsForPage(cur);
    if (hotspots && hotspots.length > 0) return hotspots[0];
    // Also check right page of the spread (cur + 1)
    if (cur + 1 < this.pages.length) {
      hotspots = hotspotManager.getHotspotsForPage(cur + 1);
      if (hotspots && hotspots.length > 0) return hotspots[0];
    }
    return null;
  }

  toggleMasterAudio() {
    // If voice is currently playing:
    if (audioEngine.isPlaying || (!audioEngine.isMuted && audioEngine.currentAudio && !audioEngine.currentAudio.paused)) {
      // TURN OFF: Voice should be off!
      audioEngine.mute();
    } else {
      // TURN ON: Voice should come!
      audioEngine.unmute();
      // If no audio is currently loaded or it ended, play voice for the visible slide
      if (!audioEngine.currentAudio || audioEngine.currentAudio.ended) {
        const hs = this.getCurrentPageHotspot();
        if (hs) {
          audioEngine.playHotspotAudio(hs);
        }
      } else if (audioEngine.currentAudio && audioEngine.currentAudio.paused) {
        audioEngine.currentAudio.play().catch(() => {
          const hs = this.getCurrentPageHotspot();
          if (hs) audioEngine.playHotspotAudio(hs);
        });
      }
    }
    this.updateAudioButtonUI();
  }

  updateAudioButtonUI() {
    const el = document.querySelector('#btn-reader-sound');
    if (!el) return;

    const isVoiceActive = !audioEngine.isMuted && audioEngine.isPlaying;
    const isMuted = audioEngine.isMuted;

    const iconName = isMuted ? 'volume-x' : 'volume-2';
    el.innerHTML = `<i data-lucide="${iconName}"></i>`;
    el.title = isVoiceActive
      ? 'Voice is Playing (Click to turn voice off)'
      : (isMuted ? 'Voice is Off (Click to turn voice on)' : 'Turn Voice On');
    el.classList.toggle('active', isVoiceActive);
    this.refreshIcons();
  }

  handleWindowResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      if (this.pages && this.pages.length > 0 && this.flipbook) {
        const currentPg = this.flipbook.getCurrentPage();
        this.initFlipbook();
        if (this.flipbook) {
          this.flipbook.goToPage(currentPg);
        }
      }
    }, 150);
  }

  bindAudioEngineEvents() {
    audioEngine.subscribe((state) => {
      document.querySelectorAll('.hotspot-pin').forEach((pin) => {
        const isThis = pin.id === `pin-${state.currentHotspotId}`;
        pin.classList.toggle('is-playing', isThis && state.isPlaying);
      });
      this.updateAudioButtonUI();
    });
  }

  bindHotspotManagerEvents() {
    hotspotManager.subscribe(() => {
      this.renderHotspotsOnPages();
    });
  }
}

// Instantiate FlipbookApp on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  new FlipbookApp();
});
