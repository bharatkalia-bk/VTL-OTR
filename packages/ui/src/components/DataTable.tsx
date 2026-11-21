import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  numeric?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty, onRowClick, selectedKey }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption: string; empty?: ReactNode; onRowClick?: (r: T) => void; selectedKey?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-navy text-xs uppercase tracking-wide text-white">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold', c.numeric && 'text-right', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">{empty}</td></tr>}
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('even:bg-surface/60', onRowClick && 'cursor-pointer hover:bg-navy-50', selectedKey === k && '!bg-orange-50')}>
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-top', c.numeric && 'text-right tabular-nums', c.className)}>{c.cell(r)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CursorPager({ hasMore, onMore, loading, label }: { hasMore: boolean; onMore: () => void; loading?: boolean; label: string }) {
  if (!hasMore) return null;
  return <div className="mt-3 flex justify-center"><Button onClick={onMore} loading={loading}>{label}</Button></div>;
}
