import type { CalibrationCase } from '../evals/calibration.ts'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { z } from 'zod'
import { CALIBRATION_CASES } from '../evals/calibration.ts'
import { COMMUNITY_FACTS } from '../server/facts.ts'
import { GRADER_VERSION, TASK_SOURCE_HASH } from '../server/grading-rubric.ts'
import { gradeSnapshot } from '../server/grading.ts'
import { createProvider } from '../server/models.ts'
import { Store } from '../server/store.ts'

const repeats = z.coerce.number().int().min(2).max(5).parse(process.env.CALIBRATION_REPEATS || 2)
const output = process.env.CALIBRATION_OUTPUT || '/tmp/acme-grader-calibration.json'
const provider = createProvider()
if (provider.mode !== 'live')
  throw new Error('Calibration needs an authorized live grader. Set MODEL_MODE=live.')
const store = new Store(':memory:')

async function checkReference(reference: CalibrationCase, attempt: number) {
  const started = performance.now()
  try {
    const result = await gradeSnapshot({
      store,
      provider,
      useCache: false,
      snapshot: { facts: COMMUNITY_FACTS, transcript: reference.transcript, evaluationDate: '2026-11-05' },
    })
    const agrees = Object.entries(reference.expected).every(([criterion, expected]) => result.modelGrade[criterion as keyof typeof result.modelGrade].passed === expected)
    return {
      id: reference.id,
      attempt,
      expected: reference.expected,
      agrees,
      ...result,
      durationMs: Math.round(performance.now() - started),
    }
  }
  catch (error) {
    return {
      id: reference.id,
      attempt,
      agrees: false,
      error: error instanceof Error
        ? error.message
        : 'Calibration failed.',
    }
  }
}

try {
  const results: Awaited<ReturnType<typeof checkReference>>[] = []
  for (const reference of CALIBRATION_CASES) {
    const attempts = await Promise.all(Array.from({ length: repeats }, (_, index) => checkReference(reference, index + 1)))
    results.push(...attempts)
    console.warn(`${reference.id}: ${attempts.filter(attempt => attempt.agrees).length}/${repeats} agree with reference labels`)
  }
  const errors = results.filter(result => 'error' in result).length
  const agreements = results.filter(result => result.agrees).length
  const consistentCases = CALIBRATION_CASES.filter(reference => new Set(results.filter(result => result.id === reference.id).map(result => 'modelGrade' in result
    ? JSON.stringify(Object.values(result.modelGrade).map(criterion => criterion.passed))
    : 'error')).size === 1).length
  const summary = {
    grader: provider.models.grader,
    reasoning: provider.reasoning?.grader,
    version: GRADER_VERSION,
    taskSourceHash: TASK_SOURCE_HASH,
    repeats,
    cases: CALIBRATION_CASES.length,
    agreements,
    total: results.length,
    errors,
    consistentCases,
    labels: 'Proposed reference labels. User review is still needed.',
  }
  writeFileSync(output, JSON.stringify({ summary, references: CALIBRATION_CASES, results }, null, 2))
  console.warn(JSON.stringify(summary))
  process.exitCode = errors || agreements !== results.length
    ? 1
    : 0
}
finally { store.close() }
