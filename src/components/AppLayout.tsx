import { useState, createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'
import { BrandHeader } from './BrandHeader'

const SidebarSlotContext = createContext<HTMLElement | null>(null)

export function SidebarPortal({ children }: { children: ReactNode }) {
  const slot = useContext(SidebarSlotContext)
  if (!slot) return null
  return createPortal(children, slot)
}

export function AppLayout() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div className="h-screen flex bg-[#f5f5f5] text-[#202020] overflow-hidden">
      <aside className="w-[260px] shrink-0 bg-white border-r border-[var(--color-border)] flex flex-col overflow-hidden">
        <BrandHeader />
        <div ref={setSlot} className="flex-1 flex flex-col min-h-0" />
      </aside>
      <SidebarSlotContext.Provider value={slot}>
        <Outlet />
      </SidebarSlotContext.Provider>
    </div>
  )
}
