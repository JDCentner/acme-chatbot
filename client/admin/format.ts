export function formatCount(count: number, noun: 'turn' | 'record'): string {
  return `${count} ${noun}${count === 1
    ? ''
    : 's'}`
}
