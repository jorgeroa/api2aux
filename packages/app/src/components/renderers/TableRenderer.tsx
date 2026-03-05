import { useState, useEffect } from 'react'
import type { RendererProps } from '../../types/components'
import { PrimitiveRenderer } from './PrimitiveRenderer'
import { DrilldownContainer } from '../detail/DrilldownContainer'
import { useConfigStore } from '../../store/configStore'
import { FieldControls } from '../config/FieldControls'
import { FieldConfigPopover } from '../config/FieldConfigPopover'
import { SortableFieldList } from '../config/SortableFieldList'
import { DraggableField } from '../config/DraggableField'
import { isImageUrl } from '../../utils/imageDetection'
import { useItemDrilldown } from '../../hooks/useItemDrilldown'
import { usePagination } from '../../hooks/usePagination'
import { PaginationControls } from '../pagination/PaginationControls'

/** Compact inline display for non-primitive values in table cells */
function CompactValue({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">null</span>
  }
  if (Array.isArray(data)) {
    return (
      <span className="text-muted-foreground text-xs" title={JSON.stringify(data)}>
        [{data.length} items]
      </span>
    )
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data)
    return (
      <span className="text-muted-foreground text-xs" title={JSON.stringify(data)}>
        {'{'}
        {keys.slice(0, 2).join(', ')}
        {keys.length > 2 ? ', ...' : ''}
        {'}'}
      </span>
    )
  }
  return <span>{String(data)}</span>
}

/**
 * TableRenderer displays arrays of objects as a scrollable table.
 * Uses CSS-based scrolling with good performance for large datasets.
 * Note: react-window 2.x has API changes that are incompatible with the plan's expectations.
 * This implementation provides the same UX with simpler, more reliable code.
 */
