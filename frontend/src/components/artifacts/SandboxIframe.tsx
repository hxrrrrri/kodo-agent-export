import { CSSProperties, forwardRef } from 'react'

type Props = {
  srcDoc: string
  title: string
  style?: CSSProperties
  allowForms?: boolean
  allowPopups?: boolean
}

/**
 * Hardened srcdoc iframe used by every artifact runtime.
 *
 * Defaults to `allow-scripts` only. `allow-same-origin` is NEVER applied — that
 * would let the artifact read the parent's cookies/localStorage. Optional
 * `allow-forms` / `allow-popups` are opt-in and surfaced to the user as
 * additional capabilities via toggle props.
 */
export const SandboxIframe = forwardRef<HTMLIFrameElement, Props>(function SandboxIframe(
  { srcDoc, title, style, allowForms = false, allowPopups = false },
  ref,
) {
  const flags = ['allow-scripts']
  if (allowForms) flags.push('allow-forms')
  if (allowPopups) flags.push('allow-popups')

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      sandbox={flags.join(' ')}
      title={title}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
        ...style,
      }}
    />
  )
})
