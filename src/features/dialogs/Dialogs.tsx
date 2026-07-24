import { useState } from 'react'
import { parseAskUserQuestionRequest, type AskUserQuestionRequest } from '../../../shared/ask-user-question.ts'
import type { JsonObject } from '../../../shared/types.ts'
import { sendPiCommand } from '../../api.ts'
import type { UiDialog } from './dialog-protocol.ts'
import ReactMarkdown from 'react-markdown'

/** Strips Markdown syntax from a string while preserving visible text. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/(\*{1,3}|_{1,3})([\s\S]*?)\1/g, '$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .trim()
}

/** Presents one question at a time and keeps responses until batch-sent to Pi. */
export function AskUserQuestionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = parseQuestionnaire(dialog.request)
  const [selectedOptions, setSelectedOptions] = useState<string[][]>(() => request.questions.map(() => []))
  const [freeText, setFreeText] = useState<string[]>(() => request.questions.map(() => ''))
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const question = request.questions[activeQuestion]

  const cleanHeader = stripMarkdown(question.header)
  const cleanQuestion = stripMarkdown(question.question)

  function isAnswered(index: number): boolean {
    return selectedOptions[index].length > 0 || (!request.questions[index].multiSelect && freeText[index].trim().length > 0)
  }

  /** Applies selection rules and advances after a newly selected single choice. */
  function toggle(questionIndex: number, option: string): void {
    const wasSelected = selectedOptions[questionIndex].includes(option)
    setSelectedOptions((current) => current.map((selected, index) => {
      if (index !== questionIndex) return selected
      if (request.questions[index].multiSelect) return selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option]
      return selected[0] === option ? [] : [option]
    }))
    if (!question.multiSelect && !wasSelected && questionIndex < request.questions.length - 1) setActiveQuestion(questionIndex + 1)
  }

  /** Serializes the questionnaire response and sends it to the current session. */
  async function respond(cancelled: boolean): Promise<void> {
    try {
      const value = cancelled
        ? { answers: [], cancelled: true }
        : {
            cancelled: false,
            answers: request.questions.map((item, index) => ({
              question: item.question,
              selectedOptions: selectedOptions[index],
              ...(freeText[index].trim() ? { text: freeText[index] } : {}),
            })),
          }
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: dialog.request.id, value: JSON.stringify(value) })
      onClose()
    } catch (cause) { onError(cause) }
  }

  const complete = request.questions.every((_, index) => isAnswered(index))
  const lastQuestion = activeQuestion === request.questions.length - 1

  if (minimized) {
    return (
      <button className="ask-user-question-minimized" onClick={() => setMinimized(false)} type="button">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M6 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>Question {activeQuestion + 1} of {request.questions.length}</span>
        <span>·</span>
        <span>Show</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    )
  }

  return (
    <div className="ask-user-question-backdrop" onClick={() => setMinimized(true)}>
      <section aria-labelledby="ask-user-question-title" className="ask-user-question" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ask-user-question-heading">
          <div className="ask-user-question-heading-row">
            <div>
              <span>Pi is waiting for your response</span>
              <strong id="ask-user-question-title">Question {activeQuestion + 1} sur {request.questions.length}</strong>
            </div>
            <button className="ask-user-question-minimize" onClick={() => setMinimized(true)} aria-label="Hide question" type="button">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <nav aria-label="Questionnaire questions" className="ask-user-question-tabs">
          {request.questions.map((item, index) => <button aria-current={index === activeQuestion ? 'step' : undefined} className={index === activeQuestion ? 'active' : isAnswered(index) ? 'answered' : ''} key={`${item.question}-${index}`} onClick={() => setActiveQuestion(index)} type="button">
            <span>Question {index + 1}</span>
            {isAnswered(index) && <b aria-label="Answered">✓</b>}
          </button>)}
        </nav>
        <div className="ask-user-question-list">
          <fieldset>
            <legend><span>{cleanHeader}</span>{cleanQuestion}</legend>
            <p className="ask-user-question-hint">{question.multiSelect ? 'Multiple answers possible' : 'Choose an answer or write your own'}</p>
            <div className="ask-user-options">
              {question.options.map((option) => {
                const selected = selectedOptions[activeQuestion].includes(option.label)
                return <button aria-pressed={selected} className={selected ? 'selected' : ''} key={option.label} onClick={() => toggle(activeQuestion, option.label)} type="button">
                  <span aria-hidden="true" className="ask-user-option-mark">{selected ? '✓' : ''}</span>
                  <span><strong>{option.label}</strong><small><ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{option.description}</ReactMarkdown></small></span>
                </button>
              })}
            </div>
            {!question.multiSelect && <textarea aria-label={`Free response: ${cleanQuestion}`} onChange={(event) => setFreeText((current) => current.map((text, index) => index === activeQuestion ? event.target.value : text))} placeholder="Or type your own answer…" rows={2} value={freeText[activeQuestion]} />}
          </fieldset>
        </div>
        <div className="ask-user-question-actions">
          <button onClick={() => void respond(true)} type="button">Cancel</button>
          <div>
            {activeQuestion > 0 && <button onClick={() => setActiveQuestion((index) => index - 1)} type="button">Previous</button>}
            {lastQuestion ? <button disabled={!complete} onClick={() => void respond(false)} type="button">Submit answers</button> : <button disabled={!isAnswered(activeQuestion)} onClick={() => setActiveQuestion((index) => index + 1)} type="button">Next</button>}
          </div>
        </div>
      </section>
    </div>
  )
}

function parseQuestionnaire(request: JsonObject): AskUserQuestionRequest {
  const payload = typeof request.prefill === 'string' ? safeJsonParse(request.prefill) : null
  const questionnaire = parseAskUserQuestionRequest(payload)
  if (!questionnaire) throw new Error('Invalid Pi questionnaire')
  return questionnaire
}

function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value) } catch { return null }
}

/** Displays generic Pi interface requests and returns the action chosen by the user. */
export function ExtensionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = dialog.request
  const [value, setValue] = useState(typeof request.prefill === 'string' ? request.prefill : '')

  /** Sends the RPC response then closes the dialog after backend confirmation. */
  async function respond(fields: JsonObject): Promise<void> {
    try {
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: request.id, ...fields })
      onClose()
    } catch (cause) { onError(cause) }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal" role="dialog">
        <h2>{String(request.title ?? 'Pi needs your attention')}</h2>
        {typeof request.message === 'string' && <p>{request.message}</p>}
        {request.method === 'select' && Array.isArray(request.options) && <div className="option-list">{request.options.map((option) => <button key={String(option)} onClick={() => void respond({ value: option })} type="button">{String(option)}</button>)}</div>}
        {(request.method === 'input' || request.method === 'editor') && <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} rows={request.method === 'editor' ? 8 : 2} />}
        <div className="modal-actions">
          {request.method === 'confirm' && <><button className="primary" onClick={() => void respond({ confirmed: true })} type="button">Confirm</button><button onClick={() => void respond({ confirmed: false })} type="button">Decline</button></>}
          {(request.method === 'input' || request.method === 'editor') && <button className="primary" onClick={() => void respond({ value })} type="button">Submit</button>}
          <button onClick={() => void respond({ cancelled: true })} type="button">Cancel</button>
        </div>
      </section>
    </div>
  )
}
