import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Comprehensive audio extension matcher (covers all common and niche audio formats)
const AUDIO_EXT_REGEX = /\.(mp3|wav|wave|ogg|oga|m4a|m4b|m4p|m4r|aac|flac|weba|webm|wma|aif|aiff|aifc|opus|mid|midi|mp4|mpeg|mpg|caf|3gp|3g2|amr|au|snd|mp2|ac3|alac|ape|wv)$/i;

// Comprehensive MIME types for audio streaming
const AUDIO_MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.mpg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.m4p': 'audio/mp4',
  '.m4r': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.weba': 'audio/webm',
  '.webm': 'audio/webm',
  '.wma': 'audio/x-ms-wma',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.aifc': 'audio/aiff',
  '.opus': 'audio/opus',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.mp4': 'audio/mp4',
  '.caf': 'audio/x-caf',
  '.3gp': 'audio/3gpp',
  '.3g2': 'audio/3gpp2',
  '.amr': 'audio/amr',
  '.au': 'audio/basic',
  '.snd': 'audio/basic',
  '.mp2': 'audio/mpeg',
  '.ac3': 'audio/ac3',
  '.alac': 'audio/alac',
};

function detectAudioMimeType(filePath, ext) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (buf.slice(0, 4).toString('ascii') === 'RIFF') {
      return 'audio/wav';
    }
    if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
      return 'audio/mp4';
    }
    if (buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0) {
      return 'audio/aac';
    }
    if (buf.slice(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
      return 'audio/mpeg';
    }
  } catch (_) {}
  return AUDIO_MIME_TYPES[ext.toLowerCase()] || 'audio/mpeg';
}

