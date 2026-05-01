import { Link } from 'react-router-dom'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import logoUrl from '../assets/logo.svg'

/**
 * Top of every sidebar: UX Art logo on the left (clickable, returns to the
 * dashboard) and a small settings gear on the right. Constant across the
 * dashboard, editor, and settings views so the chrome never restructures.
 */
export function BrandHeader() {
  return (
    <div className="px-5 pt-6 pb-4 flex items-center justify-between">
      <Link to="/" className="block" title="К проектам">
        <img src={logoUrl} alt="uxart" className="h-7 w-auto" />
      </Link>
      <Link
        to="/settings"
        className="p-1.5 -m-1.5 rounded-lg text-[var(--color-muted)] hover:text-[#202020] hover:bg-[var(--color-row-even)] transition-colors"
        title="Настройки"
        aria-label="Настройки"
      >
        <Cog6ToothIcon className="w-5 h-5" />
      </Link>
    </div>
  )
}
