import { Router } from 'express';
import { getProductBySlug, listProducts } from '../controllers/product.controller';
import { publicReadLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { slugParamSchema } from '../validators/common';

const router = Router();

router.get('/', publicReadLimiter, listProducts);
router.get('/:slug', publicReadLimiter, validate({ params: slugParamSchema }), getProductBySlug);

export default router;
