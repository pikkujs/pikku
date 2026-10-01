import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Table, VisuallyHidden } from '@pikku/mantine/core'
import { useListState } from '@mantine/hooks'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './DndTable.module.css'

// A draggable row. `symbol` is an opaque identifier used as the drag key; `name`
// is opaque data; position/mass are numbers. A real app passes live rows via the
// `data` prop.
export interface DndTableRow {
  position: number
  mass: number
  symbol: string
  name: I18nString
}

const sampleData: DndTableRow[] = [
  { position: 6, mass: 12.011, symbol: 'C', name: asI18n('Carbon') },
  { position: 7, mass: 14.007, symbol: 'N', name: asI18n('Nitrogen') },
  { position: 39, mass: 88.906, symbol: 'Y', name: asI18n('Yttrium') },
  { position: 56, mass: 137.33, symbol: 'Ba', name: asI18n('Barium') },
  { position: 58, mass: 140.12, symbol: 'Ce', name: asI18n('Cerium') },
]

interface RowProps {
  item: DndTableRow
}

function SortableRow({ item }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.symbol,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Table.Tr ref={setNodeRef} style={style} className={classes.item} {...attributes}>
      <Table.Td>
        <div className={classes.dragHandle} {...listeners}>
          <GripVertical size={18} strokeWidth={1.5} />
        </div>
      </Table.Td>
      <Table.Td w={80}>{item.position}</Table.Td>
      <Table.Td w={120}>{item.name}</Table.Td>
      <Table.Td w={80}>{item.symbol}</Table.Td>
      <Table.Td>{item.mass}</Table.Td>
    </Table.Tr>
  )
}

interface DndTableProps {
  data?: DndTableRow[]
}

export function DndTable({ data = sampleData }: DndTableProps) {
  const [state, handlers] = useListState(data)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    const oldIndex = state.findIndex((i) => i.symbol === active.id)
    const newIndex = state.findIndex((i) => i.symbol === over.id)
    handlers.setState(arrayMove(state, oldIndex, newIndex))
  }

  return (
    <Table.ScrollContainer minWidth={420}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>
                <VisuallyHidden>{m.dndtable__drag_handle()}</VisuallyHidden>
              </Table.Th>
              <Table.Th w={80}>{m.dndtable__position()}</Table.Th>
              <Table.Th w={120}>{m.dndtable__name()}</Table.Th>
              <Table.Th w={40}>{m.dndtable__symbol()}</Table.Th>
              <Table.Th>{m.dndtable__mass()}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <SortableContext
            items={state.map((i) => i.symbol)}
            strategy={verticalListSortingStrategy}
          >
            <Table.Tbody>
              {state.map((item) => (
                <SortableRow key={item.symbol} item={item} />
              ))}
            </Table.Tbody>
          </SortableContext>
        </Table>
      </DndContext>
    </Table.ScrollContainer>
  )
}
