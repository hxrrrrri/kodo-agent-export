import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArtifactV2 } from '../../store/chatStore'

type Props = {
  artifact: ArtifactV2
}

export function MarkdownRuntime({ artifact }: Props) {
  const source = artifact.files[0]?.content || ''
  return (
    <div style={{
      padding: '20px 24px',
      overflow: 'auto',
      height: '100%',
      background: 'var(--bg-0)',
      color: 'var(--text-0)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      lineHeight: 1.65,
    }}>
      <div style={{ maxWidth: 780 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
      </div>
    </div>
  )
}
