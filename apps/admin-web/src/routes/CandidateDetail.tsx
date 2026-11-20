import { Badge, Button, Card, CardBody, CardHeader, DataTable, Spinner } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { KV, ReasonDialog, StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Detail {
  id: string; otrId: string | null; status: string; mobile: string; email: string; createdAt: string; submittedAt: string | null; blockedReason: string | null; completion: number;
  personal: Record<string, string | null>; category: Record<string, string | number | boolean | null>; domicileStateName: string | null;
  address: { permanent: { line1: string; line2?: string; city: string; stateCode: string; pin: string }; correspondenceSameAsPermanent: boolean } | null;
  education: Array<{ id: string; level: string; qualificationName: string; boardOrUniversity: string; yearOfPassing: number; status: string; resultType: string; marks: number }>;
  documents: Array<{ id: string; kind: string; fileName: string; sizeBytes: number; verificationStatus: string; rejectionReason: string | null; createdAt: string }>;
  photo: { url: string; sha256: string; sizeBytes: number; capturedAt: string; livenessMethod: string; attemptNo: number; scores: Record<string, number>; duplicateFlag: boolean; method: string } | null;
  signature: { url: string; method: string; sizeBytes: number } | null;
  photoAttempts: Array<{ id: string; attemptNo: number; accepted: boolean; createdAt: string; userAgent: string | null; scores: Record<string, number>; liveness: { method: string; passed: boolean } }>;
  applications: Array<{ id: string; applicationNo: string; exam: { code: string; titleEn: string }; status: string; feeAmount: number; submittedAt: string | null }>;
  corrections: Array<{ id: string; field: string; status: string; requestedValue: string; createdAt: string }>;
  duplicateFlags: Array<{ id: string; type: string; status: string }>;
  identity: { aadhaarMasked: string | null; apaarId: string | null; digilockerLinkedAt: string | null };
  consents: Array<{ id: string; purposeCode: string; noticeVersion: string; grantedAt: string }>;
}

export default function CandidateDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['candidate', id], queryFn: () => api.get<Detail>(`/admin/candidates/${id}`) });
  const { run, banner, busy } = useAction();
  const [rejectDoc, setRejectDoc] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  if (!q.data) return <Spinner label="Loading…" />;
  const c = q.data;
  const openDoc = async (docId: string) => { const r = await api.get<{ url: string }>(`/admin/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); };
  return (
    <>
      <PageTitle title={c.personal.fullName ?? 'Candidate'} description={`${c.otrId ?? 'OTR not submitted'} · registered ${fmt.dt(c.createdAt)}`}
        actions={<><StatusBadge s={c.status} />{can('VERIFIER') && (c.status === 'BLOCKED'
          ? <Button size="sm" loading={busy} onClick={() => void run(() => api.post(`/admin/candidates/${c.id}/unblock`).then(() => q.refetch()), 'Candidate unblocked.')}>Unblock</Button>
          : <Button size="sm" variant="danger" onClick={() => setBlockOpen(true)}>Block</Button>)}</>} />
      {banner}
      {c.blockedReason && <p className="mb-4 rounded bg-danger-50 p-3 text-sm text-danger">Blocked: {c.blockedReason}</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card><CardHeader title="Personal & contact" /><CardBody><dl>
            <KV k="Full name" v={c.personal.fullName} /><KV k="Father's name" v={c.personal.fatherName} /><KV k="Mother's name" v={c.personal.motherName} />
            <KV k="Date of birth" v={c.personal.dob} /><KV k="Gender" v={c.personal.gender} /><KV k="Mobile" v={c.mobile} /><KV k="Email" v={c.email} />
            <KV k="Category" v={`${c.category.category ?? '—'}${c.category.pwd ? ` · PwD ${c.category.pwdType} ${c.category.pwdPercent}%` : ''}${c.category.exServiceman ? ' · Ex-serviceman' : ''}`} />
            <KV k="Domicile" v={c.domicileStateName} />
            <KV k="Address" v={c.address && `${c.address.permanent.line1}, ${c.address.permanent.city}, ${c.address.permanent.stateCode} ${c.address.permanent.pin}`} />
            <KV k="Aadhaar e-KYC" v={c.identity.aadhaarMasked ?? 'Not done'} /><KV k="APAAR" v={c.identity.apaarId} />
            <KV k="Consents" v={c.consents.map((x) => `${x.purposeCode} v${x.noticeVersion} (${fmt.d(x.grantedAt)})`).join(', ')} />
          </dl></CardBody></Card>
          <Card><CardHeader title="Documents" /><CardBody className="p-0 sm:p-0">
            <DataTable caption="Documents" rows={c.documents} rowKey={(r) => r.id} empty="No documents"
              columns={[
                { key: 'k', header: 'Type', cell: (r) => r.kind },
                { key: 'f', header: 'File', cell: (r) => <button type="button" className="inline-flex items-center gap-1 text-info underline" onClick={() => void openDoc(r.id)}>{r.fileName}<ExternalLink className="h-3 w-3" aria-hidden /></button> },
                { key: 's', header: 'Status', cell: (r) => <><StatusBadge s={r.verificationStatus} />{r.rejectionReason && <p className="text-xs text-danger">{r.rejectionReason}</p>}</> },
                { key: 'a', header: '', cell: (r) => can('VERIFIER') && r.verificationStatus !== 'APPROVED' ? <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => void run(() => api.post(`/admin/documents/${r.id}/approve`).then(() => q.refetch()), 'Document approved.')}>Approve</Button><Button size="sm" onClick={() => setRejectDoc(r.id)}>Reject</Button></span> : null },
              ]} />
          </CardBody></Card>
          <Card><CardHeader title="Education" /><CardBody className="p-0 sm:p-0">
            <DataTable caption="Education" rows={c.education} rowKey={(r) => r.id} columns={[
              { key: 'l', header: 'Level', cell: (r) => r.level }, { key: 'q', header: 'Qualification', cell: (r) => r.qualificationName }, { key: 'b', header: 'Board / University', cell: (r) => r.boardOrUniversity },
              { key: 'y', header: 'Year', cell: (r) => r.yearOfPassing }, { key: 'm', header: 'Result', cell: (r) => (r.status === 'APPEARING' ? 'Appearing' : `${r.marks} ${r.resultType === 'CGPA' ? 'CGPA' : '%'}`) },
            ]} />
          </CardBody></Card>
          <Card><CardHeader title="Applications" /><CardBody className="p-0 sm:p-0">
            <DataTable caption="Applications" rows={c.applications} rowKey={(r) => r.id} empty="No applications" columns={[
              { key: 'n', header: 'Application no.', cell: (r) => <span className="tabular-nums">{r.applicationNo}</span> }, { key: 'e', header: 'Exam', cell: (r) => r.exam.code },
              { key: 'f', header: 'Fee', numeric: true, cell: (r) => fmt.inr(r.feeAmount) }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
            ]} />
          </CardBody></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Live photograph" description="Captured in-browser with face and liveness checks" /><CardBody className="space-y-3">
            {c.photo ? <>
              <div className="flex gap-3"><img src={c.photo.url} alt="Candidate photograph" className="h-[180px] w-[140px] rounded border border-border object-cover" />{c.signature && <img src={c.signature.url} alt="Candidate signature" className="h-[60px] w-[140px] self-end rounded border border-border bg-white" />}</div>
              {c.photo.duplicateFlag && <Badge tone="danger">Same image used by another candidate</Badge>}
              <dl className="text-xs">
                <KV k="Captured" v={fmt.dt(c.photo.capturedAt)} /><KV k="Method" v={`${c.photo.method} · liveness ${c.photo.livenessMethod}`} /><KV k="Attempt" v={c.photo.attemptNo} />
                <KV k="Size" v={`${(c.photo.sizeBytes / 1024).toFixed(1)} KB`} /><KV k="SHA-256" v={<span className="break-all font-mono">{c.photo.sha256.slice(0, 32)}…</span>} />
                {Object.entries(c.photo.scores ?? {}).map(([k, v]) => <KV key={k} k={k} v={Number(v).toFixed(3)} />)}
              </dl>
            </> : <p className="text-sm text-ink-muted">No photograph yet.</p>}
          </CardBody></Card>
          <Card><CardHeader title={`Capture attempts (${c.photoAttempts.length})`} /><CardBody><ul className="space-y-1 text-xs">
            {c.photoAttempts.map((a) => <li key={a.id} className="flex justify-between gap-2"><span>#{a.attemptNo} · {a.liveness.method} · {fmt.dt(a.createdAt)}</span>{a.accepted ? <Badge tone="success">Used</Badge> : <Badge>Retaken</Badge>}</li>)}
          </ul></CardBody></Card>
          <Card><CardHeader title="Corrections & flags" /><CardBody className="space-y-2 text-sm">
            {c.corrections.map((r) => <p key={r.id} className="flex justify-between gap-2"><span>{r.field} → {r.requestedValue}</span><StatusBadge s={r.status} /></p>)}
            {c.duplicateFlags.map((f) => <p key={f.id} className="flex justify-between gap-2"><span>{f.type}</span><StatusBadge s={f.status} /></p>)}
            {!c.corrections.length && !c.duplicateFlags.length && <p className="text-ink-muted">None</p>}
          </CardBody></Card>
        </div>
      </div>
      <ReasonDialog open={!!rejectDoc} title="Reject document" onClose={() => setRejectDoc(null)} confirm="Reject" onSubmit={(reason) => run(() => api.post(`/admin/documents/${rejectDoc}/reject`, { reason }).then(() => q.refetch()), 'Document rejected.')} />
      <ReasonDialog open={blockOpen} title="Block candidate" onClose={() => setBlockOpen(false)} confirm="Block" onSubmit={(reason) => run(() => api.post(`/admin/candidates/${c.id}/block`, { reason }).then(() => q.refetch()), 'Candidate blocked; all sessions revoked.')} />
    </>
  );
}
