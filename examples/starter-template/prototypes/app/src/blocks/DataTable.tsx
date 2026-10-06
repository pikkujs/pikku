import type { ReactNode } from 'react'

export type Column<T> = { header: string; cell: (row: T) => ReactNode }

export function DataTable<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-start text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className="px-4 py-2 text-start font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => (
                <td key={c.header} className="px-4 py-3">
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
