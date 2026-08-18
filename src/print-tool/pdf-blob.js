export async function asPdfBlob (raw) {
  const file = raw instanceof Blob ? raw : new Blob([raw])
  if (!file.size) throw new Error('empty pdf')
  const head = await file.slice(0, 256).text()
  const trimmed = String(head || '').replace(/^\uFEFF/, '').trimStart()
  if (trimmed.startsWith('{') || file.type.includes('application/json')) {
    const text = await file.text()
    let msg = text
    try {
      const j = JSON.parse(text)
      msg = j.message || j.detail || j.error || text
    } catch { /* keep */ }
    throw new Error(msg || 'pdf request failed')
  }
  if (trimmed.startsWith('<')) {
    throw new Error('preview is not a PDF')
  }
  if (!trimmed.startsWith('%PDF')) {
    throw new Error(trimmed.slice(0, 120) || 'preview is not a PDF')
  }
  return file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' })
}
