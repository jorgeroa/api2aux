import { Lock, LockOpen } from 'lucide-react'
import { Button } from '../ui/button'
import type { AuthStatus, AuthType } from '../../types/auth'

interface LockIconProps {
  status: AuthStatus
  activeType?: AuthType | null
  onClick: () => void
}

/**
 * Lock icon button with three visual states:
 * - none/untested: Gray lock-open icon
 * - active/success: Green filled lock icon
 * - failed: Red lock icon with alert indicator
 */
export function LockIcon({ status, activeType, onClick }: LockIconProps) {
  const getIconState = () => {
    if (status === 'success' || (status === 'untested' && activeType)) {
      // Active state: green lock
      return {
        Icon: Lock,
        className: 'text-green-600',
        title: activeType ? `${formatAuthType(activeType)} active` : 'Authentication active',
      }
    }

    if (status === 'failed') {
      // Failed state: red lock
      return {
        Icon: Lock,
        className: 'text-red-500',
        title: 'Authentication failed',
      }
    }

    // None/untested state: gray lock-open
    return {
      Icon: LockOpen,
      className: 'text-gray-400',
      title: 'No authentication configured',
    }
  }

  const { Icon, className, title } = getIconState()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      className={className}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

/**
 * Format auth type for display
 */
function formatAuthType(type: AuthType): string {
  switch (type) {
    case 'bearer':
      return 'Bearer Token'
    case 'basic':
      return 'Basic Auth'
    case 'apiKey':
      return 'API Key'
    case 'queryParam':
      return 'Query Parameter'
    case 'cookie':
      return 'Cookie'
  }
}
