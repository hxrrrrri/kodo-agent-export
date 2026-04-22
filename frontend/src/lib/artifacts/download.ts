import JSZip from 'jszip'
import { ArtifactV2 } from './types'

export async function downloadArtifactAsZip(artifact: ArtifactV2): Promise<void> {
  const zip = new JSZip()
  for (const file of artifact.files) {
    zip.file(file.path, file.content)
  }
  zip.file('artifact.json', JSON.stringify({
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    version: artifact.version,
    entrypoint: artifact.entrypoint,
  }, null, 2))

  const blob = await zip.generateAsync({ type: 'blob' })
  const safe = artifact.id.replace(/[^a-z0-9-_]/gi, '-')
  triggerBlobDownload(blob, `${safe}-v${artifact.version}.zip`)
}

export function downloadArtifactFile(file: { path: string; content: string }): void {
  const blob = new Blob([file.content], { type: 'text/plain' })
  triggerBlobDownload(blob, file.path.split('/').pop() || 'artifact.txt')
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
