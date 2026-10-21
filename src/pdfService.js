import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Helper to detect if a rendered canvas is completely blank white
function isCanvasBlank(canvas, ctx) {
  try {
    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    // Step by 16 bytes (every 4th pixel) for blazing fast sampling
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const a = d[i + 3];
      // If pixel is opaque/semi-opaque and not near-white
      if (a > 10 && (r < 248 || g < 248 || b < 248)) {
        return false; // Found visible content
      }
    }
    return true; // Blank
  } catch (e) {
    return false;
  }
}

export class PdfService {
  constructor() {
    this.currentDocument = null;
    this.pagesData = [];
  }

  // Load and render a user-uploaded PDF file or ArrayBuffer
  async loadPdf(source, onProgress) {
    try {
      let loadingTask;
      if (source instanceof File) {
        const arrayBuffer = await source.arrayBuffer();
        loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      } else if (typeof source === 'string') {
        try {
          const response = await fetch(source);
          const arrayBuffer = await response.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        } catch (e) {
          loadingTask = pdfjsLib.getDocument({ url: source });
        }
      } else if (source instanceof ArrayBuffer) {
        loadingTask = pdfjsLib.getDocument({ data: source });
      } else {
        throw new Error('Unsupported PDF source type');
      }

      const pdf = await loadingTask.promise;
      this.currentDocument = pdf;
      const numPages = pdf.numPages;
      const renderedPages = [];

      for (let i = 1; i <= numPages; i++) {
        if (onProgress) {
          onProgress({ current: i, total: numPages, percentage: Math.round((i / numPages) * 100) });
        }

        const page = await pdf.getPage(i);
        // Render at high resolution (1.5x - 2.0x for retina sharpness)
        const unscaledViewport = page.getViewport({ scale: 1 });
        const targetWidth = 1000; // standard width for sharp flipbook
        const scale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        // Fill white background before rendering
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        const isBlank = isCanvasBlank(canvas, ctx);

        renderedPages.push({
          pageNumber: i,
          width: canvas.width,
          height: canvas.height,
          aspectRatio: canvas.width / canvas.height,
          dataUrl: canvas.toDataURL('image/jpeg', 0.92),
          isBlank,
        });
      }

      // Automatically detect and remove trailing blank pages
      while (renderedPages.length > 1 && renderedPages[renderedPages.length - 1].isBlank) {
        const removed = renderedPages.pop();
        console.log(`[PdfService] Automatically removed trailing blank page ${removed.pageNumber}`);
      }

      // Re-index remaining pages
      renderedPages.forEach((p, idx) => {
        p.pageNumber = idx + 1;
      });

      this.pagesData = renderedPages;
      return renderedPages;
    } catch (error) {
      console.error('Error rendering PDF:', error);
      throw error;
    }
  }

  // Generate a multi-page interactive Demo Magazine if no PDF is uploaded yet
  generateDemoMagazine() {
    const pages = [];
    const width = 1000;
    const height = 1414; // A4 aspect ratio 1:1.414

    // Helper to create page canvas
    const createPage = (drawFn, pageNum) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      drawFn(ctx, width, height);
      return {
        pageNumber: pageNum,
        width,
        height,
        aspectRatio: width / height,
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      };
    };

