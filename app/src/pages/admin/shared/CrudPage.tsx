import type { ReactNode } from 'react'
import { Eraser } from 'lucide-react'
import { EmptyState, LoadingBlock } from '../../../components/Ui'
import { PageHeader } from '../../../components/PageHeader'

export function CrudHeader({ title, onClear }: { title: string; onClear: () => void }) {
  return <div className="panel-header compact-header"><h2>{title}</h2><button className="ghost-button compact-action" type="button" onClick={onClear}><Eraser size={15} /> Limpar</button></div>
}

export function SimpleCrudPage<T>({ title, eyebrow, description, loading, records, renderRecord, form }: {
  title: string
  eyebrow: string
  description: string
  loading: boolean
  records: T[]
  renderRecord: (record: T) => ReactNode
  form: ReactNode
}) {
  return (
    <main className="content-page">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="data-workspace has-drawer">
        <section className="panel list-panel data-panel">
          <div className="panel-header compact-header"><h2>Registros</h2><span>{records.length} cadastrados</span></div>
          {loading ? <LoadingBlock /> : records.length ? <div className="record-list">{records.map(renderRecord)}</div> : <EmptyState title="Nenhum registro encontrado" />}
        </section>
        {form}
      </div>
    </main>
  )
}
