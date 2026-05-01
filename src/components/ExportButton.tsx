import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useStore } from '../store'

export function ExportButton() {
  const { state } = useStore()
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    if (isExporting) return
    const isSafari = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent)
    const downloadWindow = isSafari ? window.open('', '_blank') : null

    if (downloadWindow) {
      downloadWindow.document.title = 'Подготовка .xlsx'
      downloadWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Подготавливаю Excel-файл...</p>'
    }

    setIsExporting(true)
    try {
      const { exportToXlsx } = await import('../lib/export')
      await exportToXlsx(state, { downloadWindow })
    } catch (error) {
      console.error('XLSX export failed', error)
      if (downloadWindow && !downloadWindow.closed) downloadWindow.close()
      window.alert('Не удалось скачать .xlsx. Попробуй обновить страницу, а если не поможет, напиши мне и я добью ошибку.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="flex items-center gap-1.5 h-9 px-3 bg-[#202020] text-white rounded-lg text-sm font-medium hover:bg-black transition-colors cursor-pointer"
    >
      <ArrowDownTrayIcon className="w-4 h-4" />
      {isExporting ? 'Подготовка...' : 'Скачать .xlsx'}
    </button>
  )
}
