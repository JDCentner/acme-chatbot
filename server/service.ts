import {z} from 'zod';
import {Actions, isConfirmation} from './actions.ts';
import {Store} from './store.ts';
import {LiveProvider, bounded, type Variant} from './models.ts';
import {BLOCK_REPLY, CLARIFY_REPLY, RETRY_REPLY, FALLBACK_REPLY, PROMPT_VERSION, messageSchema, decisionSchema, draftSchema, reviewSchema, type ModelProvider, type ModelContext, type ToolResult} from './contracts.ts';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const MAX_TOOL_ROUNDS = 4;
export class ConversationService {
  private readonly busy = new Set<string>();
  constructor(readonly store: Store, readonly provider: ModelProvider) {}

  async submit(conversationId: string, body: unknown, variant: Variant = 'single'): Promise<unknown> {
    if (!z.uuid().safeParse(conversationId).success || !this.store.hasConversation(conversationId)) throw new HttpError(404, 'Conversation not found. Start a new chat.');
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Send a message of 1 to 4,000 characters and a valid requestId.');
    const previous = this.store.findTurn(conversationId, parsed.data.requestId);
    if (previous?.input !== undefined && previous.input !== parsed.data.message) throw new HttpError(409, 'This requestId was already used for another message.');
    if (previous?.reply) return {reply: previous.reply, replay: true};
    if (this.busy.has(conversationId)) throw new HttpError(409, 'A reply is still being checked. Please wait.');
    this.busy.add(conversationId);
    try { return await this.process(conversationId, parsed.data, variant); }
    finally { this.busy.delete(conversationId); }
  }

  private async process(conversationId: string, input: {message: string; requestId: string}, variant: Variant): Promise<unknown> {
    const started = performance.now();
    const id = this.store.startTurn({...input, conversationId});
    const tools: ToolResult[] = [];
    const audit: Record<string, unknown> = {mode: this.provider.mode, models: this.provider.models, promptVersion: PROMPT_VERSION, variant, tools, facts: this.store.facts()};
    const context: ModelContext = {facts: this.store.facts(), now: this.store.clock().toISOString(), messages: [...this.store.context(conversationId), {role: 'user', content: input.message}], tools, pending: this.store.pending(conversationId) || null};
    let decision: string | null = null;
    const finish = (reply: string, pendingId?: string) => {
      audit.durationMs = Math.round(performance.now() - started);
      this.store.finishTurn({id, decision, reply, audit});
      return {reply, pendingId, mode: this.provider.mode};
    };
    try {
      if (variant !== 'baseline') {
        const classification = decisionSchema.parse(await bounded(this.provider.classify(context)));
        audit.classification = classification;
        decision = classification.decision;
        if (decision === 'block') return finish(BLOCK_REPLY);
        if (decision === 'clarify') return finish(CLARIFY_REPLY);
      }
      decision = 'allow';
      this.store.database.prepare('UPDATE turns SET decision=? WHERE id=?').run(decision, id);
      const pending = this.store.pending(conversationId);
      const confirmed = pending && isConfirmation(input.message, pending.id);
      if (!confirmed) this.store.invalidatePending(conversationId);
      const actions = new Actions(this.store);
      const execute = (name: string, args: unknown) => {
        const result = actions.execute({conversationId, message: input.message, name, arguments: args});
        tools.push(result);
        this.store.checkpoint(id, audit);
        return result;
      };
      if (confirmed) execute('confirm_request', {pendingId: pending.id});
      let draft: string;
      if (this.provider instanceof LiveProvider) {
        const result = await this.provider.respond({variant, context, execute});
        draft = result.text;
        audit.usage = result.usage;
        audit.trace = result.trace;
      } else { draft = await this.fixtureDraft(context, execute); }
      const prepared = this.store.pending(conversationId);
      if (prepared && !prepared.presented) draft = `${draft}\n\n${prepared.summary}`.trim();
      audit.draft = draft;
      if (!draft) throw new Error('The agent returned no reply.');
      if (variant !== 'baseline') {
        const review = reviewSchema.parse(await bounded(this.provider.review(context, draft)));
        audit.review = review;
        if (!review.approved) return finish(FALLBACK_REPLY);
      }
      if (prepared) this.store.presentPending(prepared.id);
      return finish(draft, prepared?.id);
    } catch (error) {
      audit.error = error instanceof Error ? error.message : 'The turn failed.';
      return finish(decision === null ? RETRY_REPLY : FALLBACK_REPLY);
    }
  }

  private async fixtureDraft(context: ModelContext, execute: (name: string, args: unknown) => unknown): Promise<string> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const draft = draftSchema.parse(await bounded(this.provider.draft(context)));
      if (!draft.tools.length) return draft.text;
      for (const call of draft.tools) execute(call.name, call.arguments);
    }
    throw new Error('The tool limit was reached.');
  }
}
