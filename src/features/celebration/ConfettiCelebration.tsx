import { useEffect, useMemo, type CSSProperties, type ReactElement } from 'react'
import './celebration.css'

const pieceCount = 128
const colors = ['#ff4d6d', '#ff9f1c', '#ffd166', '#06d6a0', '#00b4d8', '#7b61ff', '#f72585']

type ConfettiStyle = CSSProperties & Record<`--${string}`, string>

/** Renders a short-lived, non-interactive celebration over the whole application. */
export function ConfettiCelebration({ onComplete }: { onComplete: () => void }): ReactElement {
  const pieces = useMemo(() => Array.from({ length: pieceCount }, (_, index) => {
    const wave = (index * 47) % 101
    const width = 5 + ((index * 13) % 10)
    const height = 7 + ((index * 17) % 15)
    const style: ConfettiStyle = {
      '--left': `${(index * 71) % 101}%`,
      '--top': `${18 + ((index * 37) % 80)}%`,
      '--drift-x': `${-92 + ((index * 43) % 185)}vw`,
      '--drift-y': `${-92 + ((index * 29) % 165)}vh`,
      '--duration': `${2.5 + ((index * 19) % 15) / 10}s`,
      '--delay': `${(index % 12) / 40}s`,
      '--spin': `${360 + ((index * 83) % 1080)}deg`,
      '--scale': `${0.8 + (wave % 7) / 10}`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: colors[index % colors.length],
      borderRadius: index % 5 === 0 ? '50%' : index % 3 === 0 ? '2px' : '1px',
      clipPath: index % 7 === 0 ? 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' : undefined,
    }
    return <i aria-hidden="true" className="confetti-piece" key={index} style={style} />
  }), [])

  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 3_700)
    return () => window.clearTimeout(timeout)
  }, [onComplete])

  return <div aria-hidden="true" className="confetti-overlay">{pieces}</div>
}
