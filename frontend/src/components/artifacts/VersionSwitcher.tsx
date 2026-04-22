import { ArtifactV2 } from '../../store/chatStore'

type Props = {
  versions: ArtifactV2[]
  activeVersion: number
  onSelect: (version: number) => void
  diffMode: boolean
  onToggleDiff: () => void
}

export function VersionSwitcher({ versions, activeVersion, onSelect, diffMode, onToggleDiff }: Props) {
  if (versions.length <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        fontSize: 9,
        letterSpacing: '0.12em',
        color: 'var(--text-2)',
        marginRight: 4,
      }}>
        VERSION
      </span>
      {versions.map((v) => (
        <button
          key={v.version}
          type="button"
          onClick={() => onSelect(v.version)}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid transparent',
            background: v.version === activeVersion ? 'var(--accent)' : 'var(--bg-2)',
            color: v.version === activeVersion ? '#fff' : 'var(--text-1)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
          }}
        >
          v{v.version}
        </button>
      ))}
      {versions.length >= 2 && (
        <button
          type="button"
          onClick={onToggleDiff}
          title="Compare to previous version"
          style={{
            marginLeft: 6,
            padding: '2px 8px',
            borderRadius: 4,
            border: diffMode ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: diffMode ? 'var(--accent-dim)' : 'transparent',
            color: diffMode ? 'var(--text-0)' : 'var(--text-2)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
          }}
        >
          diff
        </button>
      )}
    </div>
  )
}
