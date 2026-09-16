import multer from 'multer';
import { productImageStorage } from '../config/cloudinary';
import { MAX_PRODUCT_IMAGES } from '../constants';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest('Only JPEG, PNG and WebP images are allowed'));
  }
};

/** `images` multipart field, up to MAX_PRODUCT_IMAGES files, streamed to Cloudinary. */
export const uploadProductImages = multer({
  storage: productImageStorage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_PRODUCT_IMAGES },
  fileFilter,
}).array('images', MAX_PRODUCT_IMAGES);
