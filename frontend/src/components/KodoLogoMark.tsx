type KodoLogoMarkProps = {
  size?: number
  decorative?: boolean
  title?: string
  color?: string
  className?: string
}

export function KodoLogoMark({
  size = 24,
  decorative = true,
  title = 'KODO logo',
  color = 'var(--logo-primary)',
  className = '',
}: KodoLogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-6 -4 112 108"
      width={size}
      height={size}
      className={className || undefined}
      fill={color}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative}
      aria-label={decorative ? undefined : title}
      style={{ display: 'block' }}
    >
      <g transform="translate(50 50) scale(1.11 1.07) translate(-50 -50)">
        <path d="M 28 15 C 18 15, 18 45, 8 50 C 18 55, 18 85, 28 85 L 28 73 C 22 73, 22 58, 16 50 C 22 42, 22 27, 28 27 Z" />
        <rect x="34" y="15" width="8" height="70" />
        <path d="M 42 55 C 52 45, 62 30, 68 25 L 56 25 L 76 12 L 80 32 L 68 25 C 62 32, 52 48, 42 62 Z" />
        <path d="M 48 57 C 58 64, 65 75, 75 85 L 85 85 C 75 75, 65 60, 50 51 Z" />
      </g>
    </svg>
  )
}
