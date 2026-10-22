// Audio Engine: Web Audio synthesis, Microphone recording, Audio playback & Visualizer

class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.currentAudio = null;
    this.currentHotspotId = null;
    this.currentHotspot = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.analyser = null;
    this.dataArray = null;
    this.volume = 0.85;
    this.soundEffectsEnabled = true;
    this.subscribers = new Set();
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.audioCache = new Map();
    this.preloadPromises = new Map();
  }

  getAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // Realistic paper-flip sound synthesis
  playPageFlipSound() {
    if (!this.soundEffectsEnabled || this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      const bufferSize = ctx.sampleRate * 0.22; // ~220ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // White noise with pinkish decay
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.1;
        b2 = 0.85 * b2 + white * 0.15;
        const pink = (b0 + b1 + b2 + white * 0.5) * 0.3;
        
        // Envelope: quick attack, textured friction mid, gentle decay
        const progress = i / bufferSize;
        const envelope = Math.sin(progress * Math.PI) * Math.pow(1 - progress, 0.4);
        data[i] = pink * envelope * 0.45;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;

      // Bandpass filter to mimic paper rustle frequency
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.2);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noiseSource.start();
    } catch (e) {
      console.warn('Page flip sound error:', e);
    }
  }

  // Generate synthetic preset audio data URLs using Web Audio API buffer export to WAV
  createPresetAudio(presetName) {
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
      2, 44100 * 12, 44100 // 12-second rich loops
    );

    const now = 0;
    const dur = 12.0;

    if (presetName === 'ambient') {
      // Warm ambient chord pad with gentle shimmer
      const chordFrequencies = [220, 277.18, 329.63, 440, 554.37]; // A major 9
      chordFrequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        
        // Subtle LFO vibrato
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.3 + idx * 0.1, now);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(3.0, now);
        lfo.connect(osc.frequency);
        lfo.start();

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08 / chordFrequencies.length, now + 2.5);
        gain.gain.setValueAtTime(0.08 / chordFrequencies.length, now + dur - 2.5);
        gain.gain.linearRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
      });
    } else if (presetName === 'piano') {
      // Gentle cascading piano arpeggio
      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 329.63, 440.00, 523.25];
      notes.forEach((freq, index) => {
        const t = now + index * 0.9;
        if (t >= dur) return;

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 2.0);
      });
    } else if (presetName === 'tech') {
      // Tech pulse / modern dynamic soundscape
      const tempo = 0.5;
      for (let t = now; t < dur; t += tempo) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + 0.2);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      }
    } else {
      // Default: Cinematic chime & warm harmonic bell
      const bellFreqs = [523.25, 659.25, 783.99, 1046.50];
      bellFreqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.3);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now + idx * 0.3);
        gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.3 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.3 + 4.5);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.3);
        osc.stop(now + idx * 0.3 + 5.0);
      });
    }

    return ctx.startRendering().then(renderedBuffer => {
      return this.bufferToWaveBlobUrl(renderedBuffer);
    });
  }

  // Convert AudioBuffer to WAV Blob URL
  bufferToWaveBlobUrl(abuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    function setUint16(data) {
      out.setUint16(pos, data, true);
      pos += 2;
    }
    function setUint32(data) {
      out.setUint32(pos, data, true);
      pos += 4;
    }

    // RIFF identifier
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);  // file length - 8
    setUint32(0x45564157); // "WAVE"

    // format chunk identifier
    setUint32(0x20746d66); // "fmt "
    setUint32(16);          // length = 16
    setUint16(1);           // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit

    // data chunk identifier
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4); // chunk length

    for (let i = 0; i < abuffer.numberOfChannels; i++) {
      channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    const blob = new Blob([out.buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // Microphone recording
  async startRecording() {
    this.recordedChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
    return true;
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('No media recorder active'));
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);

        // Stop all tracks
        if (this.mediaRecorder.stream) {
          this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        }

        resolve({ blob, url });
      };

      this.mediaRecorder.stop();
    });
  }

  cleanAudioUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('/audio-docs/')) {
      const filename = url.replace('/audio-docs/', '');
      return `/audio-docs/${encodeURIComponent(decodeURIComponent(filename))}`;
    }
    return url;
  }

  // Preload an audio file into browser memory/Cache API with zero playback
  async preloadAudio(rawUrl) {
    const url = this.cleanAudioUrl(rawUrl);
    if (!url) return null;

    if (this.audioCache.has(url)) {
      return this.audioCache.get(url);
    }
    if (this.preloadPromises.has(url)) {
      return this.preloadPromises.get(url);
    }

    const promise = (async () => {
      try {
        let blob = null;

        // Try CacheStorage first for persistent speed
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const cache = await window.caches.open('spda-audio-cache-v1');
            const cachedRes = await cache.match(url);
            if (cachedRes) {
              blob = await cachedRes.blob();
            } else {
              const netRes = await fetch(url, { cache: 'force-cache' });
              if (netRes.ok) {
                cache.put(url, netRes.clone()).catch(() => {});
                blob = await netRes.blob();
              }
            }
          } catch (_) {}
        }

        if (!blob) {
          const res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          blob = await res.blob();
        }

        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = objectUrl;
        audio.volume = this.volume;
        audio.load();

        const item = { url, blob, objectUrl, audio };
        this.audioCache.set(url, item);
        return item;
      } catch (err) {
        console.warn('Preload audio error for', url, err);
        return null;
      } finally {
        this.preloadPromises.delete(url);
      }
    })();

    this.preloadPromises.set(url, promise);
    return promise;
  }

  // Preload all audio files in the cache only (zero delay on click, completely silent)
  async preloadHotspotAudios(hotspots) {
    if (!Array.isArray(hotspots) || hotspots.length === 0) return;
    const urls = new Set();
    hotspots.forEach((hs) => {
      if (hs.audioSrc) urls.add(hs.audioSrc);
      if (hs.fallbackSrc) urls.add(hs.fallbackSrc);
    });

    const tasks = Array.from(urls).map((u) => this.preloadAudio(u));
    await Promise.allSettled(tasks);
  }

  // Play audio for a hotspot instantly with zero delay from preloaded cache
  async playHotspotAudio(hotspot) {
    if (this.currentHotspotId === hotspot.id && this.isPlaying) {
      this.pause();
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }

    // Always un-mute when an audio is explicitly played
    this.isMuted = false;
    this.soundEffectsEnabled = true;

    // If preset audio and URL not ready yet, generate it now
    if (hotspot.audioType === 'preset' && !hotspot.audioDataUrl) {
      try {
        hotspot.audioDataUrl = await this.createPresetAudio(hotspot.presetName || 'ambient');
      } catch (e) {
        console.warn('Preset audio generation failed:', e);
      }
    }

    let audioUrl = hotspot.audioDataUrl || hotspot.audioSrc;
    if (!audioUrl) {
      console.warn('No audio URL found for hotspot', hotspot);
      return;
    }

    const cleanUrl = this.cleanAudioUrl(audioUrl);

    // Retrieve from preloaded cache or load immediately
    let cached = this.audioCache.get(cleanUrl);
    if (!cached) {
      cached = await this.preloadAudio(cleanUrl);
    }

    let audio;
    if (cached && cached.audio) {
      audio = cached.audio;
      audio.currentTime = 0;
      audio.volume = this.volume;
    } else {
      audio = new Audio(cached ? cached.objectUrl : cleanUrl);
      audio.volume = this.volume;
    }

    this.currentAudio = audio;
    this.currentHotspotId = hotspot.id;
    this.currentHotspot = hotspot;
    this.isPlaying = true;

    audio.onplay = () => {
      this.isPlaying = true;
      this.notifySubscribers();
    };

    audio.onpause = () => {
      this.isPlaying = false;
      this.notifySubscribers();
    };

    audio.onended = () => {
      this.isPlaying = false;
      this.notifySubscribers();
    };

    audio.onerror = async () => {
      if (hotspot.fallbackSrc) {
        console.log('Primary audio load failed, attempting fallbackSrc:', hotspot.fallbackSrc);
        const fbClean = this.cleanAudioUrl(hotspot.fallbackSrc);
        let fbCached = this.audioCache.get(fbClean);
        if (!fbCached) {
          fbCached = await this.preloadAudio(fbClean);
        }
        if (fbCached && fbCached.audio) {
          this.currentAudio = fbCached.audio;
          this.currentAudio.currentTime = 0;
          this.currentAudio.volume = this.volume;
          this.currentAudio.play().catch((e) => console.warn('Fallback play error:', e));
        } else {
          audio.src = fbClean;
          audio.play().catch((e) => console.warn('Fallback play error:', e));
        }
      } else {
        this.isPlaying = false;
        this.notifySubscribers();
      }
    };

    audio.ontimeupdate = () => {
      this.notifySubscribers();
    };

    audio.play().catch((err) => {
      console.warn('Playback error (possibly user interaction needed):', err);
      this.isPlaying = false;
      this.notifySubscribers();
    });

    this.notifySubscribers();
  }

  togglePlayPause() {
    if (!this.currentAudio) return;
    if (this.isPlaying) {
      this.currentAudio.pause();
    } else {
      this.currentAudio.play();
    }
  }

  pause() {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.isPlaying = false;
    this.notifySubscribers();
  }

  mute() {
    this.isMuted = true;
    this.soundEffectsEnabled = false;
    if (this.currentAudio) {
      this.currentAudio.muted = true;
      this.currentAudio.pause();
    }
    this.isPlaying = false;
    this.notifySubscribers();
  }

  unmute() {
    this.isMuted = false;
    this.soundEffectsEnabled = true;
    if (this.currentAudio) {
      this.currentAudio.muted = false;
      this.currentAudio.volume = this.volume;
      this.currentAudio.play().catch((e) => console.warn('Unmute play error:', e));
      this.isPlaying = true;
    }
    this.notifySubscribers();
  }

  toggleMute() {
    if (this.isMuted || !this.isPlaying) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  seek(percentage) {
    if (!this.currentAudio || !this.currentAudio.duration) return;
    this.currentAudio.currentTime = this.currentAudio.duration * (percentage / 100);
    this.notifySubscribers();
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
    this.notifySubscribers();
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    this.isPlaying = false;
    this.currentHotspotId = null;
    this.currentHotspot = null;
    this.notifySubscribers();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    const state = {
      isPlaying: this.isPlaying,
      isMuted: this.isMuted,
      currentHotspotId: this.currentHotspotId,
      currentHotspot: this.currentHotspot,
      currentTime: this.currentAudio ? this.currentAudio.currentTime : 0,
      duration: this.currentAudio && !isNaN(this.currentAudio.duration) ? this.currentAudio.duration : 0,
      volume: this.volume,
    };
    this.subscribers.forEach((cb) => cb(state));
  }
}

export const audioEngine = new AudioEngine();
