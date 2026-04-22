import { ArtifactFile } from '../../lib/artifacts/types'

type Props = {
  files: ArtifactFile[]
  activePath: string
  onSelect: (path: string) => void
  entrypoint?: string
}

export function FileTree({ files, activePath, onSelect, entrypoint }: Props) {
  if (files.length <= 1) return null
  return (
    <div style={{
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-1)',
      width: 180,
      flexShrink: 0,
      overflow: 'auto',
      padding: '6px 0',
    }}>
      <div style={{
        fontSize: 9,
        color: 'var(--text-2)',
        letterSpacing: '0.12em',
        padding: '0 10px 6px',
      }}>
        FILES
      </div>
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => onSelect(file.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '5px 10px',
            border: 'none',
            background: file.path === activePath ? 'var(--bg-3)' : 'transparent',
            color: file.path === activePath ? 'var(--text-0)' : 'var(--text-1)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
          {file.path === entrypoint && <span style={{ fontSize: 8, color: 'var(--accent)', marginLeft: 4 }}>■</span>}
        </button>
      ))}
    </div>
  )
}
