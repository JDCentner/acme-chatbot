const process = require('node:process')

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
      }),
    })
    const run = await response.json()
    if (!response.ok)
      return { error: run.error || 'Evaluation failed.' }
    const last = run.transcript.at(-1)
    return {
      output: last?.assistant || '',
      metadata: {
        runId: run.id,
        mode: run.mode,
        codeChecks: run.codeChecks,
        status: run.status,
        modelGrade: run.modelGrade,
        transcript: run.transcript,
      },
      latencyMs: run.durationMs,
    }
  }
}
module.exports = AcmeProvider
