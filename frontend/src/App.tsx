import { Sidebar } from './components/Sidebar'
import { ChatWindow } from './components/ChatWindow'

export default function App() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-0)',
    }}>
      <Sidebar />
      <ChatWindow />
    </div>
  )
}
