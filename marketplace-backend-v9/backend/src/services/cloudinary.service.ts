import { cloudinary } from '../config/cloudinary';
import { logger } from '../utils/logger';

const CHUNK = 100; // Admin API limit per delete_resources call

/** Best-effort deletion of Cloudinary assets. Never throws — failures are logged. */
export const deleteCloudinaryAssets = async (publicIds: string[]): Promise<void> => {
  const ids = publicIds.filter(Boolean);
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    try {
      await cloudinary.api.delete_resources(batch, { resource_type: 'image', invalidate: true });
    } catch (err) {
      logger.error('Cloudinary asset deletion failed', { batch, err: String(err) });
    }
  }
};
