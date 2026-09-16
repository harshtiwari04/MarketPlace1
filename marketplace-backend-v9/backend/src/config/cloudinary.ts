import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { env } from './env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

const sanitizeBaseName = (originalName: string): string =>
  originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 60);

/**
 * Multer storage engine that streams uploads straight to Cloudinary.
 * `file.path` → secure URL, `file.filename` → public_id (used for later deletion).
 */
export const productImageStorage = new CloudinaryStorage({
  // multer-storage-cloudinary declares a peer type against cloudinary v1; v2 is API-compatible.
  cloudinary: cloudinary as unknown as ConstructorParameters<typeof CloudinaryStorage>[0]['cloudinary'],
  params: async (_req, file) => ({
    folder: env.CLOUDINARY_FOLDER,
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    public_id: `${Date.now()}-${sanitizeBaseName(file.originalname)}`,
    transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  }),
});

export { cloudinary };
