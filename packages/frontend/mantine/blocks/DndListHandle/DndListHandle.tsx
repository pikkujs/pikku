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
import { Text } from '@pikku/mantine/core'
import { useListState } from '@mantine/hooks'
import { asI18n, m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import classes from './DndListHandle.module.css'

// A draggable list row with a dedicated grip handle. `symbol` is an opaque
// identifier used as the drag key; `name` is opaque data; position/mass are
// numbers. A real app passes live rows via the `data` prop.
export interface DndListHandleRow {
  position: number
  mass: number
  symbol: string
  name: I18nString
}

const sampleData: DndListHandleRow[] = [
  { position: 6, mass: 12.011, symbol: 'C', name: asI18n('Carbon') },
  { position: 7, mass: 14.007, symbol: 'N', name: asI18n('Nitrogen') },
  { position: 39, mass: 88.906, symbol: 'Y', name: asI18n('Yttrium') },
  { position: 56, mass: 137.33, symbol: 'Ba', name: asI18n('Barium') },
  { position: 58, mass: 140.12, symbol: 'Ce', name: asI18n('Cerium') },
]

interface ItemProps {
  item: DndListHandleRow
}

function SortableItem({ item }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.symbol,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      className={isDragging ? `${classes.item} ${classes.itemDragging}` : classes.item}
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <div className={classes.dragHandle} {...listeners}>
        <GripVertical size={18} strokeWidth={1.5} />
      </div>
      <Text className={classes.symbol}>{asI18n(item.symbol)}</Text>
      <div>
        <Text>{item.name}</Text>
        <Text c="dimmed" size="sm">
          {m.dndlisthandle__meta({ position: item.position, mass: item.mass })}
        </Text>
      </div>
    </div>
  )
}

interface DndListHandleProps {
  data?: DndListHandleRow[]
}

export function DndListHandle({ data = sampleData }: DndListHandleProps) {
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={state.map((i) => i.symbol)} strategy={verticalListSortingStrategy}>
        {state.map((item) => (
          <SortableItem key={item.symbol} item={item} />
        ))}
      </SortableContext>
    </DndContext>
  )
}
