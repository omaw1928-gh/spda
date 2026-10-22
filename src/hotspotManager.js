// Hotspot Manager: Manages automatic slide-to-audio matching and flipbook page pins

/**
 * Extracts the 1-based slide/page number from an audio filename.
 * Supports patterns like:
 * - "slide 1 story 3.wav", "slide1.mp3", "slide_2.wav", "slide-3.m4a"
 * - "audio 1.wav", "audio1.mp3", "audio_2.wav"
 * - "page 1.wav", "page1.mp3", "page_2.wav"
 * - "1 - story.wav", "01.mp3", "2.wav"
 */
export function extractSlideNumber(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const base = filename.replace(/\.[^/.]+$/, '').trim();

  // Pattern A: explicitly contains "slide", "audio", "page", or "track" followed by a number
  const prefixMatch = base.match(/(?:slide|audio|page|track)[\s_-]*(\d+)/i);
  if (prefixMatch) {
    return parseInt(prefixMatch[1], 10);
  }

  // Pattern B: begins with a number (e.g. "1 - story", "02_commentary", "3.wav")
  const startNumMatch = base.match(/^(\d+)[\s._-]/);
  if (startNumMatch) {
    return parseInt(startNumMatch[1], 10);
  }

  return null;
}

export class HotspotManager {
  constructor() {
    this.hotspots = [];
    this.subscribers = new Set();
    this.lastSavedJson = null;
    this.loadFromStorage();
  }

  /**
   * Helper to normalize hotspot properties and enforce placement rules:
   * Odd slides (targetSlideNum % 2 !== 0): button on top-left (x: 10, y: 8)
   * Even slides (targetSlideNum % 2 === 0): button on top-right (x: 90, y: 8)
   */
  normalizeHotspot(h) {
    const targetSlideNum = (h.pageIndex ?? 0) + 1;
    const isOdd = targetSlideNum % 2 !== 0;
    return {
      ...h,
      x: isOdd ? 10 : 90,
      y: 8,
      isOddSlide: isOdd,
      icon: 'volume-2',
      color: '#000000',
    };
  }

  /**
   * Synchronize audio pins strictly from audio-docs folder:
   * Audio 1 corresponds to Slide 2 (even -> top-right x: 90).
   * Audio 2 corresponds to Slide 3 (odd -> top-left x: 10).
   * Audio N corresponds to Slide N+1.
   * Slides without audio files have no button.
   */
  syncFromAudioDocs(audioFiles) {
    if (!Array.isArray(audioFiles) || audioFiles.length === 0) {
      return this.hotspots;
    }

    const audioMap = new Map(); // audioNum (1, 2, 3...) -> filename

    for (const file of audioFiles) {
      const audioNum = extractSlideNumber(file);
      if (audioNum !== null && audioNum > 0) {
        const current = audioMap.get(audioNum);
        if (!current) {
          audioMap.set(audioNum, file);
        } else if (file.endsWith('.mp3')) {
          // Prioritize clean universal .mp3
          audioMap.set(audioNum, file);
        } else if (!current.endsWith('.mp3') && /^audio/i.test(file)) {
          audioMap.set(audioNum, file);
        }
      }
    }

    const newHotspots = [];
    audioMap.forEach((filename, audioNum) => {
      // Audio 1 corresponds to Slide 2, Audio 2 to Slide 3, Audio N to Slide N+1
      const targetSlideNum = audioNum + 1;
      const pageIndex = targetSlideNum - 1; // In 0-indexed flipbook, Slide 2 is pageIndex 1

      // Placement rule:
      // Odd slides -> top-left side of slide (x: 10, y: 8)
      // Even slides -> top-right side of slide (x: 90, y: 8)
      const isOdd = targetSlideNum % 2 !== 0;
      const xPos = isOdd ? 10 : 90;
      const yPos = 8;

      const baseName = filename.replace(/\.[^/.]+$/, '');
      const fallbackFilename = filename.endsWith('.mp3')
        ? (audioNum <= 4 ? `slide ${audioNum} story 3.mp3` : `audio ${audioNum}.wav`)
        : `${baseName}.mp3`;

      newHotspots.push({
        id: `hs_slide_${targetSlideNum}`,
        pageIndex: pageIndex,
        x: xPos,
        y: yPos,
        isOddSlide: isOdd,
        title: `Slide ${targetSlideNum} Audio`,
        subtitle: filename,
        audioType: 'audiodoc',
        audioSrc: `/audio-docs/${encodeURIComponent(filename)}`,
        fallbackSrc: `/audio-docs/${encodeURIComponent(fallbackFilename)}`,
        audioDocFilename: filename,
        icon: 'volume-2',
        color: '#000000',
      });
    });

    // Ensure first slide (pageIndex 0) never has audio, and sort ascending by pageIndex
    const filteredHotspots = newHotspots.filter((h) => h.pageIndex > 0);
    filteredHotspots.sort((a, b) => a.pageIndex - b.pageIndex);

    const currentJson = JSON.stringify(this.hotspots);
    const newJson = JSON.stringify(filteredHotspots);
    if (currentJson === newJson) {
      return this.hotspots;
    }

    this.hotspots = filteredHotspots;
    this.saveToStorage();
    this.notifySubscribers();
    return filteredHotspots;
  }

  getHotspot(id) {
    return this.hotspots.find((h) => h.id === id);
  }

  getHotspotsForPage(pageIndex) {
    // First slide (Cover / pageIndex 0) strictly has no audio
    if (pageIndex === 0) return [];
    return this.hotspots.filter((h) => h.pageIndex === pageIndex);
  }

  getAllHotspots() {
    return this.hotspots;
  }

  clearAllHotspots() {
    if (this.hotspots.length === 0) return;
    this.hotspots = [];
    this.saveToStorage();
    this.notifySubscribers();
  }

  saveToStorage() {
    try {
      const serialized = JSON.stringify(this.hotspots);
      // Guard against redundant saves
      if (this.lastSavedJson === serialized) return;
      this.lastSavedJson = serialized;

      localStorage.setItem('flipbook_audio_hotspots', serialized);
      fetch('/api/save-hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      }).catch((err) => console.warn('Save to backend failed:', err));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  async loadFromStorage() {
    // 1. Try local dev backend endpoint (/api/hotspots)
    try {
      const res = await fetch('/api/hotspots');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.hotspots = data.map((h) => this.normalizeHotspot(h));
          this.lastSavedJson = JSON.stringify(this.hotspots);
          this.notifySubscribers();
          return;
        }
      }
    } catch (_) {}

    // 2. Try static public file (/hotspots.json on deployed static sites)
    try {
      const res = await fetch('/hotspots.json?_t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.hotspots = data.map((h) => this.normalizeHotspot(h));
          this.lastSavedJson = JSON.stringify(this.hotspots);
          this.notifySubscribers();
          return;
        }
      }
    } catch (_) {}

    // 3. Try LocalStorage
    try {
      const stored = localStorage.getItem('flipbook_audio_hotspots');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.hotspots = parsed.map((h) => this.normalizeHotspot(h));
          this.lastSavedJson = JSON.stringify(this.hotspots);
          this.notifySubscribers();
          return;
        }
      }
    } catch (_) {}
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach((cb) => cb(this.hotspots));
  }
}

export const hotspotManager = new HotspotManager();
