import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StorefrontLayout } from './components/layout/StorefrontLayout';
import { SellerLayout } from './components/layout/SellerLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { RequireAuth, RequireSeller, RequireAdmin, GuestOnly } from './components/layout/Guards';
import { Skeleton } from './components/ui/Skeleton';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import NotFoundPage, { ForbiddenPage } from './pages/NotFoundPage';

// Lazy-load everything past the browse path so the first visit stays light.
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderSuccessPage = lazy(() => import('./pages/OrderSuccessPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const SellerSetupPage = lazy(() => import('./pages/SellerSetupPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const DashboardPage = lazy(() => import('./pages/seller/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/seller/ProductsPage'));
const ProductFormPage = lazy(() => import('./pages/seller/ProductFormPage'));
const SellerOrdersPage = lazy(() => import('./pages/seller/OrdersPage'));
const SellerOrderDetailPage = lazy(() => import('./pages/seller/OrderDetailPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const TrackOrderPage = lazy(() => import('./pages/TrackOrderPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const AdminOrdersPage = lazy(() => import('./pages/admin/OrdersPage'));
const AdminOrderDetailPage = lazy(() => import('./pages/admin/OrderDetailPage'));
const AdminProductsPage = lazy(() => import('./pages/admin/ProductsPage'));
const TermsPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const RefundPage = lazy(() => import('./pages/legal/LegalPages').then((m) => ({ default: m.RefundPage })));

function PageFallback() {
  return <div className="stack" aria-busy="true" aria-label="Loading page"><Skeleton w="35%" h={28} /><Skeleton h={220} r={10} /></div>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <ScrollToTop />
          <a href="#main" className="sr-only">Skip to content</a>
          <Suspense fallback={<div className="container" style={{ padding: 'var(--s-8) 0' }}><PageFallback /></div>}>
            <Routes>
              <Route element={<StorefrontLayout />}>
                <Route index element={<HomePage />} />
                <Route path="products" element={<CatalogPage />} />
                <Route path="products/:slug" element={<ProductPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route path="checkout" element={<CheckoutPage />} />
                <Route path="checkout/success/:orderId" element={<OrderSuccessPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="track-order" element={<TrackOrderPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="refunds" element={<RefundPage />} />
                <Route path="reset-password" element={<ResetPasswordPage />} />
                <Route path="verify-email" element={<VerifyEmailPage />} />
                <Route element={<GuestOnly />}>
                  <Route path="login" element={<LoginPage />} />
                  <Route path="register" element={<RegisterPage />} />
                  <Route path="forgot-password" element={<ForgotPasswordPage />} />
                </Route>
                <Route element={<RequireAuth />}>
                  <Route path="seller/setup" element={<SellerSetupPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                </Route>
                <Route path="403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              <Route path="seller" element={<RequireSeller />}>
                <Route element={<SellerLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="products/new" element={<ProductFormPage />} />
                  <Route path="products/:id/edit" element={<ProductFormPage />} />
                  <Route path="orders" element={<SellerOrdersPage />} />
                  <Route path="orders/:id" element={<SellerOrderDetailPage />} />
                </Route>
              </Route>

              <Route path="admin" element={<RequireAdmin />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="users/:id" element={<AdminUserDetailPage />} />
                  <Route path="orders" element={<AdminOrdersPage />} />
                  <Route path="orders/:id" element={<AdminOrderDetailPage />} />
                  <Route path="products" element={<AdminProductsPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
