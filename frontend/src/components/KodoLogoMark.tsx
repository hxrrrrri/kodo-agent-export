type KodoLogoMarkProps = {
  size?: number
  decorative?: boolean
  title?: string
}

export function KodoLogoMark({ size = 24, decorative = true, title = 'KODO logo' }: KodoLogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      fill="none"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative}
      aria-label={decorative ? undefined : title}
      style={{ display: 'block' }}
    >
      <path
        d="M25 12H35V20H31C26.4 20 24 22.4 24 27V43C24 50 21.2 55.1 15 58C21.2 60.9 24 66 24 73V89C24 93.6 26.4 96 31 96H35V104H25C16.1 104 12 99.9 12 91V74C12 67.1 9 63.6 4 60V56C9 52.4 12 48.9 12 42V25C12 16.1 16.1 12 25 12Z"
        fill="var(--logo-primary)"
      />
      <rect x="46" y="12" width="8" height="92" fill="var(--logo-primary)" />
      <path
        d="M54 60C68 51 77 45 84 35C88 29 90 23 92 17"
        stroke="var(--logo-secondary)"
        strokeWidth={8}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <path
        d="M54 60C70 66 78 77 84 90C87 96 91 100 98 100H103"
        stroke="var(--logo-secondary)"
        strokeWidth={8}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <path
        d="M83 19L109 25L92 43Z"
        fill="var(--logo-secondary)"
      />
    </svg>
  )
}
