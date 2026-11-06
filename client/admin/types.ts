export type Variant = 'baseline' | 'single' | 'specialists'
export interface Settings {
  variant: Variant
  mode: 'fake' | 'live'
  models: { agent: string, classifier: string, reviewer: string, grader: string }
  reasoning?: { agent: string, classifier: string, reviewer: string, grader: string }
}
export interface Verdict { passed?: boolean, approved?: boolean, reasons: string[] }
export interface Audit {
  variant?: Variant
  mode?: string
  models?: Settings['models']
  reasoning?: Settings['reasoning']
  classification?: { decision: string, reason: string }
  classificationSource?: 'code' | 'model'
  review?: Verdict
  draft?: string
  repairDraft?: string
  repairReview?: Verdict
  durationMs?: number
  error?: string
  promptVersion?: string
  tools?: Array<{ name: string, ok: boolean, result: unknown }>
}
export interface Turn { id: string, input: string, reply: string | null, decision: string | null, audit: string, created_at: string }
export interface Conversation { id: string, created_at: string, turn_count: number, first_message?: string }
export interface Evaluation {
  caseId?: string
  category?: string
  batchId?: string
  id: string
  createdAt: string
  title: string
  variant: Variant
  turnCount: number
  status: string
  mode: string
  durationMs: number
  models: Settings['models']
  modelGrade?: Record<string, Verdict>
  codeChecks: Record<string, boolean>
}
export interface EvaluationDetail extends Evaluation {
  grading?: { version: string, advisories?: Array<{ requirementId: string, turn: number, quote: string, reason: string }> }
  input: { variant: Variant, messages: string[], expectations: string }
  expectations: string
  graderError?: string
  facts: unknown
  transcript: Array<{ user: string, assistant: string, audit: Audit }>
  requests: unknown[]
}
export interface SavedRequest { id: string, conversation_id: string, kind: string, details: string, slot: string | null, created_at: string }
