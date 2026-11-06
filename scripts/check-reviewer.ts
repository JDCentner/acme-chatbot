import type { ModelContext } from '../server/contracts.ts'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { DEMO_CAPABILITIES, reviewSchema } from '../server/contracts.ts'
import { COMMUNITY_FACTS } from '../server/facts.ts'
import { bounded, createProvider } from '../server/models.ts'

const provider = createProvider()
if (provider.mode !== 'live')
  throw new Error('Reviewer reference checks need authorized live mode.')
const context: ModelContext = {
  facts: COMMUNITY_FACTS,
  now: '2026-11-06T01:00:00Z',
  tools: [],
  pending: null,
  capabilities: DEMO_CAPABILITIES,
  requestState: { checkedSlots: [], savedRequests: [] },
  messages: [
    { role: 'user', content: 'Please use corrected@example.com for my request. I also need to ask about my dog and care options.' },
  ],
}
const references = [
  { id: 'R01', approved: true, draft: 'Small dogs under 25 pounds and service animals are allowed. I can save a callback request if you want to ask the team about an exception.' },
  { id: 'R02', approved: true, draft: 'I will use corrected@example.com for your tour request.' },
  { id: 'R03', approved: true, draft: 'Would you like to arrange a tour?' },
  { id: 'R04', approved: false, draft: 'Room-specific pricing may vary.' },
  { id: 'R05', approved: false, draft: 'Dementia care is included.' },
  { id: 'R06', approved: false, draft: 'I have transferred you to Jami.' },
  { id: 'R07', approved: true, draft: 'Veterans may be eligible for Veterans benefits.' },
  { id: 'R08', approved: true, draft: 'Low salt options are available. I do not have information about Kosher meals. You can ask the team at 850-445-8362.' },
]
const results: Array<Record<string, unknown>> = []
for (const reference of references) {
  const attempts = await Promise.all(Array.from({ length: 2 }, async (_, attempt) => {
    try {
      const review = reviewSchema.parse(await bounded(provider.review(context, reference.draft)))
      return {
        ...reference,
        attempt: attempt + 1,
        review,
        agrees: review.approved === reference.approved,
      }
    }
    catch (error) {
      return {
        ...reference,
        attempt: attempt + 1,
        agrees: false,
        error: error instanceof Error
          ? error.message
          : 'Review failed.',
      }
    }
  }))
  results.push(...attempts)
  console.warn(`${reference.id}: ${attempts.filter(result => result.agrees).length}/2 agree with reference labels`)
}
const agreements = results.filter(result => result.agrees).length
const summary = {
  model: provider.models.reviewer,
  reasoning: provider.reasoning?.reviewer,
  total: results.length,
  agreements,
  errors: results.filter(result => result.error).length,
}
writeFileSync(process.env.REVIEW_CHECK_OUTPUT || '/tmp/acme-reviewer-checks.json', JSON.stringify({ summary, results }, null, 2))
console.warn(JSON.stringify(summary))
process.exitCode = agreements === results.length
  ? 0
  : 1