    // PAGE 1: Front Cover
    pages.push(
      createPage((ctx, w, h) => {
        // Deep obsidian background with gradient glow
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#0a0d18');
        bgGrad.addColorStop(0.5, '#0f172a');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Geometric decorative sound circles
        const radial = ctx.createRadialGradient(w * 0.5, h * 0.45, 50, w * 0.5, h * 0.45, 450);
        radial.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
        radial.addColorStop(0.4, 'rgba(99, 102, 241, 0.2)');
        radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = radial;
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.45, 450, 0, Math.PI * 2);
        ctx.fill();

        // Waveform rings
        for (let r = 80; r <= 360; r += 45) {
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.45, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(6, 182, 212, ${0.15 + (1 - r / 360) * 0.3})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Magazine Masthead
        ctx.fillStyle = '#06b6d4';
        ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
        ctx.letterSpacing = '6px';
        ctx.fillText('AUDIO VISUAL ARCHIVE • ISSUE #08', 80, 140);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 84px "Outfit", sans-serif';
        ctx.letterSpacing = '-1px';
        ctx.fillText('SONIC HORIZONS', 80, 240);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('The Architecture of Spatial Sound & Acoustic Ecology', 85, 280);

        // Center visual icon / orb
        ctx.save();
        ctx.translate(w * 0.5, h * 0.45);
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(0, 0, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // White play symbol inside center orb
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(w * 0.5 - 10, h * 0.45 - 18);
        ctx.lineTo(w * 0.5 + 20, h * 0.45);
        ctx.lineTo(w * 0.5 - 10, h * 0.45 + 18);
        ctx.closePath();
        ctx.fill();

        // Footer headline boxes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.roundRect(80, h - 340, w - 160, 240, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('FEATURED ARTICLES & INTERACTIVE SESSIONS', 120, h - 280);

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 28px "Outfit", sans-serif';
        ctx.fillText('01. 3D Binaural Soundscapes & Acoustic Resonance', 120, h - 230);
        ctx.fillText('02. Interview: Sound Design in Sci-Fi Cinema', 120, h - 180);
        ctx.fillText('03. Ambient Field Recordings from Nordic Glaciers', 120, h - 130);

        // Corner indicator
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '16px monospace';
        ctx.fillText('CLICK ANY AUDIO BUTTON TO LISTEN', w - 380, h - 50);
      }, 1)
    );

    // PAGE 2: Editorial / Welcome
    pages.push(
      createPage((ctx, w, h) => {
        ctx.fillStyle = '#0f1422';
        ctx.fillRect(0, 0, w, h);

        // Header rule
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(80, 80, 80, 6);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        ctx.letterSpacing = '3px';
        ctx.fillText('EDITORIAL PROLOGUE', 80, 120);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 52px "Outfit", sans-serif';
        ctx.fillText('Welcome to the Sonic Era', 80, 180);

        // Editorial text columns
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '400 20px/34px "Plus Jakarta Sans", sans-serif';
        const p1 = "Sound is the invisible medium that gives dimension to space. In this special edition, we explore how interactive flipbooks transcend static print by allowing readers to listen directly to the source audio, interviews, and sonic demonstrations embedded across every spread.";
        wrapText(ctx, p1, 80, 240, 840, 36);

        // Quote box
        ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
        ctx.roundRect(80, 420, 840, 180, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'italic 26px "Outfit", sans-serif';
        const quote = '"When readers can touch a page and hear the resonant vibrations described in the text, paper awakens into a living experience."';
        wrapText(ctx, quote, 120, 480, 760, 38);

        // Audio Hotspot invitation graphic
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.roundRect(80, 660, 840, 480, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 32px "Outfit", sans-serif';
        ctx.fillText('Interactive Audio Player Showcase', 120, 730);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Click the glowing audio pin on this page to listen to the Editor’s Voice Intro.', 120, 775);

        // Stylized waveform graphic
        drawWaveformVisual(ctx, 120, 840, 760, 120, '#06b6d4');

        // Page number
        ctx.fillStyle = '#64748b';
        ctx.font = '16px monospace';
        ctx.fillText('PAGE 02 • THE ACOUSTIC JOURNAL', 80, h - 60);
      }, 2)
    );

    // PAGE 3: Feature Article - Acoustics in Architecture
    pages.push(
      createPage((ctx, w, h) => {
        ctx.fillStyle = '#0d131f';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#6366f1';
        ctx.fillRect(80, 80, 80, 6);

        ctx.fillStyle = '#818cf8';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('FEATURE ESSAY • CHAPTER 01', 80, 120);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 48px "Outfit", sans-serif';
        ctx.fillText('Acoustics in Modern Spaces', 80, 180);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('How curved timber and geometric diffraction panels shape cathedral reverberation.', 80, 220);

        // Diagram layout
        ctx.fillStyle = 'rgba(99, 102, 241, 0.06)';
        ctx.roundRect(80, 280, 840, 360, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.stroke();

        // Geometric acoustic diagram
        drawAcousticDiffraction(ctx, 500, 460);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '400 20px/34px "Plus Jakarta Sans", sans-serif';
        const p2 = "Architectural acoustics relies on the precise scattering of early reflections. When sound waves collide with quadratic residue diffusers, energy is dispersed uniformly without absorption flutter. The audio hotspot on this page demonstrates the difference between an untreated concrete hall and an acoustic timber chamber.";
        wrapText(ctx, p2, 80, 700, 840, 36);

        // Stat cards
        drawMetricCard(ctx, 80, 920, 260, 140, '1.85s', 'Reverberation RT60');
        drawMetricCard(ctx, 370, 920, 260, 140, '99.4%', 'Diffraction Uniformity');
        drawMetricCard(ctx, 660, 920, 260, 140, '24-bit', 'Lossless Capture');

        ctx.fillStyle = '#64748b';
        ctx.font = '16px monospace';
        ctx.fillText('PAGE 03 • THE ACOUSTIC JOURNAL', 80, h - 60);
      }, 3)
    );

    // PAGE 4: Spatial Audio & Waveform Science
    pages.push(
      createPage((ctx, w, h) => {
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ec4899';
        ctx.fillRect(80, 80, 80, 6);

        ctx.fillStyle = '#f472b6';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('LABORATORY REPORT', 80, 120);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 48px "Outfit", sans-serif';
        ctx.fillText('Spatial Audio & HRTF Mapping', 80, 180);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '400 20px/34px "Plus Jakarta Sans", sans-serif';
        const p3 = "Head-Related Transfer Functions (HRTF) calculate how ear pinna shape, head shadow, and torso reflections localize acoustic sources in 360-degree space. Put on headphones and trigger the audio button below to experience virtual sound positioning.";
        wrapText(ctx, p3, 80, 240, 840, 36);

        // Circular 360 radar graph
        ctx.fillStyle = 'rgba(236, 72, 153, 0.05)';
        ctx.roundRect(80, 420, 840, 460, 24);
        ctx.fill();
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.2)';
        ctx.stroke();

        drawSpatialRadar(ctx, 500, 650);

        ctx.fillStyle = '#f472b6';
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('360° Object-Based Audio Positioning Field', 500, 840);
        ctx.textAlign = 'left';

        // Bottom note
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('• Audio Hotspot Pin #03: Multi-channel Binaural Spatial Sound Demo', 80, 940);
        ctx.fillText('• Recommended: Listen with stereo headphones for maximum immersion', 80, 980);

        ctx.fillStyle = '#64748b';
        ctx.font = '16px monospace';
        ctx.fillText('PAGE 04 • THE ACOUSTIC JOURNAL', 80, h - 60);
      }, 4)
    );

    // PAGE 5: Artist Interview & Soundbite
    pages.push(
      createPage((ctx, w, h) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#10b981';
        ctx.fillRect(80, 80, 80, 6);

        ctx.fillStyle = '#34d399';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('CONVERSATION', 80, 120);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 48px "Outfit", sans-serif';
        ctx.fillText('Interview: Elena Rostova', 80, 180);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Lead Sound Designer at Resonance Studios, Berlin', 80, 220);

        // Profile & Sound snippet box
        ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
        ctx.roundRect(80, 270, 840, 220, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('SOUNDBITE: SYNTHESIZING CINEMATIC TENSION', 120, 330);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'italic 22px "Outfit", sans-serif';
        ctx.fillText('"We layered low-frequency cello bowing with volcanic steam recordings', 120, 380);
        ctx.fillText('to build a sub-bass feeling of impending atmospheric pressure."', 120, 420);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '400 20px/34px "Plus Jakarta Sans", sans-serif';
        const q1 = "Q: What is the most common mistake made in digital flipbooks and multimedia presentations?";
        wrapText(ctx, q1, 80, 560, 840, 34);

        ctx.fillStyle = '#94a3b8';
        const a1 = "A: Treating audio as background noise rather than an interactive anchor. By placing clickable audio hotspots right where key points are made, readers control their pace while enjoying an immersive auditory companion.";
        wrapText(ctx, a1, 80, 620, 840, 34);

        const q2 = "Q: What makes this Publuu-style format so engaging for audiences?";
        wrapText(ctx, q2, 80, 770, 840, 34);

        ctx.fillStyle = '#94a3b8';
        const a2 = "A: The tactile satisfaction of turning realistic 3D pages combined with instant audio hotspots makes digital reading feel physical, modern, and delightfully unexpected.";
        wrapText(ctx, a2, 80, 830, 840, 34);

        ctx.fillStyle = '#64748b';
        ctx.font = '16px monospace';
        ctx.fillText('PAGE 05 • THE ACOUSTIC JOURNAL', 80, h - 60);
      }, 5)
    );

    // PAGE 6: Back Cover & Specifications
    pages.push(
      createPage((ctx, w, h) => {
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#020617');
        bgGrad.addColorStop(0.5, '#0f172a');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Minimalist back cover graphic
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(80, 80, w - 160, h - 160);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 52px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SONIC HORIZONS', w * 0.5, 360);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText('PUBLUU-STYLE INTERACTIVE AUDIO FLIPBOOK', w * 0.5, 410);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Created with FlipAudio Studio • Upload any PDF to create yours', w * 0.5, 480);

        // Tech specs grid
        const boxY = 600;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.roundRect(140, boxY, w - 280, 340, 16);
        ctx.fill();

        ctx.fillStyle = '#06b6d4';
        ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('STUDIO SPECIFICATIONS & CAPABILITIES', w * 0.5, boxY + 60);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('✓ Real-time PDF Upload & Vector-grade High-DPI Rendering', w * 0.5, boxY + 120);
        ctx.fillText('✓ Interactive Pinpoint Audio Hotspots (Upload / Mic / Presets)', w * 0.5, boxY + 160);
        ctx.fillText('✓ Realistic 3D Page Turn with Spatial Paper-Rustle Acoustics', w * 0.5, boxY + 200);
        ctx.fillText('✓ Publuu-Inspired Presentation Mode & Glassmorphic Audio Player', w * 0.5, boxY + 240);
        ctx.fillText('✓ Drag & Drop Hotspot Re-positioning and Offline Persistence', w * 0.5, boxY + 280);

        // Barcode
        drawBarcode(ctx, w * 0.5 - 120, h - 220, 240, 50);

        ctx.fillStyle = '#64748b';
        ctx.font = '14px monospace';
        ctx.fillText('ISBN 978-0-2026-FLIP-AUDIO', w * 0.5, h - 140);
        ctx.textAlign = 'left';
      }, 6)
    );

    this.pagesData = pages;
    return pages;
  }
}

// Helpers for canvas art
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function drawWaveformVisual(ctx, x, y, width, height, color) {
  ctx.save();
  const bars = 48;
  const barWidth = (width / bars) * 0.65;
  const gap = (width / bars) * 0.35;
  for (let i = 0; i < bars; i++) {
    const progress = i / bars;
    const h = (Math.sin(progress * Math.PI * 4) * 0.4 + Math.sin(progress * Math.PI) * 0.6) * height * 0.8 + 10;
    const bx = x + i * (barWidth + gap);
    const by = y + (height - h) / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4 + (i % 3 === 0 ? 0.5 : 0.2);
    ctx.roundRect(bx, by, barWidth, h, 4);
    ctx.fill();
  }
  ctx.restore();
}

function drawMetricCard(ctx, x, y, w, h, val, label) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = '800 38px "Outfit", sans-serif';
  ctx.fillText(val, x + 24, y + 58);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(label, x + 24, y + 100);
}

