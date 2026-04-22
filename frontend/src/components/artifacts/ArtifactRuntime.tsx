import { ArtifactV2 } from '../../store/chatStore'
import { CodeRuntime } from './CodeRuntime'
import { DotRuntime } from './DotRuntime'
import { HtmlRuntime } from './HtmlRuntime'
import { MarkdownRuntime } from './MarkdownRuntime'
import { MermaidRuntime } from './MermaidRuntime'
import { ReactRuntime } from './ReactRuntime'
import { SvgRuntime } from './SvgRuntime'

type Props = {
  artifact: ArtifactV2
  allowForms?: boolean
  allowPopups?: boolean
  allowAllImports?: boolean
}

/** Routes by artifact type to the correct sandboxed runtime. */
export function ArtifactRuntime({ artifact, allowForms, allowPopups, allowAllImports }: Props) {
  switch (artifact.type) {
    case 'html':
    case 'html-multi':
      return <HtmlRuntime artifact={artifact} allowForms={allowForms} allowPopups={allowPopups} />
    case 'react':
    case 'react-multi':
      return <ReactRuntime
        artifact={artifact}
        allowForms={allowForms}
        allowPopups={allowPopups}
        allowAllImports={allowAllImports}
      />
    case 'svg':
      return <SvgRuntime artifact={artifact} />
    case 'mermaid':
      return <MermaidRuntime artifact={artifact} />
    case 'markdown':
      return <MarkdownRuntime artifact={artifact} />
    case 'dot':
      return <DotRuntime artifact={artifact} />
    case 'code':
    default:
      return <CodeRuntime artifact={artifact} />
  }
}

export function canLivePreview(type: string): boolean {
  return ['html', 'html-multi', 'react', 'react-multi', 'svg', 'mermaid', 'markdown', 'dot'].includes(type)
}