export function TableRenderer({ data, schema, path, depth }: RendererProps) {
  const [popoverState, setPopoverState] = useState<{
    fieldPath: string
    fieldName: string
    fieldValue: unknown
    position: { x: number; y: number }
  } | null>(null)
  const { mode, fieldConfigs, reorderFields, getPaginationConfig, setPaginationConfig } = useConfigStore()
  const { selectedItem, handleItemClick, clearSelection } = useItemDrilldown(
    schema.kind === 'array' ? schema.items : schema, path, data, schema
  )

  // All hooks must be called before any early returns (React Rules of Hooks)
  const dataArray = Array.isArray(data) ? data : []
  const paginationConfig = getPaginationConfig(path, 20)
  const pagination = usePagination({
    totalItems: dataArray.length,
    itemsPerPage: paginationConfig.itemsPerPage,
    currentPage: paginationConfig.currentPage,
  })

  // Listen for cross-navigation events from ConfigPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { fieldPath } = (e as CustomEvent).detail
      // Check if this renderer owns this field (table columns use $[].fieldName pattern)
      if (schema.kind === 'array' && schema.items.kind === 'object') {
        const columns = Array.from(schema.items.fields.entries())
        const match = columns.find(([name]) => `${path}[].${name}` === fieldPath)
        if (match) {
          const [fieldName] = match
          // Get sample value from first row if available
          const firstRow = Array.isArray(data) && data.length > 0 ? data[0] as Record<string, unknown> : null
          const fieldValue = firstRow ? firstRow[fieldName] : undefined
          // Position near the field's header element
          const el = document.querySelector(`[data-field-path="${fieldPath}"]`)
          const rect = el?.getBoundingClientRect()
          const pos = rect
            ? { x: rect.right, y: rect.top }
            : { x: window.innerWidth / 2, y: window.innerHeight / 3 }
          setPopoverState({ fieldPath, fieldName, fieldValue, position: pos })
        }
      }
    }
    document.addEventListener('api2aux:configure-field', handler)
    return () => document.removeEventListener('api2aux:configure-field', handler)
  }, [schema, data])

  const handleFieldContextMenu = (
    e: React.MouseEvent,
    fieldPath: string,
    fieldName: string,
    fieldValue: unknown
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setPopoverState({ fieldPath, fieldName, fieldValue, position: { x: e.clientX, y: e.clientY } })
  }

  if (schema.kind !== 'array') {
    return <div className="text-red-500">TableRenderer expects array schema</div>
  }

  if (!Array.isArray(data)) {
    return <div className="text-red-500">TableRenderer expects array data</div>
  }

  // Handle empty arrays
  if (data.length === 0) {
    return <div className="text-muted-foreground italic p-4">No data</div>
  }

  // Extract columns from the item schema (must be object)
  if (schema.items.kind !== 'object') {
    return <div className="text-red-500">TableRenderer expects array of objects</div>
  }

  const paginatedData = data.slice(pagination.firstIndex, pagination.lastIndex)

  const handlePageChange = (page: number) => {
    setPaginationConfig(path, { currentPage: page })
  }

  const handleItemsPerPageChange = (items: number) => {
    setPaginationConfig(path, { itemsPerPage: items, currentPage: 1 })
  }

  const allColumns = Array.from(schema.items.fields.entries())

  // Apply field ordering: sort by order if set, maintain original order otherwise
  const sortedColumns = [...allColumns].sort((a, b) => {
    const pathA = `${path}[].${a[0]}`
    const pathB = `${path}[].${b[0]}`
    const configA = fieldConfigs[pathA]
    const configB = fieldConfigs[pathB]

    const orderA = configA?.order ?? Number.MAX_SAFE_INTEGER
    const orderB = configB?.order ?? Number.MAX_SAFE_INTEGER

    if (orderA !== orderB) {
      return orderA - orderB
    }

    // Preserve original order for fields with same/no order
    return allColumns.findIndex(col => col[0] === a[0]) - allColumns.findIndex(col => col[0] === b[0])
  })

  // Filter columns based on visibility in View mode
  const isConfigureMode = mode === 'configure'
  const visibleColumns = isConfigureMode
    ? sortedColumns  // Show all in Configure mode
    : sortedColumns.filter(([fieldName]) => {
        const fieldPath = `${path}[].${fieldName}`
        const config = fieldConfigs[fieldPath]
        return config?.visible !== false
      })

  if (visibleColumns.length === 0 && !isConfigureMode) {
    return <div className="text-muted-foreground italic p-4">All fields hidden</div>
  }

  const columnWidth = Math.max(150, Math.floor(900 / visibleColumns.length))
  const totalWidth = columnWidth * visibleColumns.length

  // Column paths for drag-and-drop ordering
  const columnPaths = visibleColumns.map(([fieldName]) => `${path}[].${fieldName}`)

  const handleReorder = (orderedPaths: string[]) => {
    reorderFields(orderedPaths)
  }

  const renderHeader = () => {
    const headerRow = (
      <div className="flex bg-background border-b-2 border-border font-semibold sticky top-0 z-10" style={{ minWidth: totalWidth }}>
        {visibleColumns.map(([fieldName]) => {
          const fieldPath = `${path}[].${fieldName}`
          const config = fieldConfigs[fieldPath]
          const isVisible = config?.visible !== false

          // Format column header: use custom label if set, otherwise auto-format
          const defaultLabel = fieldName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase())
          const displayLabel = config?.label || defaultLabel

          const headerContent = (
            <div
              data-field-path={fieldPath}
              className="px-4 py-3 border-r border-border text-sm"
              style={{ width: columnWidth, minWidth: columnWidth }}
            >
              {displayLabel}
            </div>
          )

          const headerCell = isConfigureMode ? (
            <FieldControls
              key={fieldName}
              fieldPath={fieldPath}
              fieldName={fieldName}
              isVisible={isVisible}
              customLabel={config?.label}
            >
              {headerContent}
            </FieldControls>
          ) : (
            <div key={fieldName}>{headerContent}</div>
          )

          // In Configure mode: wrap each header cell in DraggableField
          if (isConfigureMode) {
            return (
              <DraggableField key={fieldName} id={fieldPath}>
                {headerCell}
              </DraggableField>
            )
          }

          return headerCell
        })}
      </div>
    )

    // In Configure mode: wrap the entire header row in SortableFieldList
    if (isConfigureMode) {
      return (
        <SortableFieldList items={columnPaths} onReorder={handleReorder}>
          {headerRow}
        </SortableFieldList>
      )
    }

    return headerRow
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Single scroll container — header and body scroll horizontally together */}
      <div className="overflow-auto" style={{ maxHeight: '600px' }}>
        {renderHeader()}

        {paginatedData.map((item, paginatedIndex) => {
          const row = item as Record<string, unknown>
          const globalIndex = pagination.firstIndex + paginatedIndex
          const isEven = paginatedIndex % 2 === 0

          return (
            <div
              key={globalIndex}
              onClick={() => handleItemClick(item, globalIndex)}
              className={`flex border-b border-border cursor-pointer hover:bg-muted ${
                isEven ? 'bg-muted' : 'bg-background'
              }`}
              style={{ minWidth: totalWidth }}
            >
              {visibleColumns.map(([fieldName, fieldDef]) => {
                const value = row[fieldName]
                const cellPath = `${path}[${globalIndex}].${fieldName}`
                const columnFieldPath = `${path}[].${fieldName}`

                // Check if this cell contains an image URL
                const isImage = fieldDef.type.kind === 'primitive' &&
                               typeof value === 'string' &&
                               isImageUrl(value)

                return (
                  <div
                    key={fieldName}
                    className="px-4 py-2 border-r border-border flex items-center overflow-hidden"
                    style={{ width: columnWidth, minWidth: columnWidth, height: '40px' }}
                    onContextMenu={(e) => handleFieldContextMenu(e, columnFieldPath, fieldName, value)}
                    onTouchStart={(e) => {
                      const touch = e.touches[0]
                      if (!touch) return
                      const touchX = touch.clientX
                      const touchY = touch.clientY
                      const timer = setTimeout(() => {
                        e.preventDefault()
                        setPopoverState({ fieldPath: columnFieldPath, fieldName, fieldValue: value, position: { x: touchX, y: touchY } })
                      }, 800)
                      ;(e.currentTarget as HTMLElement).dataset.longPressTimer = String(timer)
                    }}
                    onTouchEnd={(e) => {
                      const timer = (e.currentTarget as HTMLElement).dataset.longPressTimer
                      if (timer) clearTimeout(Number(timer))
                    }}
                    onTouchMove={(e) => {
                      const timer = (e.currentTarget as HTMLElement).dataset.longPressTimer
                      if (timer) clearTimeout(Number(timer))
                    }}
                  >
                    {isImage ? (
                      <div className="flex items-center gap-2 w-full">
                        <img
                          src={value as string}
                          alt={fieldName}
                          loading="lazy"
                          className="h-8 w-8 rounded object-cover flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <span className="text-xs text-muted-foreground truncate" title={value as string}>
                          {(value as string).split('/').pop() || value}
                        </span>
                      </div>
                    ) : (
                      <div className="truncate w-full">
                        {fieldDef.type.kind === 'primitive' ? (
                          <PrimitiveRenderer
                            data={value}
                            schema={fieldDef.type}
                            path={cellPath}
                            depth={depth + 1}
                          />
                        ) : (
                          <CompactValue data={value} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Pagination controls */}
      {(pagination.totalPages > 1 || data.length > 20) && (
        <PaginationControls
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={data.length}
          itemsPerPage={paginationConfig.itemsPerPage}
          pageNumbers={pagination.pageNumbers}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      )}

      <DrilldownContainer
        selectedItem={selectedItem}
        itemSchema={schema.items}
        onClose={clearSelection}
      />

      {/* Field config popover */}
      {popoverState && (
        <FieldConfigPopover
          fieldPath={popoverState.fieldPath}
          fieldName={popoverState.fieldName}
          fieldValue={popoverState.fieldValue}
          position={popoverState.position}
          onClose={() => setPopoverState(null)}
        />
      )}
    </div>
  )
}