// Stream audio file with HTTP Range support for reliable playback & seeking
function streamAudioWithRange(req, res, filePath, ext) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = detectAudioMimeType(filePath, ext);

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/hotspots.json',
        '**/audio-docs.json',
        '**/public/**',
        '**/dist/**',
        '**/audio-docs/**',
      ],
    },
  },
  plugins: [
    {
      name: 'audio-docs-backend',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const publicAudioDir = path.resolve(process.cwd(), 'public', 'audio-docs');
          const distAudioDir = path.resolve(process.cwd(), 'dist', 'audio-docs');
          const rootAudioDir = path.resolve(process.cwd(), 'audio-docs');

          // Ensure directories exist
          if (!fs.existsSync(publicAudioDir)) {
            fs.mkdirSync(publicAudioDir, { recursive: true });
          }

          // Function to discover and sync audio files across all candidate folders
          function syncAndGetAudioFiles() {
            const candidateDirs = [distAudioDir, rootAudioDir].filter(d => fs.existsSync(d));

            // Sync from dist/audio-docs or root audio-docs into public/audio-docs
            for (const sourceDir of candidateDirs) {
              try {
                const sourceFiles = fs.readdirSync(sourceDir);
                for (const file of sourceFiles) {
                  if (AUDIO_EXT_REGEX.test(file)) {
                    const srcPath = path.join(sourceDir, file);
                    const destPath = path.join(publicAudioDir, file);
                    try {
                      if (!fs.existsSync(destPath) || fs.statSync(srcPath).size !== fs.statSync(destPath).size) {
                        fs.copyFileSync(srcPath, destPath);
                      }
                    } catch (_) {}
                  }
                }
              } catch (_) {}
            }

            // Sync from public/audio-docs to candidate dirs so all stays in sync
            try {
              const pubFiles = fs.readdirSync(publicAudioDir);
              for (const file of pubFiles) {
                if (AUDIO_EXT_REGEX.test(file)) {
                  const pubPath = path.join(publicAudioDir, file);
                  for (const targetDir of candidateDirs) {
                    const targetPath = path.join(targetDir, file);
                    try {
                      if (!fs.existsSync(targetPath) || fs.statSync(pubPath).size !== fs.statSync(targetPath).size) {
                        fs.copyFileSync(pubPath, targetPath);
                      }
                    } catch (_) {}
                  }
                }
              }
            } catch (_) {}

            // Read all audio files from publicAudioDir
            try {
              const allFiles = fs.readdirSync(publicAudioDir).filter((f) => AUDIO_EXT_REGEX.test(f));
              const sorted = allFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
              try {
                fs.writeFileSync(path.resolve(process.cwd(), 'public', 'audio-docs.json'), JSON.stringify(sorted, null, 2));
              } catch (_) {}
              return sorted;
            } catch (e) {
              return [];
            }
          }

          const parsedUrl = req.url ? req.url.split('?')[0] : '';

          // 1. List audio files in audio-docs (supports all audio formats & all folders)
          if (parsedUrl === '/api/audio-docs' && req.method === 'GET') {
            try {
              const files = syncAndGetAudioFiles();
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              return res.end(JSON.stringify(files));
            } catch (e) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: e.message }));
            }
          }

          // 2. Upload audio file into audio-docs (accepts all audio formats)
          if (parsedUrl === '/api/upload-audio' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString());
                const { filename, base64Data } = body;
                // Preserve clean name with spaces and standard characters
                const safeName = filename.replace(/[<>:"/\\|?*]/g, '_').trim();
                const filePath = path.join(publicAudioDir, safeName);
                const buffer = Buffer.from(base64Data.split(',')[1] || base64Data, 'base64');
                fs.writeFileSync(filePath, buffer);

                // Sync to dist/audio-docs and root audio-docs if they exist
                if (fs.existsSync(distAudioDir)) {
                  try { fs.writeFileSync(path.join(distAudioDir, safeName), buffer); } catch (_) {}
                }
                if (fs.existsSync(rootAudioDir)) {
                  try { fs.writeFileSync(path.join(rootAudioDir, safeName), buffer); } catch (_) {}
                }

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, filename: safeName, url: `/audio-docs/${encodeURIComponent(safeName)}` }));
              } catch (e) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // 3. Delete audio file
          if (parsedUrl === '/api/delete-audio' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
              try {
                const { filename } = JSON.parse(Buffer.concat(chunks).toString());
                const safeName = path.basename(filename);
                [publicAudioDir, distAudioDir, rootAudioDir].forEach((dir) => {
                  const target = path.join(dir, safeName);
                  if (fs.existsSync(target)) {
                    try { fs.unlinkSync(target); } catch (_) {}
                  }
                });
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true }));
              } catch (e) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // 4. Load hotspots from disk
          const hotspotsFile = path.resolve(process.cwd(), 'hotspots.json');
          if (parsedUrl === '/api/hotspots' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            if (fs.existsSync(hotspotsFile)) {
              return res.end(fs.readFileSync(hotspotsFile, 'utf8'));
            }
            return res.end(JSON.stringify([]));
          }

          // 5. Save hotspots to disk
          if (parsedUrl === '/api/save-hotspots' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
              try {
                const buf = Buffer.concat(chunks);
                const str = buf.toString('utf8');
                if (!fs.existsSync(hotspotsFile) || fs.readFileSync(hotspotsFile, 'utf8') !== str) {
                  fs.writeFileSync(hotspotsFile, buf);
                }
                const pubHotspots = path.resolve(process.cwd(), 'public', 'hotspots.json');
                if (!fs.existsSync(pubHotspots) || fs.readFileSync(pubHotspots, 'utf8') !== str) {
                  fs.writeFileSync(pubHotspots, buf);
                }
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true }));
              } catch (e) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }

          // 6. Direct streaming handler for /audio-docs/* with HTTP Range and MIME support
          if (parsedUrl.startsWith('/audio-docs/')) {
            try {
              const decoded = decodeURIComponent(parsedUrl.replace('/audio-docs/', ''));
              let targetPath = path.join(publicAudioDir, decoded);
              if (!fs.existsSync(targetPath)) {
                if (fs.existsSync(path.join(distAudioDir, decoded))) {
                  targetPath = path.join(distAudioDir, decoded);
                } else if (fs.existsSync(path.join(rootAudioDir, decoded))) {
                  targetPath = path.join(rootAudioDir, decoded);
                }
              }

              if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
                const ext = path.extname(targetPath).toLowerCase();
                streamAudioWithRange(req, res, targetPath, ext);
                return;
              }
            } catch (err) {
              console.error('Audio streaming error:', err);
            }
          }

          next();
        });
      },
    },
  ],
});
