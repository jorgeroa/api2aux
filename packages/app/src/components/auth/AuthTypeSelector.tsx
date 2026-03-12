import type { AuthType } from '../../types/auth'

interface AuthTypeSelectorProps {
  value: AuthType | 'none'
  onChange: (type: AuthType | 'none') => void
  detectedType?: AuthType
}

/**
 * Dropdown selector for authentication type.
 * Offers: None, API Key, Bearer Token, Basic Auth, Query Parameter
 */
export function AuthTypeSelector({ value, onChange, detectedType }: AuthTypeSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="auth-type"
        className="block text-sm font-medium text-foreground"
      >
        Auth Type
      </label>
      <div className="flex items-center gap-2">
        <select
          id="auth-type"
          value={value}
          onChange={(e) => onChange(e.target.value as AuthType | 'none')}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus-visible:ring-ring/50"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apiKey">API Key</option>
          <option value="queryParam">Query Parameter</option>
          <option value="cookie">Cookie</option>
        </select>
        {detectedType && value === detectedType && (
          <span className="text-xs text-primary font-medium whitespace-nowrap">
            Detected from spec
          </span>
        )}
      </div>
    </div>
  )
}
