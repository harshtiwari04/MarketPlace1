import { Router } from 'express';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import checkoutRoutes from './checkout.routes';
import orderRoutes from './order.routes';
import otpRoutes from './otp.routes';
import productRoutes from './product.routes';
import sellerRoutes from './seller.routes';

const api = Router();

api.use('/auth', authRoutes);
api.use('/otp', otpRoutes);
api.use('/products', productRoutes);
api.use('/seller', sellerRoutes);
api.use('/checkout', checkoutRoutes);
api.use('/orders', orderRoutes); // buyer history/tracking + checkout aliases
api.use('/admin', adminRoutes); // analytics + oversight; verifyJWT + requireAdmin inside

export default api;
