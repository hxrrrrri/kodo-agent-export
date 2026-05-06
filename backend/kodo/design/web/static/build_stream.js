export function buildStreamRows(events) {
  return (events || []).map((event) => ({
    type: event.type || 'section',
    label: event.label || 'Build step',
    detail: event.detail || '',
    progress: Number(event.progress || 0),
  }));
}
