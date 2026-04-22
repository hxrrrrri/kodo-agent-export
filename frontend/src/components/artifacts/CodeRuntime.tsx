import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ArtifactV2 } from '../../store/chatStore'

type Props = {
  artifact: ArtifactV2
  activeFile?: string
}

export function CodeRuntime({ artifact, activeFile }: Props) {
  const file = artifact.files.find((f) => f.path === activeFile) || artifact.files[0]
  if (!file) return null

  return (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={file.language || 'text'}
      PreTag="div"
      customStyle={{
        margin: 0,
        borderRadius: 0,
        background: '#080810',
        fontSize: 12,
        padding: '16px',
        minHeight: '100%',
        lineHeight: 1.6,
      }}
    >
      {file.content}
    </SyntaxHighlighter>
  )
}
