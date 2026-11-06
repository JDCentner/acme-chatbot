import { z } from 'zod'

const DEFAULT_MODEL = 'gpt-6-luna'
const reasoningSchema = z.enum([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])
export type ReasoningEffort = z.infer<typeof reasoningSchema>

export function readModelConfiguration(environment: Record<string, string | undefined>) {
  return {
    models: {
      agent: environment.AGENT_MODEL || DEFAULT_MODEL,
      classifier: environment.CLASSIFIER_MODEL || DEFAULT_MODEL,
      reviewer: environment.REVIEW_MODEL || DEFAULT_MODEL,
      grader: environment.GRADER_MODEL || DEFAULT_MODEL,
    },
    reasoning: {
      agent: reasoningSchema.parse(environment.AGENT_REASONING_EFFORT || 'low'),
      classifier: reasoningSchema.parse(environment.CLASSIFIER_REASONING_EFFORT || 'low'),
      reviewer: reasoningSchema.parse(environment.REVIEW_REASONING_EFFORT || 'low'),
      grader: reasoningSchema.parse(environment.GRADER_REASONING_EFFORT || 'medium'),
    },
  }
}
