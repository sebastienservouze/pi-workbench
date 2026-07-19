import assert from 'node:assert/strict'
import test from 'node:test'
import { askUserQuestionProtocol, askUserQuestionVersion, parseAskUserQuestionRequest, parseAskUserQuestionResponse } from '../shared/ask-user-question.ts'

const request = parseAskUserQuestionRequest({
  protocol: askUserQuestionProtocol,
  version: askUserQuestionVersion,
  questions: [{
    header: 'Approche',
    question: 'Quel comportement souhaitez-vous ?',
    multiSelect: false,
    options: [
      { label: 'Simple', description: 'Le plus petit changement.' },
      { label: 'Complet', description: 'Toutes les options.' },
    ],
  }],
})

test('valide le contrat de questionnaire RPC', () => {
  assert.ok(request)
  assert.deepEqual(
    parseAskUserQuestionResponse({
      cancelled: false,
      answers: [{ question: request.questions[0].question, selectedOptions: ['Simple'] }],
    }, request),
    { cancelled: false, answers: [{ question: request.questions[0].question, selectedOptions: ['Simple'] }] },
  )
  assert.equal(
    parseAskUserQuestionResponse({
      cancelled: false,
      answers: [{ question: request.questions[0].question, selectedOptions: ['Inconnu'] }],
    }, request),
    null,
  )
})
