import { useState } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import type { RendererProps } from '../../types/components'
import { PrimitiveRenderer } from './PrimitiveRenderer'
import { DynamicRenderer } from '../DynamicRenderer'
import { formatLabel } from '../../utils/formatLabel'
import { useAppStore } from '../../store/appStore'

/** Check if a value is empty (null, undefined, or empty string) */
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/** Renders a single object with primitive summary header and tabbed nested sections */
export function TabsRenderer({ data, schema, path, depth }: RendererProps) {
  const [showNullFields, setShowNullFields] = useState(false)
  const { getTabSelection, setTabSelection } = useAppStore()

  if (schema.kind !== 'object') {
    return <div className="text-red-500">TabsRenderer expects object schema</div>
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return <div className="text-red-500">TabsRenderer expects object data</div>
  }

  const obj = data as Record<string, unknown>
  const allFields = Array.from(schema.fields.entries())

  if (allFields.length === 0) {
    return <div className="text-muted-foreground italic">Empty object</div>
  }

  const allPrimitiveFields = allFields.filter(([, def]) => def.type.kind === 'primitive')
  const nestedFields = allFields.filter(([, def]) => def.type.kind !== 'primitive')

  // Count empty primitive fields
  const nullFieldCount = allPrimitiveFields.filter(([name]) => isEmptyValue(obj[name])).length

  // Filter primitives based on showNullFields toggle
  const primitiveFields = showNullFields
    ? allPrimitiveFields
    : allPrimitiveFields.filter(([name]) => !isEmptyValue(obj[name]))

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Summary header — primitive fields */}
      {primitiveFields.length > 0 && (
        <div className="p-4 bg-muted border-b border-border @container">
          {/* Empty fields toggle — only shown when there are empty fields */}
          {nullFieldCount > 0 && (
            <div className="flex justify-end -mt-1 mb-2">
              <button
                onClick={() => setShowNullFields(prev => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title={showNullFields ? "Hide empty fields" : `Show ${nullFieldCount} empty field${nullFieldCount === 1 ? '' : 's'}`}
              >
                {showNullFields ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
                <span>{showNullFields ? 'Hide empty' : `Show ${nullFieldCount} empty`}</span>
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 @md:grid-cols-3 gap-3">
            {primitiveFields.map(([name, def]) => (
              <div key={name} className="min-w-0 overflow-hidden">
                <div className="text-xs text-muted-foreground font-medium truncate">{formatLabel(name)}</div>
                <div className="mt-0.5 min-w-0 overflow-hidden text-ellipsis">
                  <PrimitiveRenderer
                    data={obj[name]}
                    schema={def.type}
                    path={`${path}.${name}`}
                    depth={depth + 1}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs for nested fields */}
      {nestedFields.length > 0 ? (
        <TabGroup
          selectedIndex={Math.min(getTabSelection(path), nestedFields.length - 1)}
          onChange={(index) => setTabSelection(path, index)}
        >
          <style>{`.tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
          <div className="relative">
            <div
              className="tabs-scroll overflow-x-auto scroll-smooth"
              style={{ scrollbarWidth: 'none' }}
            >
              <TabList className="flex border-b border-border bg-background w-max min-w-full">
                {nestedFields.map(([name]) => (
                  <Tab
                    key={name}
                    className="px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 border-transparent data-[selected]:border-foreground data-[selected]:text-foreground text-muted-foreground hover:text-foreground outline-none cursor-pointer"
                  >
                    {formatLabel(name)}
                  </Tab>
                ))}
              </TabList>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
          </div>
          <TabPanels className="p-4">
            {nestedFields.map(([name, def]) => (
              <TabPanel key={name}>
                <DynamicRenderer
                  data={obj[name]}
                  schema={def.type}
                  path={`${path}.${name}`}
                  depth={depth + 1}
                />
              </TabPanel>
            ))}
          </TabPanels>
        </TabGroup>
      ) : (
        // No nested fields — just show primitives in the header
        primitiveFields.length === 0 && (
          <div className="p-4 text-muted-foreground italic">No nested data to display in tabs</div>
        )
      )}
    </div>
  )
}
