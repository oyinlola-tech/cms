const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

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

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const extension = path.extname(String(file.originalname || '')).toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
        cb(new Error('Invalid file type'));
        return;
      }
      cb(null, true);
    }
  });

  return {
    upload,
    uploadsDir: config.paths.uploadsDir,
    removeUploadByUrl(url) {
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
  };
}

module.exports = { createUploadService };
