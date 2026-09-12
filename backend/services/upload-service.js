const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// The client-supplied mimetype is advisory only. Each accepted format is
// re-checked against its file signature after the bytes land on disk.
const MAGIC_NUMBERS = [
  { ext: '.png', mime: 'image/png', check: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', mime: 'image/webp', check: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' }
];

function sanitizeFilename(originalName) {
  const base = path.basename(String(originalName || 'upload')).normalize('NFKC');
  return base
    .replace(/[^\w.\-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'upload';
}

function ensureWithinDirectory(rootDir, candidate) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

/**
 * Reads the first bytes of a file and confirms they match a supported image
 * signature. Returns the detected format, or null when nothing matches.
 */
async function detectImageFormat(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, 12, 0);
    const head = buffer.subarray(0, bytesRead);
    return MAGIC_NUMBERS.find((entry) => entry.check(head)) || null;
  } catch (_) {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function createUploadService(config) {
  fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.paths.uploadsDir),
    filename: (req, file, cb) => {
      const safeOriginal = sanitizeFilename(file.originalname);
      const id = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${id}-${safeOriginal}`);
    }
  });

  const multerInstance = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
    fileFilter: (req, file, cb) => {
      const extension = path.extname(String(file.originalname || '')).toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
        cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP.'));
        return;
      }
      cb(null, true);
    }
  });

  function removeUploadByUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) {
      return;
    }

    const filename = path.basename(url);
    const filePath = path.join(config.paths.uploadsDir, filename);
    if (!ensureWithinDirectory(config.paths.uploadsDir, filePath)) {
      return;
    }

    fs.unlink(filePath, () => {});
  }

  /**
   * Wraps multer's single-file handler with a content check, so a file that
   * merely claims to be an image (correct extension, correct Content-Type,
   * arbitrary payload) is rejected and deleted rather than stored and served.
   */
  function single(fieldName) {
    const handler = multerInstance.single(fieldName);

    return function verifiedSingleUpload(req, res, next) {
      handler(req, res, async (error) => {
        if (error) {
          next(error);
          return;
        }
        if (!req.file) {
          next();
          return;
        }

        const format = await detectImageFormat(req.file.path);
        const extension = path.extname(req.file.filename).toLowerCase();
        const extensionMatches = format
          && (format.ext === extension || (format.ext === '.jpg' && extension === '.jpeg'));

        if (!format || !extensionMatches) {
          fs.unlink(req.file.path, () => {});
          const rejection = new Error('File contents do not match a supported image format.');
          rejection.statusCode = 400;
          next(rejection);
          return;
        }

        next();
      });
    };
  }

  return {
    upload: { single },
    uploadsDir: config.paths.uploadsDir,
    detectImageFormat,
    removeUploadByUrl
  };
}

module.exports = { createUploadService };
