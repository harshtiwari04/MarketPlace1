import { Router } from 'express';
import {
  bulkUpdateStock,
  createProduct,
  deleteProduct,
  duplicateProduct,
  exportProductsCsv,
  getProductsSummary,
  getSellerOrder,
  getSellerProductDetail,
  listSellerOrders,
  listSellerProducts,
  updateItemDelivery,
  updateItemStatus,
  updateProduct,
  updateProductStatus,
  updateProductStock,
} from '../controllers/seller.controller';
import { requireSeller, verifyJWT } from '../middlewares/auth';
import { authedReadLimiter, sellerWriteLimiter } from '../middlewares/rateLimit';
import { uploadProductImages } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { idParamSchema } from '../validators/common';
import {
  bulkStockUpdateSchema,
  createProductSchema,
  productStatusSchema,
  stockUpdateSchema,
  updateProductSchema,
} from '../validators/product.validators';
import { deliveryUpdateSchema, orderIdParamSchema, orderItemParamSchema, updateOrderStatusSchema } from '../validators/seller.validators';

const router = Router();

// Every seller route requires an authenticated seller.
router.use(verifyJWT, requireSeller);

// Reads get a generous per-minute budget; every mutation shares the tighter write budget.
router.get('*', authedReadLimiter);
router.post('*', sellerWriteLimiter);
router.put('*', sellerWriteLimiter);
router.patch('*', sellerWriteLimiter);
router.delete('*', sellerWriteLimiter);

// Products — multer must run before validate so multipart fields land in req.body.
// NOTE: literal sub-paths (summary, export, bulk-stock) must be registered before the
// `/products/:id` routes below, or Express would try to match them as an :id first.
router.get('/products', listSellerProducts);
router.get('/products/summary', getProductsSummary);
router.get('/products/export', exportProductsCsv);
router.patch('/products/bulk-stock', validate({ body: bulkStockUpdateSchema }), bulkUpdateStock);

router.get('/products/:id', validate({ params: idParamSchema }), getSellerProductDetail);
router.post('/products', uploadProductImages, validate({ body: createProductSchema }), createProduct);
router.put(
  '/products/:id',
  validate({ params: idParamSchema }),
  uploadProductImages,
  validate({ body: updateProductSchema }),
  updateProduct,
);
router.patch(
  '/products/:id/status',
  validate({ params: idParamSchema, body: productStatusSchema }),
  updateProductStatus,
);
router.patch(
  '/products/:id/stock',
  validate({ params: idParamSchema, body: stockUpdateSchema }),
  updateProductStock,
);
router.post('/products/:id/duplicate', validate({ params: idParamSchema }), duplicateProduct);
router.delete('/products/:id', validate({ params: idParamSchema }), deleteProduct);

// Orders — a seller only ever sees/touches their own line items within an order, never the whole order.
router.get('/orders', listSellerOrders);
router.get('/orders/:id', validate({ params: orderIdParamSchema }), getSellerOrder);
router.patch(
  '/orders/:id/items/:productId/status',
  validate({ params: orderItemParamSchema, body: updateOrderStatusSchema }),
  updateItemStatus,
);
router.patch(
  '/orders/:id/items/:productId/delivery',
  validate({ params: orderItemParamSchema, body: deliveryUpdateSchema }),
  updateItemDelivery,
);

export default router;
