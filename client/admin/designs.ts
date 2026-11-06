export const DESIGNS = {
  baseline: { name: 'Original prompt', description: 'The exact original script and basic mock tools. No clock correction, extra facts, classifier, review, or automatic confirmation.' },
  prompt: { name: 'Better prompt + server time', description: 'One agent with a revised prompt, current New York time, and community facts. The same basic tools as the original. No classifier or review.' },
  single: { name: 'One agent + checks', description: 'Sophie handles the conversation. Separate checks review input and replies. Code controls actions.' },
  specialists: { name: 'Sophie + specialists', description: 'Sophie calls community and request specialists. The same input, response, and action checks apply.' },
}
