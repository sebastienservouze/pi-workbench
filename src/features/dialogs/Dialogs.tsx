import { useState } from 'react'
import { parseAskUserQuestionRequest, type AskUserQuestionRequest } from '../../../shared/ask-user-question.ts'
import type { JsonObject } from '../../../shared/types.ts'
import { sendPiCommand } from '../../api.ts'
import type { UiDialog } from './dialog-protocol.ts'

/** Présente une question à la fois et conserve les réponses jusqu'à leur envoi groupé à Pi. */
export function AskUserQuestionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = parseQuestionnaire(dialog.request)
  const [selectedOptions, setSelectedOptions] = useState<string[][]>(() => request.questions.map(() => []))
  const [freeText, setFreeText] = useState<string[]>(() => request.questions.map(() => ''))
  const [activeQuestion, setActiveQuestion] = useState(0)
  const question = request.questions[activeQuestion]

  function isAnswered(index: number): boolean {
    return selectedOptions[index].length > 0 || (!request.questions[index].multiSelect && freeText[index].trim().length > 0)
  }

  /** Applique les règles de sélection et avance après un choix unique nouvellement sélectionné. */
  function toggle(questionIndex: number, option: string): void {
    const wasSelected = selectedOptions[questionIndex].includes(option)
    setSelectedOptions((current) => current.map((selected, index) => {
      if (index !== questionIndex) return selected
      if (request.questions[index].multiSelect) return selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option]
      return selected[0] === option ? [] : [option]
    }))
    if (!question.multiSelect && !wasSelected && questionIndex < request.questions.length - 1) setActiveQuestion(questionIndex + 1)
  }

  /** Sérialise la réponse du questionnaire et la transmet à la session en cours. */
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

  return (
    <section aria-labelledby="ask-user-question-title" className="ask-user-question" role="dialog">
      <div className="ask-user-question-heading">
        <span>Pi attend votre réponse</span>
        <strong id="ask-user-question-title">Question {activeQuestion + 1} sur {request.questions.length}</strong>
      </div>
      <nav aria-label="Questions du questionnaire" className="ask-user-question-tabs">
        {request.questions.map((item, index) => <button aria-current={index === activeQuestion ? 'step' : undefined} className={index === activeQuestion ? 'active' : isAnswered(index) ? 'answered' : ''} key={`${item.question}-${index}`} onClick={() => setActiveQuestion(index)} type="button">
          <span>Question {index + 1}</span>
          {isAnswered(index) && <b aria-label="Répondue">✓</b>}
        </button>)}
      </nav>
      <div className="ask-user-question-list">
        <fieldset>
          <legend><span>{question.header}</span>{question.question}</legend>
          <p className="ask-user-question-hint">{question.multiSelect ? 'Plusieurs réponses possibles' : 'Choisissez une réponse ou écrivez la vôtre'}</p>
          <div className="ask-user-options">
            {question.options.map((option) => {
              const selected = selectedOptions[activeQuestion].includes(option.label)
              return <button aria-pressed={selected} className={selected ? 'selected' : ''} key={option.label} onClick={() => toggle(activeQuestion, option.label)} type="button">
                <span aria-hidden="true" className="ask-user-option-mark">{selected ? '✓' : ''}</span>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </button>
            })}
          </div>
          {!question.multiSelect && <textarea aria-label={`Réponse libre : ${question.question}`} onChange={(event) => setFreeText((current) => current.map((text, index) => index === activeQuestion ? event.target.value : text))} placeholder="Ou saisissez votre propre réponse…" rows={2} value={freeText[activeQuestion]} />}
        </fieldset>
      </div>
      <div className="ask-user-question-actions">
        <button onClick={() => void respond(true)} type="button">Annuler</button>
        <div>
          {activeQuestion > 0 && <button onClick={() => setActiveQuestion((index) => index - 1)} type="button">Précédente</button>}
          {lastQuestion ? <button disabled={!complete} onClick={() => void respond(false)} type="button">Envoyer les réponses</button> : <button disabled={!isAnswered(activeQuestion)} onClick={() => setActiveQuestion((index) => index + 1)} type="button">Suivante</button>}
        </div>
      </div>
    </section>
  )
}

function parseQuestionnaire(request: JsonObject): AskUserQuestionRequest {
  const payload = typeof request.prefill === 'string' ? safeJsonParse(request.prefill) : null
  const questionnaire = parseAskUserQuestionRequest(payload)
  if (!questionnaire) throw new Error('Questionnaire Pi invalide')
  return questionnaire
}

function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value) } catch { return null }
}

/** Affiche les demandes d'interface Pi génériques et renvoie l'action choisie par l'utilisateur. */
export function ExtensionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = dialog.request
  const [value, setValue] = useState(typeof request.prefill === 'string' ? request.prefill : '')

  /** Envoie la réponse RPC puis ferme la boîte de dialogue après confirmation du backend. */
  async function respond(fields: JsonObject): Promise<void> {
    try {
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: request.id, ...fields })
      onClose()
    } catch (cause) { onError(cause) }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal" role="dialog">
        <h2>{String(request.title ?? 'Pi demande votre attention')}</h2>
        {typeof request.message === 'string' && <p>{request.message}</p>}
        {request.method === 'select' && Array.isArray(request.options) && <div className="option-list">{request.options.map((option) => <button key={String(option)} onClick={() => void respond({ value: option })} type="button">{String(option)}</button>)}</div>}
        {(request.method === 'input' || request.method === 'editor') && <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} rows={request.method === 'editor' ? 8 : 2} />}
        <div className="modal-actions">
          {request.method === 'confirm' && <><button className="primary" onClick={() => void respond({ confirmed: true })} type="button">Confirmer</button><button onClick={() => void respond({ confirmed: false })} type="button">Refuser</button></>}
          {(request.method === 'input' || request.method === 'editor') && <button className="primary" onClick={() => void respond({ value })} type="button">Valider</button>}
          <button onClick={() => void respond({ cancelled: true })} type="button">Annuler</button>
        </div>
      </section>
    </div>
  )
}
