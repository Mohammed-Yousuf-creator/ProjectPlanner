import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Adds the amber-tinted highlight row style (recipe 5.5). */
  isHighlighted?: (row: T) => boolean;
  emptyMessage?: string;
  className?: string;
};

/** DESIGN_SYSTEM 5.5 - dense editorial table with a mono uppercase header. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isHighlighted,
  emptyMessage = 'No records found.',
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-taupe">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('whitespace-nowrap px-4 py-3 font-semibold', column.headerClassName)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'transition-colors',
                  isHighlighted?.(row) ? 'bg-amber-50/70 font-medium' : 'hover:bg-canvas',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('align-middle px-4 py-3.5 text-ink', column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
