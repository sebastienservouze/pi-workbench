import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './tooltip.css'

/** Renders a tooltip in the document layer so parent containers cannot clip it. */
export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<Element | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!visible) return
    const updatePosition = (): void => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip || !trigger.isConnected) return
      const triggerRect = trigger.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()
      const left = Math.min(Math.max(8, triggerRect.left + (triggerRect.width - tooltipRect.width) / 2), window.innerWidth - tooltipRect.width - 8)
      let top = triggerRect.top - tooltipRect.height - 8
      if (top < 8) top = triggerRect.bottom + 8
      if (top + tooltipRect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - tooltipRect.height - 8)
      setPosition({ top, left })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [visible])

  function show(eventTarget: EventTarget | null): void {
    if (!(eventTarget instanceof Element)) return
    triggerRef.current = eventTarget
    setPosition(null)
    setVisible(true)
  }

  function hide(): void {
    setVisible(false)
    triggerRef.current = null
  }

  return <>
    <span className="tooltip-host" onBlur={hide} onFocus={(event) => show(event.target)} onPointerEnter={(event) => show(event.target)} onPointerLeave={hide}>{children}</span>
    {visible && createPortal(<div className="tooltip-content" ref={tooltipRef} role="tooltip" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>{label}</div>, document.body)}
  </>
}
