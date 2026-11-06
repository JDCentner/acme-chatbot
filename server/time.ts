import { DateTime } from 'luxon'
import { TIME_ZONE } from './contracts.ts'

export const TOUR_HORIZON_DAYS = 30
export const FIRST_TOUR_HOUR = 9
export const LAST_TOUR_HOUR = 17
const WEEKDAY_COUNT = 5
const DAYS_IN_WEEK = 7
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

export function localNow(clock: () => Date): DateTime {
  return DateTime.fromJSDate(clock(), { zone: TIME_ZONE })
}

export function seedSlots(clock: () => Date): string[] {
  const now = localNow(clock)
  const slots: string[] = []
  for (let offset = 0; offset < TOUR_HORIZON_DAYS; offset++) {
    const day = now.startOf('day').plus({ days: offset })
    if (day.weekday > WEEKDAY_COUNT)
      continue
    const hours = Array.from({ length: LAST_TOUR_HOUR - FIRST_TOUR_HOUR + 1 }, (_, index) => FIRST_TOUR_HOUR + index)
    slots.push(...hours.map(hour => day.set({ hour })).filter(slot => slot > now).map(slot => slot.toISO()!))
  }
  return slots
}

export function resolveAvailability(phrase: string, clock: () => Date): { date: string, hour: number | null } {
  const now = localNow(clock)
  const text = phrase.toLowerCase()
  const explicitDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]
  let day = explicitDate
    ? DateTime.fromISO(explicitDate, { zone: TIME_ZONE })
    : now.startOf('day')
  const weekday = WEEKDAYS.findIndex(name => text.includes(name))
  if (text.includes('tomorrow'))
    day = day.plus({ days: 1 })
  if (!explicitDate && weekday >= 0) {
    const offset = (weekday + 1 - now.weekday + DAYS_IN_WEEK) % DAYS_IN_WEEK
    day = day.plus({ days: offset || DAYS_IN_WEEK })
  }
  if (!explicitDate && weekday < 0 && !/\b(?:today|tomorrow)\b/.test(text))
    throw new Error('Please give a weekday or a date in YYYY-MM-DD form.')
  if (!day.isValid)
    throw new Error('Enter a valid date.')
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!timeMatch) {
    return {
      date: day.toISODate()!,
      hour: null,
    }
  }
  const rawHour = Number(timeMatch[1])
  const minutes = Number(timeMatch[2] ?? 0)
  const suffix = timeMatch[3]
  if (minutes !== 0 || (suffix && (rawHour < 1 || rawHour > 12)) || (!suffix && rawHour > 23))
    throw new Error('Tours start on the hour. Please give a valid time.')
  const hour = suffix
    ? rawHour % 12 + (suffix === 'pm'
      ? 12
      : 0)
    : rawHour
  return {
    date: day.toISODate()!,
    hour,
  }
}

export function isBookableSlot(slot: string, clock: () => Date): boolean {
  return seedSlots(clock).includes(canonicalSlot(slot))
}

export function canonicalSlot(slot: string): string {
  const date = DateTime.fromISO(slot, { zone: TIME_ZONE, setZone: true }).setZone(TIME_ZONE)
  if (!date.isValid)
    throw new Error('Enter a valid tour time.')
  return date.toISO()!
}
