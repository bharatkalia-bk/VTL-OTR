import { Spinner } from '@vtl/ui';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './lib/auth';
import { Landing } from './routes/Landing';

const Register = lazy(() => import('./routes/auth/Register'));
const Login = lazy(() => import('./routes/auth/Login'));
const ForgotOtr = lazy(() => import('./routes/auth/ForgotOtr'));
const ForgotPassword = lazy(() => import('./routes/auth/ForgotPassword'));
const Dashboard = lazy(() => import('./routes/Dashboard'));
const Wizard = lazy(() => import('./routes/profile/Wizard'));
const Submitted = lazy(() => import('./routes/profile/Submitted'));
const Exams = lazy(() => import('./routes/exams/Exams'));
const Apply = lazy(() => import('./routes/exams/Apply'));
const Applications = lazy(() => import('./routes/applications/Applications'));
const ApplicationDetail = lazy(() => import('./routes/applications/ApplicationDetail'));
const PaymentReturn = lazy(() => import('./routes/applications/PaymentReturn'));
const Corrections = lazy(() => import('./routes/Corrections'));
const Helpdesk = lazy(() => import('./routes/Helpdesk'));
const Verify = lazy(() => import('./routes/Verify'));
const Styleguide = lazy(() => import('./routes/Styleguide'));
const Legal = lazy(() => import('./routes/Legal'));
const NotFound = lazy(() => import('./routes/NotFound'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function App() {
  const { t } = useTranslation();
  const authed = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;
  return (
    <Layout>
      <ScrollTop />
      <Suspense fallback={<div className="flex justify-center py-16"><Spinner label={t('app.loading')} /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-otr" element={<ForgotOtr />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={authed(<Dashboard />)} />
          <Route path="/profile" element={authed(<Wizard />)} />
          <Route path="/profile/:step" element={authed(<Wizard />)} />
          <Route path="/profile-submitted" element={authed(<Submitted />)} />
          <Route path="/exams" element={authed(<Exams />)} />
          <Route path="/exams/:id/apply" element={authed(<Apply />)} />
          <Route path="/applications" element={authed(<Applications />)} />
          <Route path="/applications/:id" element={authed(<ApplicationDetail />)} />
          <Route path="/applications/:id/payment" element={authed(<PaymentReturn />)} />
          <Route path="/corrections" element={authed(<Corrections />)} />
          <Route path="/helpdesk" element={<Helpdesk />} />
          <Route path="/verify/:token" element={<Verify />} />
          <Route path="/styleguide" element={<Styleguide />} />
          <Route path="/legal/:page" element={<Legal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
