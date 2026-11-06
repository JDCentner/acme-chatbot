import type { ModelProvider, ToolResult } from './contracts.ts'
import type { TaskAssessment } from './grading-rubric.ts'
import type { Store } from './store.ts'
import { createHash } from 'node:crypto'
import { gradeSchema, GREETING } from './contracts.ts'
import { GRADER_VERSION, TASK_CRITERIA, TASK_DOCUMENT, TASK_GRADER_PROMPT, TASK_REQUIREMENTS, TASK_SOURCE_HASH, taskAssessmentSchema } from './grading-rubric.ts'
import { bounded } from './models.ts'

const GRADER_TIMEOUT_MS = 90_000
const inFlightGrades = new WeakMap<Store, Map<string, Promise<TaskAssessment>>>()
export interface GradingTurn { user: string, assistant: string, tools: ToolResult[] }
export interface GradingSnapshot {
  transcript: GradingTurn[]
  facts: Record<string, unknown>
  evaluationDate: string
}

function validateEvidence(assessment: TaskAssessment, transcript: GradingTurn[]): TaskAssessment {
  if (transcript.length === 1) {
    assessment.contextUse = {
      passed: true,
      reasons: ['No earlier turn is present. Context retention does not apply.'],
      evidence: [],
    }
  }
  for (const criterion of TASK_CRITERIA) {
    const result = assessment[criterion]
    if (!result.passed && result.evidence.length === 0)
      throw new Error('A failed task criterion needs source and reply evidence.')
    for (const evidence of result.evidence)
      validateCitation({ criterion, evidence, transcript })
  }
  for (const evidence of assessment.advisories)
    validateCitation({ criterion: 'usefulAnswer', evidence, transcript })
  return assessment
}

function validateCitation(input: { criterion: string, evidence: TaskAssessment['factualSupport']['evidence'][number], transcript: GradingTurn[] }): void {
  const { criterion, evidence, transcript } = input
  const requirement = TASK_REQUIREMENTS.find(rule => rule.id === evidence.requirementId)
  if (requirement?.criterion !== criterion)
    throw new Error('The cited task requirement belongs to another criterion.')
  if (!transcript[evidence.turn - 1]?.assistant.includes(evidence.quote))
    throw new Error('The grader cited text that was not displayed in that turn.')
  if (criterion === 'contextUse' && evidence.turn === 1)
    throw new Error('Context retention requires an earlier turn.')
}

export function gradingInput(snapshot: GradingSnapshot) {
  return {
    taskDocument: TASK_DOCUMENT,
    requirements: TASK_REQUIREMENTS,
    communityFacts: snapshot.facts,
    evaluationDate: snapshot.evaluationDate,
    operationalContext: {
      greeting: GREETING,
      chatIsStored: true,
      actions: 'Local mock records only. No staff contact, real bookings, transfers, or material delivery.',
      taskGrade: 'Judge the demo requirements goals. Demo inventory and confirmation rules are reported as separate code checks.',
    },
    transcript: snapshot.transcript.map((turn, index) => ({ turn: index + 1, ...turn })),
  }
}

export async function gradeSnapshot(input: { store: Store, provider: ModelProvider, snapshot: GradingSnapshot, useCache?: boolean }) {
  const { store, provider, snapshot, useCache = true } = input
  const evidence = gradingInput(snapshot)
  const key = createHash('sha256').update(JSON.stringify({
    version: GRADER_VERSION,
    prompt: TASK_GRADER_PROMPT,
    model: provider.models.grader,
    reasoning: provider.reasoning?.grader,
    evidence,
  })).digest('hex')
  const cached = useCache
    ? store.cachedGrade(key)
    : undefined
  const assessment = cached
    ? validateEvidence(taskAssessmentSchema.parse(cached), snapshot.transcript)
    : await requestGrade({
        store,
        provider,
        snapshot,
        key,
        useCache,
      })
  const modelGrade = gradeSchema.parse(Object.fromEntries(TASK_CRITERIA.map(criterion => [
    criterion,
    {
      passed: assessment[criterion].passed,
      reasons: assessment[criterion].reasons.map(reason => `${assessment[criterion].evidence.map(item => `${item.requirementId}, turn ${item.turn}`).join('; ')}${assessment[criterion].evidence.length ? ': ' : ''}${reason}`),
    },
  ])))
  return {
    modelGrade,
    grading: {
      version: GRADER_VERSION,
      taskSourceHash: TASK_SOURCE_HASH,
      inputHash: key,
      cacheHit: Boolean(cached),
      assessment,
      advisories: assessment.advisories,
      evidence,
    },
  }
}

async function requestGrade(input: { store: Store, provider: ModelProvider, snapshot: GradingSnapshot, key: string, useCache: boolean }): Promise<TaskAssessment> {
  const { store, provider, snapshot, key, useCache } = input
  const active = inFlightGrades.get(store) || new Map<string, Promise<TaskAssessment>>()
  inFlightGrades.set(store, active)
  const previous = useCache
    ? active.get(key)
    : undefined
  if (previous)
    return previous
  const operation = bounded(provider.grade(gradingInput(snapshot)), GRADER_TIMEOUT_MS).then((result) => {
    const assessment = validateEvidence(taskAssessmentSchema.parse(result), snapshot.transcript)
    if (useCache)
      store.cacheGrade(key, assessment)
    return assessment
  })
  if (useCache)
    active.set(key, operation)
  try {
    return await operation
  }
  finally {
    if (active.get(key) === operation)
      active.delete(key)
  }
}
