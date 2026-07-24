import type { ReactNode } from 'react'

/** Keeps widget actions fixed while allowing only the content area to scroll. */
export function WidgetLayout({ children, footer, header }: { children: ReactNode; footer?: ReactNode | false; header: ReactNode }) {
  return <>
    <header className="widget-header">{header}</header>
    <div className="widget-content">{children}</div>
    {footer && <footer className="widget-footer">{footer}</footer>}
  </>
}
