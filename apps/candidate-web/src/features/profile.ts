import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressInput, WizardStep } from '@vtl/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export interface DocInfo { id: string; kind: string; fileName: string; sizeBytes: number; mime: string; verificationStatus: string; rejectionReason: string | null }
export interface Profile {
  id: string; otrId: string | null; status: 'DRAFT' | 'SUBMITTED' | 'BLOCKED'; mobile: string; email: string; submittedAt: string | null;
  personal: { fullName: string | null; fatherName: string | null; motherName: string | null; dob: string | null; gender: string | null; nationality: string | null; maritalStatus: string | null; identificationMark1: string | null; identificationMark2: string | null };
  category: { category: string | null; pwd: boolean; pwdType: string | null; pwdPercent: number | null; exServiceman: boolean; serviceYears: number | null; domicileStateCode: string | null; categoryCertDocId: string | null; pwdCertDocId: string | null; exsmCertDocId: string | null };
  address: AddressInput | null;
  education: Array<{ id: string; level: string; qualificationName: string; boardOrUniversity: string; yearOfPassing: number; status: string; resultType: string; marks: number; maxMarks: number | null; cgpaScale: number | null; rollNo: string | null; documentId: string | null }>;
  documents: DocInfo[];
  photo: { id: string; width: number; height: number; sizeBytes: number; capturedAt: string; url: string } | null;
  signature: { id: string; width: number; height: number; sizeBytes: number; method: string; url: string } | null;
  identity: { aadhaarMasked: string | null; aadhaarVerifiedAt: string | null; apaarId: string | null; digilockerLinkedAt: string | null };
  declaration: { at: string | null; place: string | null };
  completedSteps: WizardStep[];
  completion: number;
}

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/me/profile') });
}

export function useSetProfile() {
  const qc = useQueryClient();
  return useCallback((p: Profile) => qc.setQueryData(['profile'], p), [qc]);
}

export interface StateRow { code: string; nameEn: string; nameHi: string }
export interface DistrictRow { id: number; name: string; stateCode: string }
export function useStates() {
  return useQuery({ queryKey: ['states'], queryFn: () => api.get<StateRow[]>('/public/masters/states'), staleTime: Infinity });
}
export function useDistricts(state: string | undefined | null) {
  return useQuery({ queryKey: ['districts', state], queryFn: () => api.get<DistrictRow[]>(`/public/masters/districts?state=${state}`), enabled: !!state, staleTime: Infinity });
}
export function useMaster<T>(type: 'boards' | 'universities' | 'qualifications') {
  return useQuery({ queryKey: ['master', type], queryFn: () => api.get<T[]>(`/public/masters/${type}`), staleTime: Infinity });
}

/** Debounced auto-save of draft data; returns status for the "Saved" indicator. */
export function useAutoSave<T>(value: T, save: (v: T) => Promise<unknown>, enabled: boolean, delay = 1500) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const first = useRef(true);
  const json = JSON.stringify(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!enabled) return;
    const id = window.setTimeout(async () => {
      setStatus('saving');
      try {
        await saveRef.current(JSON.parse(json) as T);
        setStatus('saved');
        setSavedAt(new Date());
      } catch {
        setStatus('error');
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [json, enabled, delay]);
  return { status, savedAt };
}
