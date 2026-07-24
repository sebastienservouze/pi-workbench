import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './tooltip.css'

const SHOW_DELAY_MS = 400
const HIDE_TRANSITION_MS = 150

/** Renders a tooltip in the document layer so parent containers cannot clip it. Delays appearance to avoid flicker during quick pointer movement and fades in/out with a CSS transition. */
export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<Element | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!mounted) return
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
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [mounted])

  const clearTimers = useCallback(() => {
    if (showTimer.current !== null) { clearTimeout(showTimer.current); showTimer.current = null }
    if (hideTimer.current !== null) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }, [])

  function show(eventTarget: EventTarget | null): void {
    if (!(eventTarget instanceof Element)) return
    clearTimers()
    triggerRef.current = eventTarget
    showTimer.current = window.setTimeout(() => {
      setPosition(null)
      setMounted(true)
    }, SHOW_DELAY_MS)
  }

  function hide(): void {
    clearTimers()
    setEntered(false)
    hideTimer.current = window.setTimeout(() => {
      setMounted(false)
      triggerRef.current = null
    }, HIDE_TRANSITION_MS)
  }

  return <>
    <span className="tooltip-host" onBlur={hide} onFocus={(event) => show(event.target)} onPointerEnter={(event) => show(event.target)} onPointerLeave={hide}>{children}</span>
    {mounted && createPortal(<div className="tooltip-content" data-entered={entered || undefined} ref={tooltipRef} role="tooltip" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>{label}</div>, document.body)}
  </>
}
