import { PageFlip } from 'page-flip';
import { audioEngine } from './audioEngine.js';

export class FlipbookManager {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.pageFlip = null;
    this.currentPage = 0;
    this.totalPages = 0;
    this.subscribers = new Set();
    this.options = {
      width: options.width || 540,
      height: options.height || 764,
      size: 'fixed',
      autoSize: false,
      minWidth: options.width || 540,
      maxWidth: options.width || 540,
      minHeight: options.height || 764,
      maxHeight: options.height || 764,
      maxShadowOpacity: 0.5,
      showCover: true,
      mobileScrollSupport: false,
      usePortrait: options.usePortrait || false,
      flippingTime: 650,
      drawShadow: true,
      showPageCorners: true,
      useMouseEvents: true,
      swipeDistance: 30,
      ...options,
    };
  }

  init(pagesContainerSelector) {
    if (this.pageFlip) {
      this.destroy();
    }

    try {
      this.pageFlip = new PageFlip(this.container, this.options);

      const pageElements = document.querySelectorAll(pagesContainerSelector);
      this.totalPages = pageElements.length;

      this.pageFlip.loadFromHTML(pageElements);

      this.pageFlip.on('flip', (e) => {
        this.currentPage = e.data;
        audioEngine.playPageFlipSound();
        this.notifySubscribers();
      });

      this.pageFlip.on('changeState', (e) => {
        // e.data: 'user_fold', 'fold_corner', 'flipping', 'read'
      });

      this.pageFlip.on('init', () => {
        this.currentPage = this.pageFlip.getCurrentPageIndex();
        this.notifySubscribers();
      });
    } catch (err) {
      console.error('PageFlip init error:', err);
    }
  }

  flipNext() {
    if (this.pageFlip) {
      this.pageFlip.flipNext();
    }
  }

  flipPrev() {
    if (this.pageFlip) {
      this.pageFlip.flipPrev();
    }
  }

  goToPage(pageIndex) {
    if (this.pageFlip && pageIndex >= 0 && pageIndex < this.totalPages) {
      this.pageFlip.flip(pageIndex);
    }
  }

  getCurrentPage() {
    return this.pageFlip ? this.pageFlip.getCurrentPageIndex() : this.currentPage;
  }

  getPageCount() {
    return this.totalPages;
  }

  updateOrientation(isSingle) {
    if (this.pageFlip) {
      // Re-initialize or adjust settings
      this.options.usePortrait = isSingle;
    }
  }

  destroy() {
    if (this.pageFlip) {
      try {
        this.pageFlip.destroy();
      } catch (e) {
        console.warn('Destroy error:', e);
      }
      this.pageFlip = null;
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    const state = {
      currentPage: this.getCurrentPage(),
      totalPages: this.totalPages,
    };
    this.subscribers.forEach((cb) => cb(state));
  }
}
