/**
 * DADDY TOSS BOOK - Secure Team Logo Upload & Validation Middleware
 * Enforces:
 * - PNG, JPG, JPEG, WEBP validation
 * - 2 MB size limits per image
 * - Magic bytes verification (detects spoofed extensions)
 * - Safe randomized filenames (prevents path traversal)
 * - Automatic cleanup of orphaned files on failure
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/team-logos');

// Ensure destination exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const extMatch = (file.originalname || '').match(/\.(png|jpe?g|webp)$/i);
    let ext = extMatch ? extMatch[0].toLowerCase() : '';
    if (ext === '.jpeg') ext = '.jpg';
    if (!ext) {
      if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/webp') ext = '.webp';
      else ext = '.jpg';
    }
    const safePrefix = file.fieldname.toLowerCase().includes('two') ? 'team2' : 'team1';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `${safePrefix}-${uniqueSuffix}${ext}`);
  }
});

// Initial File Filter
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  const extMatch = (file.originalname || '').match(/\.(png|jpe?g|webp)$/i);

  if (!allowedMimes.includes(file.mimetype) || !extMatch) {
    const err = new Error(`Unsupported file type for ${file.fieldname}. Only PNG, JPG, JPEG, and WEBP images are allowed.`);
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
};

const uploadInstance = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2 MB per file
  },
  fileFilter
});

// Middleware for parsing Team 1 and Team 2 logo uploads
const multerFieldsMiddleware = uploadInstance.fields([
  { name: 'teamOneLogo', maxCount: 1 },
  { name: 'teamTwoLogo', maxCount: 1 },
  { name: 'team_one_logo', maxCount: 1 },
  { name: 'team_two_logo', maxCount: 1 }
]);

/**
 * Validates actual binary content header (magic bytes) to ensure the file is genuinely an image.
 */
async function validateImageMagicBytes(filePath) {
  return new Promise((resolve) => {
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return resolve(false);
      const buffer = Buffer.alloc(16);
      fs.read(fd, buffer, 0, 16, 0, (readErr, bytesRead) => {
        fs.close(fd, () => {});
        if (readErr || bytesRead < 4) return resolve(false);

        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

        // JPEG / JPG signature: FF D8 FF
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

        // WEBP signature: 'RIFF' at offset 0, 'WEBP' at offset 8
        const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';

        resolve(isPng || isJpeg || isWebp);
      });
    });
  });
}

/**
 * Delete a local uploaded file if it exists
 */
async function deleteUploadedFile(filePathOrRel) {
  if (!filePathOrRel) return;
  try {
    const filename = path.basename(filePathOrRel);
    // Path traversal safety check: allow only alphanumeric, dashes, dots, underscores
    if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) return;
    const absPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(absPath)) {
      await fs.promises.unlink(absPath);
    }
  } catch (err) {
    console.warn('[UPLOAD CLEANUP] Unable to unlink file:', err.message);
  }
}

/**
 * Express middleware wrapper that executes multer and performs secondary magic-byte validation
 */
function uploadTeamLogos(req, res, next) {
  multerFieldsMiddleware(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'Logo file size exceeds the 2 MB limit. Please upload a smaller image.'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message
          }
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: err.code || 'INVALID_FILE',
          message: err.message || 'File upload validation failed.'
        }
      });
    }

    // Inspect any uploaded files for magic byte signatures
    const uploadedFiles = [];
    if (req.files) {
      Object.keys(req.files).forEach((field) => {
        const fileList = req.files[field];
        if (Array.isArray(fileList)) {
          uploadedFiles.push(...fileList);
        }
      });
    }

    for (const file of uploadedFiles) {
      const isValid = await validateImageMagicBytes(file.path);
      if (!isValid) {
        // Cleanup all files uploaded in this request
        for (const f of uploadedFiles) {
          try {
            if (fs.existsSync(f.path)) await fs.promises.unlink(f.path);
          } catch (e) {}
        }
        return res.status(400).json({
          success: false,
          error: {
            code: 'CORRUPTED_OR_INVALID_IMAGE',
            message: `Uploaded file for "${file.fieldname}" is not a valid PNG, JPG, or WEBP image.`
          }
        });
      }
    }

    next();
  });
}

module.exports = {
  uploadTeamLogos,
  deleteUploadedFile,
  validateImageMagicBytes,
  UPLOADS_DIR
};
