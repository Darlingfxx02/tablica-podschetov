import { useRef, useState } from 'react'
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { useStore } from '../store'

export function ImportButton() {
  const { dispatch } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const baseName = file.name.replace(/\.xlsx?$/i, '')
      const { parseEstimateFromXlsx } = await import('../lib/import')
      const estimate = parseEstimateFromXlsx(buf, baseName)
      dispatch({ type: 'LOAD', state: estimate })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать файл')
    } finally {
      setIsImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 h-9 px-3 bg-white border border-[var(--color-border)] text-[#202020] rounded-lg text-sm font-medium hover:bg-[var(--color-row-even)] transition-colors cursor-pointer"
        title={error ?? undefined}
      >
        <ArrowUpTrayIcon className="w-4 h-4" />
        {isImporting ? 'Импорт...' : 'Импорт'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFile}
        className="hidden"
      />
    </>
  )
}
