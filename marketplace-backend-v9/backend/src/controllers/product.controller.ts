import type { PipelineStage } from 'mongoose';
import { LOW_STOCK_THRESHOLD, MESSAGES } from '../constants';
import { Product } from '../models/Product';
import { ApiError } from '../utils/ApiError';
import { sendResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { escapeRegex } from '../utils/slugify';
import { productQuerySchema, type ProductQuery } from '../validators/product.validators';

const SORT_MAP: Record<ProductQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { effectivePrice: 1, _id: 1 },
  price_desc: { effectivePrice: -1, _id: -1 },
  title_asc: { title: 1, _id: 1 },
};

const PUBLIC_PROJECTION = {
  title: 1,
  slug: 1,
  description: 1,
  price: 1,
  discountPrice: 1,
  effectivePrice: 1,
  stock: 1,
  inStock: { $gt: ['$stock', 0] },
  unit: 1,
  category: 1,
  images: 1,
  createdAt: 1,
};

/**
 * GET /products — faceted catalog search.
 * Single aggregation with $facet returns page results, total count and category counts together.
 */
export const listProducts = asyncHandler(async (req, res) => {
  const query = productQuerySchema.parse(req.query);
  const { page, limit, category, q, minPrice, maxPrice, inStock, sort } = query;

  const match: Record<string, unknown> = { isActive: true };
  if (category) match.category = category;
  if (inStock) match.stock = { $gt: 0 };
  if (q) match.title = { $regex: escapeRegex(q), $options: 'i' };

  // Price filters apply to the effective (discounted) price.
  const priceMatch: Record<string, unknown> = {};
  if (minPrice != null) priceMatch.$gte = minPrice;
  if (maxPrice != null) priceMatch.$lte = maxPrice;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        effectivePrice: {
          $cond: [
            { $and: [{ $ne: ['$discountPrice', null] }, { $lt: ['$discountPrice', '$price'] }] },
            '$discountPrice',
            '$price',
          ],
        },
      },
    },
    ...(Object.keys(priceMatch).length ? [{ $match: { effectivePrice: priceMatch } } as PipelineStage] : []),
    {
      $facet: {
        items: [
          { $sort: SORT_MAP[sort] },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: PUBLIC_PROJECTION },
        ],
        total: [{ $count: 'count' }],
        categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
        priceRange: [{ $group: { _id: null, min: { $min: '$effectivePrice' }, max: { $max: '$effectivePrice' } } }],
      },
    },
  ];

  const [result] = await Product.aggregate(pipeline).option({ maxTimeMS: 5_000 });

  // Public, anonymous, identical for every visitor → let browsers and any CDN reuse it briefly.
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  const total: number = result?.total?.[0]?.count ?? 0;

  sendResponse(res, {
    items: result?.items ?? [],
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    facets: {
      categories: (result?.categories ?? []).map((c: { _id: string; count: number }) => ({
        category: c._id,
        count: c.count,
      })),
      priceRange: result?.priceRange?.[0]
        ? { min: result.priceRange[0].min, max: result.priceRange[0].max }
        : null,
    },
    appliedFilters: { category, q, minPrice, maxPrice, inStock, sort },
  });
});

/** GET /products/:slug */
export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true });
  if (!product) throw ApiError.notFound(MESSAGES.PRODUCT_NOT_FOUND);

  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  const json = product.toJSON();
  sendResponse(res, {
    product: {
      ...json,
      stockStatus:
        product.stock === 0 ? 'out_of_stock' : product.stock <= LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock',
    },
  });
});
