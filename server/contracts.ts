import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 4_000
export const MAX_MODEL_TEXT_LENGTH = 8_000
export const TIME_ZONE = 'America/New_York'
export const PROMPT_VERSION = 'acme-1.4'
export const BLOCK_REPLY = 'I can help with questions about ACME Senior Living, tours, or contacting our team.'
export const CLARIFY_REPLY = 'Could you tell me how I can help with ACME Senior Living?'
export const RETRY_REPLY = 'I could not check your message. Please try again.'
export const FALLBACK_REPLY = 'I could not verify a reply. Please try again or call 850-445-8362. Any request already saved is still saved.'
export const GREETING = 'Hi, this is ACME Senior Living. My name is Sophie. I am an AI assistant. This chat is stored for quality review. I can answer questions and save demo requests. No staff are contacted and no material is sent. How may I help you today?'

export const messageSchema = z.object({
  message: z.string().trim().min(1, 'Enter a message.').max(MAX_MESSAGE_LENGTH),
  requestId: z.uuid(),
}).strict()
export const decisionSchema = z.object({
  decision: z.enum(['allow', 'clarify', 'block']),
  reason: z.string().min(1).max(1000),
}).strict()
export const reviewSchema = z.object({
  approved: z.boolean(),
  reasons: z.array(z.string()).min(1).max(12),
}).strict()
const criterionSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()).min(1).max(12),
}).strict()
export const gradeSchema = z.object({
  factualSupport: criterionSchema,
  usefulAnswer: criterionSchema,
  contextUse: criterionSchema,
}).strict()
export const toolCallSchema = z.object({
  name: z.enum(['check_slots', 'prepare_request', 'confirm_request']),
  arguments: z.record(z.string(), z.unknown()),
}).strict()
export const draftSchema = z.object({
  text: z.string().max(MAX_MODEL_TEXT_LENGTH),
  tools: z.array(toolCallSchema).max(1),
}).strict()
export const requestDetailsSchema = z.object({
  kind: z.enum(['tour', 'callback', 'brochure']),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  phone: z.string().regex(/^\+?[\d ()-]{7,25}$/, 'Enter a valid phone number.'),
  slot: z.string().nullable(),
  preferredTime: z.string().trim().max(160).nullable(),
  address: z.string().trim().max(400).nullable(),
}).strict().superRefine((value, context) => {
  const phoneDigits = value.phone.replace(/\D/g, '').length
  if (phoneDigits < 7 || phoneDigits > 15)
    context.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
  if (value.kind === 'tour' && !value.slot)
    context.addIssue({ code: 'custom', message: 'Choose a tour slot.' })
  if (value.kind === 'callback' && !value.preferredTime)
    context.addIssue({ code: 'custom', message: 'Choose a callback time.' })
  if (value.kind === 'brochure' && !value.address)
    context.addIssue({ code: 'custom', message: 'Enter a mailing address.' })
})

export type Decision = z.infer<typeof decisionSchema>
export type Review = z.infer<typeof reviewSchema>
export type Draft = z.infer<typeof draftSchema>
export type RequestDetails = z.infer<typeof requestDetailsSchema>
export interface TranscriptMessage { role: 'user' | 'assistant', content: string }
export interface ToolResult { name: string, ok: boolean, result: unknown }
export interface ModelContext {
  facts: Record<string, unknown>
  messages: TranscriptMessage[]
  now: string
  tools: ToolResult[]
  pending: unknown
}
export interface ModelProvider {
  mode: 'fake' | 'live'
  models: { agent: string, classifier: string, reviewer: string, grader: string }
  reasoning?: { agent: string, classifier: string, reviewer: string, grader: string }
  classify: (context: Pick<ModelContext, 'messages'>) => Promise<unknown>
  draft: (context: ModelContext) => Promise<unknown>
  review: (context: ModelContext, draft: string) => Promise<unknown>
  grade: (input: unknown) => Promise<unknown>
}
