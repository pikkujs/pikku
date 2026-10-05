export interface DotsProps extends React.ComponentPropsWithoutRef<'svg'> {
  size?: number
  radius?: number
}

// Pure decorative dot-grid SVG — no user-facing text.
export function Dots({ size = 185, radius = 2.5, ...others }: DotsProps) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 185 185"
      width={size}
      height={size}
      {...others}
    >
      {Array.from({ length: 10 }).flatMap((_, row) =>
        Array.from({ length: 10 }).map((__, col) => (
          <rect key={`${row}-${col}`} width="5" height="5" x={col * 20} y={row * 20} rx={radius} />
        )),
      )}
    </svg>
  )
}
