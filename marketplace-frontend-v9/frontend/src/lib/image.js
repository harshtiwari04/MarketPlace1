/**
 * Cloudinary delivery-URL transforms. Product images are stored at full size; the storefront
 * should never ship a 3000px original into a 300px card. Inserting `f_auto,q_auto,w_…` after
 * `/upload/` lets Cloudinary serve WebP/AVIF at the right width — no re-upload, no backend change.
 * Non-Cloudinary URLs are returned untouched.
 */
const UPLOAD_SEGMENT = '/image/upload/';

export function cloudinaryUrl(url, { width, height, crop = 'fill' } = {}) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes(UPLOAD_SEGMENT)) return url;
  const parts = ['f_auto', 'q_auto'];
  if (width) parts.push(`w_${Math.round(width)}`);
  if (height) parts.push(`h_${Math.round(height)}`);
  // Both dimensions → smart crop to that box; one dimension → scale down preserving aspect (never upscale).
  if (width && height) parts.push(`c_${crop}`, 'g_auto');
  else if (width || height) parts.push('c_limit');
  return url.replace(UPLOAD_SEGMENT, `${UPLOAD_SEGMENT}${parts.join(',')}/`);
}

/** srcSet for responsive <img>. Widths chosen for 1x/2x cards and the product gallery. */
export function cloudinarySrcSet(url, widths = [320, 480, 640, 960]) {
  if (!url || !url.includes('res.cloudinary.com')) return undefined;
  return widths.map((w) => `${cloudinaryUrl(url, { width: w })} ${w}w`).join(', ');
}
