import { Router } from 'express';
import { allowedOrigins } from '../config/env';
import { Product } from '../models/Product';
import { publicReadLimiter } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * GET /sitemap.xml
 * Built from the live catalogue so new listings are indexable without a redeploy. The storefront
 * origin is the first CLIENT_URL entry; in production the static host should proxy or redirect
 * `/sitemap.xml` here (see render.yaml) so crawlers find it on the storefront domain.
 */
router.get(
  '/sitemap.xml',
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const origin = (allowedOrigins[0] ?? '').replace(/\/$/, '');
    const products = await Product.find({ isActive: true }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(5000).lean();

    const urls: { loc: string; priority: string; changefreq: string; lastmod?: string }[] = [
      { loc: `${origin}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${origin}/products`, priority: '0.9', changefreq: 'daily' },
      { loc: `${origin}/track-order`, priority: '0.3', changefreq: 'monthly' },
      { loc: `${origin}/terms`, priority: '0.2', changefreq: 'yearly' },
      { loc: `${origin}/privacy`, priority: '0.2', changefreq: 'yearly' },
      { loc: `${origin}/refunds`, priority: '0.2', changefreq: 'yearly' },
      ...products.map((p) => ({
        loc: `${origin}/products/${p.slug}`,
        priority: '0.7',
        changefreq: 'weekly',
        lastmod: (p as { updatedAt?: Date }).updatedAt?.toISOString().slice(0, 10),
      })),
    ];

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${escapeXml(u.loc)}</loc>` +
            (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
            `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
        )
        .join('\n') +
      `\n</urlset>\n`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(body);
  }),
);

export default router;
