import { Spinner } from '@vtl/ui';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useAuth } from './lib/auth';
import Login from './routes/Login';

const Dashboard = lazy(() => import('./routes/Dashboard'));
const Candidates = lazy(() => import('./routes/Candidates'));
const CandidateDetail = lazy(() => import('./routes/CandidateDetail'));
const Verification = lazy(() => import('./routes/Verification'));
const Duplicates = lazy(() => import('./routes/Duplicates'));
const Corrections = lazy(() => import('./routes/Corrections'));
const Exams = lazy(() => import('./routes/Exams'));
const ExamDetail = lazy(() => import('./routes/ExamDetail'));
const Payments = lazy(() => import('./routes/Payments'));
const Comms = lazy(() => import('./routes/Comms'));
const Reports = lazy(() => import('./routes/Reports'));
const Audit = lazy(() => import('./routes/Audit'));
const Tickets = lazy(() => import('./routes/Tickets'));
const Users = lazy(() => import('./routes/Users'));
const Settings = lazy(() => import('./routes/Settings'));

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner label="Loading…" /></div>;
  if (!user || !user.totpVerified) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/corrections" element={<Corrections />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:id" element={<ExamDetail />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/comms" element={<Comms />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
