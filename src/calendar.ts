import type { SavedOpportunity } from './personal'

// RFC 5545 calendar of saved notices, for importing into Google or Apple Calendar.
const DATE = /^\d{4}-\d{2}-\d{2}$/
const encoder = new TextEncoder()

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/[,;]/g, match => `\\${match}`).replace(/\r?\n/g, '\\n')
const compact = (day: string) => day.replaceAll('-', '')
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

// Content lines may be at most 75 octets; longer ones continue on lines starting with a space.
function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const width = encoder.encode(char).length
    if (size + width > 75) {
      parts.push(current)
      current = ' '
      size = 1
    }
    current += char
    size += width
  }
  parts.push(current)
  return parts.join('\r\n')
}

export function favoritesCalendar(favorites: SavedOpportunity[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QuestBoard//Favorites//KO', 'CALSCALE:GREGORIAN']
  for (const { id, item, resultDate } of favorites) {
    const eventEnd = item.event_end?.slice(0, 10) || item.event_start?.slice(0, 10)
    const events: [string, string | undefined, string | undefined][] = [
      // Same rule as the reminders: only an exact deadline is a real date.
      ['마감', item.date_kind === 'exact' ? item.recruit_end?.slice(0, 10) : undefined, undefined],
      ['행사', item.event_start?.slice(0, 10), eventEnd],
      ['발표', resultDate, undefined],
    ]
    for (const [label, start, end = start] of events) {
      if (!start || !DATE.test(start) || !end || !DATE.test(end) || end < start) continue
      lines.push(
        'BEGIN:VEVENT',
        `UID:${id}-${label}@questboard`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(start)}`,
        `DTEND;VALUE=DATE:${compact(nextDay(end))}`,
        `SUMMARY:[${label}] ${escapeText(item.title)}`,
        `DESCRIPTION:${escapeText(`${item.organizer} · ${item.source_url}`)}`,
        `URL:${item.source_url}`,
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
