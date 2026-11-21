import { Spinner } from '@vtl/ui';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, Shell } from './components/Shell';
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
const ExamDay = lazy(() => import('./routes/ExamDay'));
const AnswerKeys = lazy(() => import('./routes/AnswerKeys'));
const Results = lazy(() => import('./routes/Results'));
const Debarments = lazy(() => import('./routes/Debarments'));
const Selection = lazy(() => import('./routes/Selection'));
const DvDesk = lazy(() => import('./routes/DvDesk'));
const Journey = lazy(() => import('./routes/Journey'));
const CentreDesk = lazy(() => import('./routes/CentreDesk'));
const Observer = lazy(() => import('./routes/Observer'));
const Agency = lazy(() => import('./routes/Agency'));
const Panel = lazy(() => import('./routes/Panel'));

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner label="Loading…" /></div>;
  if (!user || !user.totpVerified) return <Login />;
  const home = homeFor(user.roles);
  return (
    <Shell>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Routes>
          <Route path="/" element={home === '/' ? <Dashboard /> : <Navigate to={home} replace />} />
          <Route path="/journey" element={<Journey />} />
          <Route path="/journey/:term" element={<Journey />} />
          <Route path="/exam-day" element={<ExamDay />} />
          <Route path="/answer-keys" element={<AnswerKeys />} />
          <Route path="/results" element={<Results />} />
          <Route path="/debarments" element={<Debarments />} />
          <Route path="/selection" element={<Selection />} />
          <Route path="/dv" element={<DvDesk />} />
          <Route path="/centre" element={<CentreDesk />} />
          <Route path="/observer" element={<Observer />} />
          <Route path="/agency" element={<Agency />} />
          <Route path="/panel" element={<Panel />} />
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
