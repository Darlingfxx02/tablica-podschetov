import { useRef, useCallback, useState, useEffect } from 'react'

interface UseDragReorderOptions {
  onReorder: (fromId: string, toId: string) => void
}

/**
 * Custom drag-and-drop reorder hook using mouse events.
 * Replaces HTML5 DnD to avoid ghost images, fly-back animations, and inconsistent behavior.
 *
 * Usage:
 *   const { draggingId, itemRef, dragHandleProps } = useDragReorder({ onReorder })
 *   <div ref={itemRef(id)} className={draggingId === id ? 'opacity-0' : ''}>
 *     <div {...dragHandleProps(id)} className="cursor-grab">handle</div>
 *   </div>
 */
export function useDragReorder({ onReorder }: UseDragReorderOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const stateRef = useRef({
    draggingId: null as string | null,
    clone: null as HTMLElement | null,
    offset: { x: 0, y: 0 },
    started: false,
    pendingId: null as string | null,
    startPos: { x: 0, y: 0 },
  })

  const itemsRef = useRef(new Map<string, HTMLElement>())
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder

  // Stable event handlers — created once via lazy ref init, use refs for mutable data
  const fnsRef = useRef<{
    onMouseMove: (e: MouseEvent) => void
    onMouseUp: () => void
    cleanup: () => void
  }>(null!)

  if (!fnsRef.current) {
    const cleanup = () => {
      const s = stateRef.current
      if (s.clone) {
        s.clone.remove()
        s.clone = null
      }
      s.started = false
      s.pendingId = null
      s.draggingId = null
      setDraggingId(null)
      document.body.classList.remove('drag-active')
    }

    const onMouseUp = () => {
      const s = stateRef.current
      if (s.started) {
        // Block the click event that follows mouseup after a real drag,
        // so onClick handlers (select section, open role modal) don't fire
        const block = (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
        }
        document.addEventListener('click', block, { capture: true, once: true })
        setTimeout(() => document.removeEventListener('click', block, true), 100)
      }
      cleanup()
      document.removeEventListener('mousemove', fnsRef.current.onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    const onMouseMove = (e: MouseEvent) => {
      const s = stateRef.current

      // Wait for movement threshold before starting drag
      if (!s.started && s.pendingId) {
        const dx = e.clientX - s.startPos.x
        const dy = e.clientY - s.startPos.y
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return

        const id = s.pendingId
        const el = itemsRef.current.get(id)
        if (!el) return

        s.started = true
        s.draggingId = id
        setDraggingId(id)

        const rect = el.getBoundingClientRect()
        s.offset = { x: e.clientX - rect.left, y: e.clientY - rect.top }

        // Create floating visual clone that follows the cursor
        const clone = el.cloneNode(true) as HTMLElement
        clone.style.position = 'fixed'
        clone.style.width = `${rect.width}px`
        clone.style.left = `${rect.left}px`
        clone.style.top = `${rect.top}px`
        clone.style.zIndex = '9999'
        clone.style.pointerEvents = 'none'
        clone.style.margin = '0'
        clone.style.opacity = '1'
        clone.style.boxShadow = '0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)'
        clone.style.background = 'white'
        clone.style.borderRadius = getComputedStyle(el).borderRadius
        document.body.appendChild(clone)
        s.clone = clone

        document.body.classList.add('drag-active')
      }

      if (!s.started || !s.clone || !s.draggingId) return
      e.preventDefault()

      // Move floating clone to follow cursor
      s.clone.style.left = `${e.clientX - s.offset.x}px`
      s.clone.style.top = `${e.clientY - s.offset.y}px`

      // Detect which item the cursor is over and trigger reorder
      const curId = s.draggingId
      for (const [id, el] of itemsRef.current) {
        if (id === curId) continue
        const r = el.getBoundingClientRect()
        if (
          e.clientX > r.left && e.clientX < r.right &&
          e.clientY > r.top && e.clientY < r.bottom
        ) {
          onReorderRef.current(curId, id)
          break
        }
      }
    }

    fnsRef.current = { onMouseMove, onMouseUp, cleanup }
  }

  // Cached per-item ref callbacks (stable across renders for same id)
  const refCache = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const itemRef = useCallback((id: string) => {
    let cb = refCache.current.get(id)
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) itemsRef.current.set(id, el)
        else itemsRef.current.delete(id)
      }
      refCache.current.set(id, cb)
    }
    return cb
  }, [])

  // Per-item drag handle props — not cached so they always use latest logic
  const dragHandleProps = useCallback((id: string) => ({
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      document.body.classList.add('drag-active')
      stateRef.current.pendingId = id
      stateRef.current.startPos = { x: e.clientX, y: e.clientY }
      document.addEventListener('mousemove', fnsRef.current.onMouseMove)
      document.addEventListener('mouseup', fnsRef.current.onMouseUp)
    },
  }), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fnsRef.current.cleanup()
      document.removeEventListener('mousemove', fnsRef.current.onMouseMove)
      document.removeEventListener('mouseup', fnsRef.current.onMouseUp)
    }
  }, [])

  return { draggingId, itemRef, dragHandleProps }
}
