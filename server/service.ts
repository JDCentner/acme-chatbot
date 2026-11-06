import type { ModelContext, ModelProvider, ToolResult } from './contracts.ts'
import type { Variant } from './models.ts'
import type { Store } from './store.ts'
import { z } from 'zod'
import { Actions, isConfirmation } from './actions.ts'
import { BLOCK_REPLY, CLARIFY_REPLY, decisionSchema, DEMO_CAPABILITIES, draftSchema, FALLBACK_REPLY, MAX_MODEL_TEXT_LENGTH, messageSchema, PROMPT_VERSION, RETRY_REPLY, reviewSchema } from './contracts.ts'
import { bounded, LiveProvider } from './models.ts'
import { localNow } from './time.ts'

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}
const MAX_TOOL_ROUNDS = 4
export class ConversationService {
  private readonly busy = new Set<string>()
  constructor(readonly store: Store, readonly provider: ModelProvider) {}

  async submit(conversationId: string, body: unknown, variant: Variant = 'single'): Promise<unknown> {
    if (!z.uuid().safeParse(conversationId).success || !this.store.hasConversation(conversationId))
      throw new HttpError(404, 'Conversation not found. Start a new chat.')
    const parsed = messageSchema.safeParse(body)
    if (!parsed.success)
      throw new HttpError(400, 'Send a message of 1 to 4,000 characters and a valid requestId.')
    const previous = this.store.findTurn(conversationId, parsed.data.requestId)
    if (previous?.input !== undefined && previous.input !== parsed.data.message)
      throw new HttpError(409, 'This requestId was already used for another message.')
    if (previous?.reply)
      return { reply: previous.reply, replay: true }
    if (this.busy.has(conversationId))
      throw new HttpError(409, 'A reply is still being checked. Please wait.')
    this.busy.add(conversationId)
    try {
      return await this.process(conversationId, parsed.data, variant)
    }
    finally {
      this.busy.delete(conversationId)
    }
  }

  private async process(conversationId: string, input: { message: string, requestId: string }, variant: Variant): Promise<unknown> {
    const started = performance.now()
    const id = this.store.startTurn({ ...input, conversationId })
    const tools: ToolResult[] = []
    const audit: Record<string, unknown> = {
      mode: this.provider.mode,
      models: this.provider.models,
      reasoning: this.provider.reasoning,
      promptVersion: PROMPT_VERSION,
      variant,
      tools,
      facts: this.store.facts(),
    }
    const context: ModelContext = {
      facts: this.store.facts(),
      now: localNow(this.store.clock).toISO()!,
      messages: [
        ...this.store.context(conversationId),
        { role: 'user', content: input.message },
      ],
      tools,
      pending: this.store.pending(conversationId) || null,
      requestState: this.store.requestState(conversationId),
      capabilities: DEMO_CAPABILITIES,
    }
    let decision: string | null = null
    const finish = (reply: string, pendingId?: string) => {
      audit.durationMs = Math.round(performance.now() - started)
      this.store.finishTurn({ id, decision, reply, audit })
      return { reply, pendingId, mode: this.provider.mode }
    }
    try {
      if (variant !== 'baseline') {
        const hasPreviousUserTurn = context.messages.slice(0, -1).some(message => message.role === 'user')
        const isContextualConfirmation = hasPreviousUserTurn && isConfirmation(input.message, this.store.pending(conversationId)?.id)
        const classification = isContextualConfirmation
          ? { decision: 'allow', reason: 'A short confirmation refers to the preceding community conversation. Action rules still validate the request.' }
          : decisionSchema.parse(await bounded(this.provider.classify({ messages: context.messages })))
        audit.classificationSource = isContextualConfirmation ? 'code' : 'model'
        audit.classification = classification
        decision = classification.decision
        if (decision === 'block')
          return finish(BLOCK_REPLY)
        if (decision === 'clarify')
          return finish(CLARIFY_REPLY)
      }
      decision = 'allow'
      this.store.database.prepare('UPDATE turns SET decision=? WHERE id=?').run(decision, id)
      const pending = this.store.pending(conversationId)
      const confirmed = pending && isConfirmation(input.message, pending.id)
      if (!confirmed)
        this.store.invalidatePending(conversationId)
      context.pending = this.store.pending(conversationId) || null
      const actions = new Actions(this.store)
      const execute = (name: string, args: unknown) => {
        const result = actions.execute({
          conversationId,
          message: input.message,
          name,
          arguments: args,
        })
        tools.push(result)
        context.pending = this.store.pending(conversationId) || null
        context.requestState = this.store.requestState(conversationId)
        this.store.checkpoint(id, audit)
        return result
      }
      if (confirmed)
        execute('confirm_request', { pendingId: pending.id })
      let draft: string
      if (this.provider instanceof LiveProvider) {
        const result = await this.provider.respond({ variant, context, execute })
        draft = result.text
        audit.usage = result.usage
        audit.trace = result.trace
      }
      else {
        draft = await this.fixtureDraft(context, execute)
      }
      const prepared = this.store.pending(conversationId)
      if (prepared && !prepared.presented)
        draft = `${draft}\n\n${prepared.summary}`.trim()
      audit.draft = draft
      if (!draft)
        throw new Error('The agent returned no reply.')
      if (variant !== 'baseline') {
        const checked = await this.checkReply({
          context,
          draft,
          audit,
          summary: prepared?.summary,
        })
        if (checked === null)
          return finish(FALLBACK_REPLY)
        draft = checked
      }
      if (prepared)
        this.store.presentPending(prepared.id)
      return finish(draft, prepared?.id)
    }
    catch (error) {
      audit.error = error instanceof Error
        ? error.message
        : 'The turn failed.'
      return finish(decision === null
        ? RETRY_REPLY
        : FALLBACK_REPLY)
    }
  }

  private async checkReply(input: { context: ModelContext, draft: string, audit: Record<string, unknown>, summary?: string }): Promise<string | null> {
    const { context, draft, audit, summary } = input
    const review = reviewSchema.parse(await bounded(this.provider.review(context, draft)))
    audit.review = review
    if (review.approved)
      return draft
    if (!this.provider.repair)
      return null
    const corrected = z.string().trim().min(1).max(MAX_MODEL_TEXT_LENGTH).parse(await bounded(this.provider.repair({ context, draft, reasons: review.reasons })))
    const repairedDraft = summary
      ? `${corrected}\n\n${summary}`
      : corrected
    audit.repairDraft = repairedDraft
    const repairReview = reviewSchema.parse(await bounded(this.provider.review(context, repairedDraft)))
    audit.repairReview = repairReview
    return repairReview.approved ? repairedDraft : null
  }

  private async fixtureDraft(context: ModelContext, execute: (name: string, args: unknown) => unknown): Promise<string> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const draft = draftSchema.parse(await bounded(this.provider.draft(context)))
      if (!draft.tools.length)
        return draft.text
      for (const call of draft.tools)
        execute(call.name, call.arguments)
    }
    throw new Error('The tool limit was reached.')
  }
}
