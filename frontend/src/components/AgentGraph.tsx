type AgentNodeStatus = 'running' | 'done' | 'error' | 'queued'

type AgentNodeType = 'session' | 'task' | 'agent'

export interface AgentNode {
  id: string
  type: AgentNodeType
  label: string
  status: AgentNodeStatus
  parentId?: string
}

interface AgentGraphProps {
  nodes: AgentNode[]
  variant?: 'panel' | 'modal'
}

function statusColor(status: AgentNodeStatus): string {
  switch (status) {
    case 'running':
      return 'var(--accent)'
    case 'done':
      return 'var(--green)'
    case 'error':
      return 'var(--red)'
    default:
      return 'var(--text-2)'
  }
}

function statusLabel(status: AgentNodeStatus): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
    default:
      return 'Queued'
  }
}

function typeLabel(type: AgentNodeType): string {
  switch (type) {
    case 'session':
      return 'Session'
    case 'task':
      return 'Task'
    default:
      return 'Agent'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function truncateLabel(label: string, max = 26): string {
  const text = (label || '').trim()
  if (text.length <= max) return text || 'untitled'
  return `${text.slice(0, max - 1)}…`
}

export function AgentGraph({ nodes, variant = 'panel' }: AgentGraphProps) {
  const isModal = variant === 'modal'

  if (!nodes || nodes.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--border-bright)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          color: 'var(--text-2)',
          fontSize: isModal ? 12 : 11,
          fontFamily: 'var(--font-mono)',
        }}
      >
        No active tasks or agents. Start an agent run to populate the graph.
      </div>
    )
  }

  const root = nodes.find((n) => n.type === 'session') || nodes[0]
  const tasks = nodes.filter((n) => n.type === 'task')
  const agents = nodes.filter((n) => n.type === 'agent')

  const sessionWidth = isModal ? 250 : 206
  const taskWidth = isModal ? 220 : 184
  const agentWidth = isModal ? 205 : 170
  const taskGap = isModal ? 30 : 24
  const agentGap = isModal ? 28 : 22
  const nodeHeight = isModal ? 46 : 40
  const minWidth = isModal ? 940 : 600
  const minHeight = isModal ? 470 : 380
  const rowGap = isModal ? 78 : 62
  const perRow = isModal ? 3 : 2
  const marginX = isModal ? 86 : 56
  const taskY = isModal ? 190 : 158
  const agentBaseY = isModal ? 322 : 270

  const maxChildrenPerTask = tasks.reduce((acc, task) => {
    const count = agents.filter((agent) => agent.parentId === task.id).length
    return Math.max(acc, count)
  }, 0)
  const orphanCount = agents.filter((agent) => !agent.parentId || !tasks.some((task) => task.id === agent.parentId)).length

  const taskRowWidth = tasks.length > 0
    ? tasks.length * taskWidth + Math.max(0, tasks.length - 1) * taskGap
    : 0
  const maxAgentColumns = Math.max(1, Math.min(perRow, maxChildrenPerTask, orphanCount || perRow))
  const agentRowWidth = maxAgentColumns * agentWidth + Math.max(0, maxAgentColumns - 1) * agentGap

  const width = Math.ceil(Math.max(
    minWidth,
    taskRowWidth > 0 ? marginX * 2 + taskRowWidth : 0,
    agents.length > 0 ? marginX * 2 + agentRowWidth : 0,
  ))

  const positions = new Map<string, { x: number; y: number }>()
  positions.set(root.id, { x: width / 2, y: isModal ? 72 : 62 })

  if (tasks.length > 0) {
    const rowWidth = tasks.length * taskWidth + Math.max(0, tasks.length - 1) * taskGap
    const rowStart = (width - rowWidth) * 0.5
    tasks.forEach((task, idx) => {
      positions.set(task.id, {
        x: rowStart + taskWidth * 0.5 + idx * (taskWidth + taskGap),
        y: taskY,
      })
    })
  }

  let maxRowIndex = 0
  const unparentedAgents: AgentNode[] = []

  tasks.forEach((task) => {
    const children = agents.filter((agent) => agent.parentId === task.id)
    if (children.length === 0) return

    const parentPos = positions.get(task.id) || { x: width / 2, y: taskY }

    children.forEach((agent, childIdx) => {
      const row = Math.floor(childIdx / perRow)
      const indexInRow = childIdx % perRow
      const itemsInRow = Math.min(perRow, children.length - row * perRow)
      const rowWidth = itemsInRow * agentWidth + Math.max(0, itemsInRow - 1) * agentGap
      const rowStart = clamp(parentPos.x - rowWidth * 0.5, marginX, width - marginX - rowWidth)
      const x = rowStart + indexInRow * (agentWidth + agentGap) + agentWidth * 0.5
      const y = agentBaseY + row * rowGap
      maxRowIndex = Math.max(maxRowIndex, row)

      positions.set(agent.id, { x, y })
    })
  })

  agents.forEach((agent) => {
    if (positions.has(agent.id)) return
    unparentedAgents.push(agent)
  })

  if (unparentedAgents.length > 0) {
    const baseRow = tasks.length > 0 ? maxRowIndex + 1 : 0

    unparentedAgents.forEach((agent, idx) => {
      const row = Math.floor(idx / perRow)
      const indexInRow = idx % perRow
      const itemsInRow = Math.min(perRow, unparentedAgents.length - row * perRow)
      const rowWidth = itemsInRow * agentWidth + Math.max(0, itemsInRow - 1) * agentGap
      const rowStart = (width - rowWidth) * 0.5

      positions.set(agent.id, {
        x: rowStart + indexInRow * (agentWidth + agentGap) + agentWidth * 0.5,
        y: (tasks.length > 0 ? agentBaseY : taskY) + (baseRow + row) * rowGap,
      })

      maxRowIndex = Math.max(maxRowIndex, baseRow + row)
    })
  }

  const maxNodeY = Array.from(positions.values()).reduce((acc, pos) => Math.max(acc, pos.y), taskY)
  const height = Math.max(minHeight, maxNodeY + nodeHeight * 0.5 + 78)

  const lines = nodes
    .filter((node) => node.parentId && positions.has(node.id) && positions.has(node.parentId))
    .map((node) => {
      const from = positions.get(node.parentId!)!
      const to = positions.get(node.id)!
      return { id: `${node.parentId}-${node.id}`, from, to, status: node.status }
    })

  const nodeWidthByType: Record<AgentNodeType, number> = {
    session: sessionWidth,
    task: taskWidth,
    agent: agentWidth,
  }

  const fontSize = isModal ? 12 : 11

  const legend = [
    { key: 'running', label: statusLabel('running'), color: statusColor('running') },
    { key: 'done', label: statusLabel('done'), color: statusColor('done') },
    { key: 'queued', label: statusLabel('queued'), color: statusColor('queued') },
    { key: 'error', label: statusLabel('error'), color: statusColor('error') },
  ]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-2)', padding: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: isModal ? 13 : 12, color: 'var(--text-0)' }}>Flow: Session → Tasks → Agents</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {legend.map((item) => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: item.color, display: 'inline-block' }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'color-mix(in srgb, var(--bg-1) 90%, #000 10%)',
          padding: isModal ? 14 : 10,
          maxHeight: isModal ? '70vh' : 330,
        }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {lines.map((line) => (
          <line
            key={line.id}
            x1={line.from.x}
            y1={line.from.y + nodeHeight * 0.5}
            x2={line.to.x}
            y2={line.to.y - nodeHeight * 0.5}
            stroke={statusColor(line.status)}
            strokeWidth={1.6}
            opacity={0.7}
          />
        ))}

        {nodes.map((node) => {
          const pos = positions.get(node.id)
          if (!pos) return null
          const color = statusColor(node.status)
          const nodeWidth = nodeWidthByType[node.type]
          const label = `${typeLabel(node.type)} • ${truncateLabel(node.label, isModal ? 34 : 26)}`

          return (
            <g key={node.id}>
              <rect
                x={pos.x - nodeWidth * 0.5}
                y={pos.y - nodeHeight * 0.5}
                width={nodeWidth}
                height={nodeHeight}
                rx={7}
                fill="var(--bg-1)"
                stroke={color}
                strokeWidth={1.6}
              />
              <text
                x={pos.x}
                y={pos.y + 4}
                fill="var(--text-0)"
                fontSize={fontSize}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {label}
              </text>
              <text
                x={pos.x}
                y={pos.y - nodeHeight * 0.5 - 8}
                fill={color}
                fontSize={10}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {statusLabel(node.status)}
              </text>
            </g>
          )
        })}
        </svg>
      </div>
    </div>
  )
}
