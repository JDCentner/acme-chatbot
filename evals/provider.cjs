const process = require('node:process')

const SUITE_VERSION = 'acme-suite-4'
class AcmeProvider {
  constructor(options) { this.config = options.config }
  id() { return `acme:${this.config.variant}` }
  async callApi(prompt, context) {
    const response = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variant: this.config.variant,
        messages: JSON.parse(context.vars.messages),
        expectations: context.vars.expectations,
        expectedRequests: context.vars.expectedRequests === undefined
          ? undefined
          : JSON.parse(context.vars.expectedRequests),
        caseId: context.vars.caseId,
        caseTitle: context.vars.caseTitle,
        category: context.vars.category,
        source: context.vars.source,
        suiteVersion: SUITE_VERSION,
        batchId: process.env.EVAL_BATCH_ID || undefined,
      }),
    })
    const run = await response.json()
    if (!response.ok)
      return { error: run.error || 'Evaluation failed.' }
    const result = {
      output: run.transcript.map((turn, index) => `Turn ${index + 1}\nProspect: ${turn.user}\nSophie: ${turn.assistant}`).join('\n\n'),
      metadata: {
        runId: run.id,
        caseId: run.input.caseId,
        category: run.input.category,
        source: run.input.source,
        batchId: run.input.batchId,
        suiteVersion: SUITE_VERSION,
        mode: run.mode,
        models: run.models,
        reasoning: run.reasoning,
        codeChecks: run.codeChecks,
        codeStatus: run.codeStatus,
        graderVersion: run.grading?.version,
        taskSourceHash: run.grading?.taskSourceHash,
        status: run.status,
        modelGrade: run.modelGrade,
        transcript: run.transcript.map((turn, index) => ({
          turn: index + 1,
          user: turn.user,
          assistant: turn.assistant,
          decision: turn.audit.classification,
          review: turn.audit.review,
          repairDraft: turn.audit.repairDraft,
          repairReview: turn.audit.repairReview,
          classificationSource: turn.audit.classificationSource,
          tools: turn.audit.tools,
          rejectedDraft: turn.audit.review?.approved === false
            ? turn.audit.draft
            : undefined,
          durationMs: turn.audit.durationMs,
        })),
      },
      latencyMs: run.durationMs,
    }
    if (run.status === 'error')
      return { ...result, error: 'Agent pipeline or grader error. Inspect the saved run in the admin workspace.' }
    return result
  }
}
module.exports = AcmeProvider
