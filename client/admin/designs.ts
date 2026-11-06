export const DESIGNS = {
  baseline: { name: 'Original prompt', description: 'The supplied sales script with shared local mock tools. No model input gate or response reviewer.' },
  single: { name: 'One agent + checks', description: 'Sophie handles the conversation. Separate checks review input and replies. Code controls actions.' },
  specialists: { name: 'Sophie + specialists', description: 'Sophie calls community and request specialists. The same input, response, and action checks apply.' },
}
