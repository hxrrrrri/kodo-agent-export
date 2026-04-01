import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, Square, FolderOpen, Zap } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'

const EXAMPLE_PROMPTS = [
  'List all Python files in the current directory',
  'Read the contents of README.md',
  'Run the tests and show me the results',
  'Find all TODO comments in this codebase',
  'What is my current git status?',
  'Fetch the latest FastAPI docs from fastapi.tiangolo.com',
]

export function ChatWindow() {
  const { messages, isLoading, error, sendMessage, stopGeneration, projectDir, setProjectDir } = useChat()
  const [input, setInput] = useState('')
  const [showProjectInput, setShowProjectInput] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const msg = input.trim()
    if (!msg || isLoading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    sendMessage(msg)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg-0)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} color="var(--accent)" />
          <span style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.05em' }}>
            {isLoading ? (
              <span style={{ color: 'var(--yellow)' }}>● AGENT RUNNING</span>
            ) : (
              <span style={{ color: 'var(--green)' }}>● READY</span>
            )}
          </span>
        </div>

        <button
          onClick={() => setShowProjectInput(!showProjectInput)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <FolderOpen size={12} />
          {projectDir ? projectDir.split('/').pop() : 'SET PROJECT DIR'}
        </button>

        {/* GitHub Button */}
        <a
          href="https://github.com/hxrrrrri"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-bright)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 98 96"
            fill="currentColor"
          >
            <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 
            2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 
            4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 
            1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 
            5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 
            46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 
            13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 
            0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 
            11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 
            33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
          </svg>
          GITHUB
        </a>
      </div>

      {/* Project dir input */}
      {showProjectInput && (
        <div style={{
          padding: '8px 24px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="/path/to/your/project"
            value={projectDir}
            onChange={e => setProjectDir(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-0)',
              border: '1px solid var(--border)',
              color: 'var(--text-0)',
              padding: '6px 10px',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <button
            onClick={() => setShowProjectInput(false)}
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#0a0a0b',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            SET
          </button>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
      }}>
        {isEmpty && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{
              width: 64, height: 64,
              background: 'var(--accent)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
              fontSize: 28,
            }}>
              ⚡
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-1px',
              marginBottom: 8,
            }}>
              KŌDO AGENT
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 32 }}>
              Autonomous. Capable. Yours.
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              maxWidth: 540,
              width: '100%',
            }}>
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-0)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-1)'
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div style={{
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--red)',
            marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 24px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '8px 8px 8px 14px',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask KŌDO anything... (Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-0)',
              fontSize: 14,
              fontFamily: 'var(--font-mono)',
              resize: 'none',
              lineHeight: 1.6,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          />
          <button
            onClick={isLoading ? stopGeneration : handleSend}
            disabled={!isLoading && !input.trim()}
            style={{
              background: isLoading ? 'var(--red-dim)' : input.trim() ? 'var(--accent)' : 'var(--bg-3)',
              border: isLoading ? '1px solid var(--red)' : 'none',
              color: isLoading ? 'var(--red)' : input.trim() ? '#0a0a0b' : 'var(--text-2)',
              width: 36, height: 36,
              borderRadius: 'var(--radius)',
              cursor: (!isLoading && !input.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {isLoading ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 6, textAlign: 'center' }}>
          ENTER to send · SHIFT+ENTER for newline · KŌDO can read & write files, run commands, search the web
        </div>
      </div>
    </div>
  )
}
