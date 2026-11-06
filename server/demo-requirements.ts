import { BASELINE_PROMPT } from './baseline-prompt.ts'

export const DEMO_REQUIREMENTS = `# Demo requirements

The agent will be accurate in its responses.
Only share supplied community information and state unknown details clearly.
Perform basic sales qualification and help move potential residents down the sales funnel.
Support preview of the three agent designs and their complete conversations.
Retain decisions, reviews, tools, and evaluation evidence for monitoring and improvement.

## Reference conversation rules
${BASELINE_PROMPT}`
