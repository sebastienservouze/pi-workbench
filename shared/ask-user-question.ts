export const askUserQuestionProtocol = 'pi-workbench.ask-user-question'
export const askUserQuestionVersion = 1

export interface AskUserQuestionOption {
  label: string
  description: string
}

export interface AskUserQuestion {
  question: string
  header: string
  multiSelect: boolean
  options: AskUserQuestionOption[]
}

export interface AskUserQuestionRequest {
  protocol: typeof askUserQuestionProtocol
  version: typeof askUserQuestionVersion
  questions: AskUserQuestion[]
}

export interface AskUserQuestionAnswer {
  question: string
  selectedOptions: string[]
  text?: string
}

export interface AskUserQuestionResponse {
  answers: AskUserQuestionAnswer[]
  cancelled: boolean
}

/** Valide le protocole, les bornes et l'unicité des options avant exposition à l'interface. */
export function parseAskUserQuestionRequest(value: unknown): AskUserQuestionRequest | null {
  if (!isObject(value) || value.protocol !== askUserQuestionProtocol || value.version !== askUserQuestionVersion || !Array.isArray(value.questions)) return null
  if (value.questions.length < 1 || value.questions.length > 4) return null

  const questions = value.questions.map(parseQuestion)
  return questions.every((question): question is AskUserQuestion => question !== null)
    ? { protocol: askUserQuestionProtocol, version: askUserQuestionVersion, questions }
    : null
}

/** Vérifie qu'une réponse respecte exactement les questions et les choix autorisés par la requête. */
export function parseAskUserQuestionResponse(value: unknown, request: AskUserQuestionRequest): AskUserQuestionResponse | null {
  if (!isObject(value) || typeof value.cancelled !== 'boolean' || !Array.isArray(value.answers)) return null
  if (value.cancelled) return value.answers.length === 0 ? { answers: [], cancelled: true } : null
  if (value.answers.length !== request.questions.length) return null

  const answers = value.answers.map((answer, index) => parseAnswer(answer, request.questions[index]))
  return answers.every((answer): answer is AskUserQuestionAnswer => answer !== null)
    ? { answers, cancelled: false }
    : null
}

function parseQuestion(value: unknown): AskUserQuestion | null {
  if (!isObject(value) || typeof value.question !== 'string' || typeof value.header !== 'string' || typeof value.multiSelect !== 'boolean' || !Array.isArray(value.options)) return null
  if (!value.question.trim() || !value.header.trim() || value.options.length < 2 || value.options.length > 4) return null
  const options = value.options.map(parseOption)
  if (!options.every((option): option is AskUserQuestionOption => option !== null)) return null
  if (new Set(options.map((option) => option.label)).size !== options.length) return null
  return { question: value.question, header: value.header, multiSelect: value.multiSelect, options }
}

function parseOption(value: unknown): AskUserQuestionOption | null {
  if (!isObject(value) || typeof value.label !== 'string' || typeof value.description !== 'string') return null
  return value.label.trim() && value.description.trim() ? { label: value.label, description: value.description } : null
}

function parseAnswer(value: unknown, question: AskUserQuestion): AskUserQuestionAnswer | null {
  if (!isObject(value) || typeof value.question !== 'string' || value.question !== question.question || !Array.isArray(value.selectedOptions) || !value.selectedOptions.every((option): option is string => typeof option === 'string')) return null
  if (typeof value.text !== 'undefined' && typeof value.text !== 'string') return null
  if (new Set(value.selectedOptions).size !== value.selectedOptions.length) return null
  if (!question.multiSelect && value.selectedOptions.length > 1) return null
  if (!value.selectedOptions.every((option) => question.options.some(({ label }) => label === option))) return null
  if (value.selectedOptions.length === 0 && !value.text?.trim()) return null
  return { question: value.question, selectedOptions: value.selectedOptions, ...(value.text?.trim() ? { text: value.text } : {}) }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
