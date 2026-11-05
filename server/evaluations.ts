import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Store} from './store.ts';
import {ConversationService, HttpError} from './service.ts';
import {bounded, variantSchema} from './models.ts';
import {gradeSchema, type ModelProvider} from './contracts.ts';

export const evaluationSchema = z.object({
  variant: variantSchema,
  messages: z.array(z.string().min(1).max(4000)).min(1).max(20),
  expectations: z.string().min(1).max(3000),
}).strict();

export async function evaluate(store: Store, provider: ModelProvider, body: unknown): Promise<unknown> {
  const parsed = evaluationSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, 'Provide a variant, messages, and expectations.');
  const input = parsed.data;
  const sandbox = new Store(':memory:', store.clock);
  const started = performance.now();
  try {
    const service = new ConversationService(sandbox, provider);
    const conversation = sandbox.createConversation();
    for (const message of input.messages) await service.submit(conversation.id, {message, requestId: randomUUID()}, input.variant);
    const turns = sandbox.turns(conversation.id);
    const transcript = turns.map(turn => ({user: turn.input, assistant: turn.reply, audit: JSON.parse(turn.audit)}));
    const hasErrors = transcript.some(turn => turn.audit.error);
    const requests = sandbox.requests();
    const duplicateCount = requests.length - new Set(requests.map(request => request.pending_id)).size;
    const codeChecks = {noDuplicateRequests: duplicateCount === 0, noPipelineErrors: !hasErrors};
    let modelGrade: unknown = null;
    let graderError: string | null = null;
    if (provider.mode === 'live') {
      try { modelGrade = gradeSchema.parse(await bounded(provider.grade({transcript, facts: sandbox.facts(), expectations: input.expectations}))); }
      catch (error) { graderError = error instanceof Error ? error.message : 'Grading failed.'; }
    }
    const status = provider.mode === 'fake' ? 'fixture_only' : graderError || hasErrors ? 'error' : Object.values(modelGrade as z.infer<typeof gradeSchema>).every(criterion => criterion.passed) && duplicateCount === 0 ? 'pass' : 'fail';
    return store.saveRun({input, transcript, facts: sandbox.facts(), expectations: input.expectations, codeChecks, modelGrade, graderError, status, mode: provider.mode, models: provider.models, durationMs: Math.round(performance.now() - started), requests});
  } finally { sandbox.close(); }
}