function drawAcousticDiffraction(ctx, cx, cy) {
  ctx.save();
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    const r1 = 40;
    const r2 = 120 + Math.sin(angle * 5) * 30;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#6366f1';
  ctx.fill();
  ctx.restore();
}

function drawSpatialRadar(ctx, cx, cy) {
  ctx.save();
  for (let r = 50; r <= 160; r += 35) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cx - 170, cy);
  ctx.lineTo(cx + 170, cy);
  ctx.moveTo(cx, cy - 170);
  ctx.lineTo(cx, cy + 170);
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.2)';
  ctx.stroke();

  // Sound emitter nodes
  const nodes = [
    { a: 0.8, r: 120, label: 'L-Front' },
    { a: 2.3, r: 110, label: 'R-Front' },
    { a: 4.2, r: 140, label: 'Surround-L' },
    { a: 5.4, r: 130, label: 'Surround-R' },
  ];
  nodes.forEach((n) => {
    const nx = cx + Math.cos(n.a) * n.r;
    const ny = cy + Math.sin(n.a) * n.r;
    ctx.beginPath();
    ctx.arc(nx, ny, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ec4899';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(n.label, nx + 14, ny + 4);
  });

  // Center listener
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawBarcode(ctx, x, y, w, h) {
  ctx.fillStyle = '#ffffff';
  let curX = x;
  while (curX < x + w) {
    const bw = Math.floor(Math.random() * 4) + 1;
    const gap = Math.floor(Math.random() * 3) + 1;
    ctx.fillRect(curX, y, bw, h);
    curX += bw + gap;
  }
}

export const pdfService = new PdfService();
