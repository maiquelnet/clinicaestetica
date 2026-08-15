import { ManagementSectionNav } from '../shared/ManagementPage'

export function StockSectionNav() {
  return <ManagementSectionNav label="Seções do Estoque" items={[
    { to: '/estoque/itens', label: 'Itens de estoque' },
    { to: '/estoque/fornecedores', label: 'Fornecedores' },
  ]} />
}
