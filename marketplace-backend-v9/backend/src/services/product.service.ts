import { Product, type ProductDocument } from '../models/Product';
import { deleteCloudinaryAssets } from './cloudinary.service';

/**
 * A Cloudinary asset must only be deleted once nothing else references it — duplicated listings
 * share their source images by publicId rather than re-uploading them.
 */
export const filterUnreferencedPublicIds = async (publicIds: string[], excludeProductId: string): Promise<string[]> => {
  const ids = publicIds.filter(Boolean);
  if (ids.length === 0) return [];

  const stillReferencing = await Product.find(
    { _id: { $ne: excludeProductId }, 'images.publicId': { $in: ids } },
    { 'images.publicId': 1 },
  ).lean();
  const stillUsed = new Set(stillReferencing.flatMap((p) => p.images.map((i) => i.publicId)));
  return ids.filter((id) => !stillUsed.has(id));
};

/**
 * Permanent delete used by both the seller (own listing) and admin (any listing) endpoints:
 * removes the document, then releases Cloudinary storage that no other listing still points at.
 * Order history keeps the denormalized title/price, so past orders are unaffected.
 */
export const removeProductWithAssets = async (product: ProductDocument): Promise<void> => {
  const publicIds = product.images.map((i) => i.publicId);
  const unreferenced = await filterUnreferencedPublicIds(publicIds, product.id);
  await product.deleteOne();
  await deleteCloudinaryAssets(unreferenced);
};
