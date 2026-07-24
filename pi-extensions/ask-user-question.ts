import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
const askUserQuestionProtocol = 'pi-livecraft.ask-user-question'
const askUserQuestionVersion = 1
const rpcTitle = 'Pi Livecraft questionnaire'

type AskUserQuestionOption = { label: string; description: string }
type AskUserQuestion = { question: string; header: string; multiSelect: boolean; options: AskUserQuestionOption[] }
type AskUserQuestionRequest = { protocol: typeof askUserQuestionProtocol; version: typeof askUserQuestionVersion; questions: AskUserQuestion[] }
type AskUserQuestionAnswer = { question: string; selectedOptions: string[]; text?: string }
type AskUserQuestionResponse = { answers: AskUserQuestionAnswer[]; cancelled: boolean }

function parseAskUserQuestionRequest(value: unknown): AskUserQuestionRequest | null {
  if (!isObject(value) || value.protocol !== askUserQuestionProtocol || value.version !== askUserQuestionVersion || !Array.isArray(value.questions)) return null
  if (value.questions.length < 1 || value.questions.length > 4) return null
  const questions = value.questions.map((question) => {
    if (!isObject(question) || typeof question.question !== 'string' || typeof question.header !== 'string' || typeof question.multiSelect !== 'boolean' || !Array.isArray(question.options)) return null
    if (!question.question.trim() || !question.header.trim() || question.options.length < 2 || question.options.length > 4) return null
    const options = question.options.map((option) => isObject(option) && typeof option.label === 'string' && option.label.trim() && typeof option.description === 'string' && option.description.trim() ? { label: option.label, description: option.description } : null)
    return options.every((option): option is AskUserQuestionOption => option !== null) && new Set(options.map((option) => option.label)).size === options.length
      ? { question: question.question, header: question.header, multiSelect: question.multiSelect, options }
      : null
  })
  return questions.every((question): question is AskUserQuestion => question !== null) ? { protocol: askUserQuestionProtocol, version: askUserQuestionVersion, questions } : null
}

function parseAskUserQuestionResponse(value: unknown, request: AskUserQuestionRequest): AskUserQuestionResponse | null {
  if (!isObject(value) || typeof value.cancelled !== 'boolean' || !Array.isArray(value.answers)) return null
  if (value.cancelled) return value.answers.length === 0 ? { answers: [], cancelled: true } : null
  if (value.answers.length !== request.questions.length) return null
  const answers = value.answers.map((answer, index) => {
    const question = request.questions[index]
    if (!isObject(answer) || answer.question !== question.question || !Array.isArray(answer.selectedOptions) || !answer.selectedOptions.every((option): option is string => typeof option === 'string')) return null
    if (typeof answer.text !== 'undefined' && typeof answer.text !== 'string') return null
    if (new Set(answer.selectedOptions).size !== answer.selectedOptions.length || (!question.multiSelect && answer.selectedOptions.length > 1)) return null
    if (!answer.selectedOptions.every((option) => question.options.some(({ label }) => label === option))) return null
    if (answer.selectedOptions.length === 0 && !answer.text?.trim()) return null
    return { question: question.question, selectedOptions: answer.selectedOptions, ...(answer.text?.trim() ? { text: answer.text } : {}) }
  })
  return answers.every((answer): answer is AskUserQuestionAnswer => answer !== null) ? { answers, cancelled: false } : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function registerAskUserQuestion(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'ask_user_question',
    label: 'Ask User Question',
    description: 'Ask the user one or more structured questions when a decision is needed to proceed.',
    promptSnippet: 'Ask the user up to 4 structured questions when requirements need a decision.',
    promptGuidelines: [
      'Use ask_user_question for decisions that need user input; group related questions in one call.',
      'Use 2 to 4 concise options per question. Put a recommended option first and append "(Recommended)" to its label.',
      'Set multiSelect when more than one option may be chosen. Do not create "Other" or "Chat about this" options.',
    ],
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        question: Type.String(),
        header: Type.String(),
        multiSelect: Type.Optional(Type.Boolean()),
        options: Type.Array(Type.Object({
          label: Type.String(),
          description: Type.String(),
        })),
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = parseAskUserQuestionRequest({
        protocol: askUserQuestionProtocol,
        version: askUserQuestionVersion,
        questions: Array.isArray(params.questions)
          ? params.questions.map((question) => ({ ...question, multiSelect: question.multiSelect ?? false }))
          : [],
      })
      if (!request) return result({ answers: [], cancelled: true }, 'The questionnaire was invalid.')

      const response = ctx.mode === 'tui' ? await askInTui(request, ctx) : await askInWorkbench(request, ctx)
      return result(response, response.cancelled ? 'The user cancelled the questionnaire.' : formatAnswers(response.answers))
    },
  })
}

async function askInWorkbench(request: AskUserQuestionRequest, ctx: ExtensionContext) {
  const value = await ctx.ui.editor(rpcTitle, JSON.stringify(request))
  if (!value) return { answers: [], cancelled: true }
  try {
    return parseAskUserQuestionResponse(JSON.parse(value), request) ?? { answers: [], cancelled: true }
  } catch {
    return { answers: [], cancelled: true }
  }
}

async function askInTui(request: AskUserQuestionRequest, ctx: ExtensionContext) {
  const answers: AskUserQuestionAnswer[] = []
  for (const question of request.questions) {
    const answer = question.multiSelect ? await selectMany(question, ctx) : await selectOne(question, ctx)
    if (!answer) return { answers: [], cancelled: true }
    answers.push(answer)
  }
  return { answers, cancelled: false }
}

async function selectOne(question: AskUserQuestion, ctx: ExtensionContext): Promise<AskUserQuestionAnswer | null> {
  const custom = 'Type something…'
  const chat = 'Chat about this'
  const options = [...question.options.map(formatOption), custom, chat]
  const selection = await ctx.ui.select(`${question.header}\n${question.question}`, options)
  if (!selection) return null
  if (selection === custom || selection === chat) {
    const text = await ctx.ui.input(question.question, selection === chat ? 'Your message' : 'Your answer')
    return text?.trim() ? { question: question.question, selectedOptions: [], text } : null
  }
  const option = question.options.find((candidate) => formatOption(candidate) === selection)
  return option ? { question: question.question, selectedOptions: [option.label] } : null
}

async function selectMany(question: AskUserQuestion, ctx: ExtensionContext): Promise<AskUserQuestionAnswer | null> {
  const done = 'Submit selection'
  const selected = new Set<string>()
  while (true) {
    const options = question.options.map((option) => `${selected.has(option.label) ? '✓ ' : ''}${formatOption(option)}`)
    const choice = await ctx.ui.select(`${question.header}\n${question.question}`, [...options, done])
    if (!choice) return null
    if (choice === done) return selected.size ? { question: question.question, selectedOptions: [...selected] } : null
    const option = question.options.find((candidate) => choice.endsWith(formatOption(candidate)))
    if (!option) return null
    if (selected.has(option.label)) selected.delete(option.label)
    else selected.add(option.label)
  }
}

function formatOption(option: AskUserQuestion['options'][number]): string {
  return `${option.label} — ${option.description}`
}

function formatAnswers(answers: AskUserQuestionAnswer[]): string {
  return answers.map((answer) => `${answer.question}: ${[...answer.selectedOptions, answer.text].filter(Boolean).join(', ')}`).join('\n')
}

function result(details: { answers: AskUserQuestionAnswer[]; cancelled: boolean }, text: string) {
  return { content: [{ type: 'text' as const, text }], details }
}
