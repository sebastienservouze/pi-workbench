import type { CSSProperties } from 'react'

const confettiPieces = Array.from({ length: 88 }, (_, index) => ({
  left: `${(index * 37) % 103 - 2}%`,
  width: `${6 + (index * 5) % 9}px`,
  height: `${5 + (index * 7) % 12}px`,
  delay: `${-((index * 13) % 2900)}ms`,
  duration: `${2200 + (index * 17) % 1500}ms`,
  drift: `${-180 + (index * 71) % 361}px`,
  rotation: `${360 + (index * 83) % 1080}deg`,
  color: ['#23776d', '#6851a4', '#c75b00', '#d84d68', '#28734b', '#d6aa45'][index % 6],
  radius: index % 4 === 0 ? '50%' : index % 3 === 0 ? '2px' : '1px',
}))

/** Displays a short-lived, decorative celebration without intercepting app input. */
export function Confetti({ celebrationKey }: { celebrationKey: number }) {
  return <div aria-hidden="true" className="celebration-overlay" key={celebrationKey}>
    {confettiPieces.map((piece, index) => <i
      className="celebration-piece"
      key={index}
      style={{
        '--confetti-left': piece.left,
        '--confetti-width': piece.width,
        '--confetti-height': piece.height,
        '--confetti-delay': piece.delay,
        '--confetti-duration': piece.duration,
        '--confetti-drift': piece.drift,
        '--confetti-rotation': piece.rotation,
        '--confetti-color': piece.color,
        '--confetti-radius': piece.radius,
      } as CSSProperties}
    />)}
  </div>
}
