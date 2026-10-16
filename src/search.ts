// Search helpers: Korean initial-consonant (초성) queries, synonyms, and a typo-tolerant
// fallback that compares words letter by letter (자모) so "개임" still finds "게임".

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNGSEONG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONGSEONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

// Each group is searched as one word. Keep entries specific: short English words are
// matched as whole words, Korean words as substrings.
const SYNONYM_GROUPS = [
  ['게임잼', 'game jam', 'gamejam', '게임 잼'],
  ['해커톤', 'hackathon'],
  ['인공지능', 'ai'],
  ['공모전', '경진대회', '콘테스트', 'contest', 'competition'],
  ['웹툰', 'webtoon'],
  ['메타버스', 'metaverse'],
  ['가상현실', 'vr'],
  ['증강현실', 'ar'],
  ['확장현실', 'xr'],
  ['소프트웨어', 'sw', 'software'],
  ['스타트업', 'startup'],
  ['데이터', 'data'],
  ['인디', 'indie'],
  ['숏폼', '쇼츠', 'shorts', '릴스'],
  ['영상', '동영상', 'video'],
  ['디자인', 'design'],
  ['세미나', '컨퍼런스', '웨비나', 'conference', 'seminar'],
  ['대학생', '학부생'],
]

const normalize = (value: string) => value.toLocaleLowerCase('ko-KR')
const SYNONYMS = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) for (const word of group) SYNONYMS.set(normalize(word), group.map(normalize))

const isSyllable = (code: number) => code >= HANGUL_START && code <= HANGUL_END

export function toChoseong(text: string): string {
  let result = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    result += isSyllable(code) ? CHOSEONG[Math.floor((code - HANGUL_START) / 588)] : char
  }
  return result
}

export function toJamo(text: string): string {
  let result = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (!isSyllable(code)) { result += char; continue }
    const offset = code - HANGUL_START
    result += CHOSEONG[Math.floor(offset / 588)] + JUNGSEONG[Math.floor((offset % 588) / 28)] + JONGSEONG[offset % 28]
  }
  return result
}

const isChoseongQuery = (term: string) => /^[ㄱ-ㅎ]{2,}$/.test(term)

function containsWord(haystack: string, word: string) {
  if (/^[a-z0-9]{1,3}$/.test(word)) return new RegExp(`(?<![a-z0-9])${word}(?![a-z0-9])`).test(haystack)
  return haystack.includes(word)
}

/** True when ``a`` and ``b`` differ by at most one insertion, deletion or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

// Typos are only tolerated for longer words; a one-letter change in a two-letter word
// would match too much.
const MIN_FUZZY_JAMO = 4

function fuzzyContains(haystackWords: string[], term: string) {
  const target = toJamo(term)
  if (target.length < MIN_FUZZY_JAMO) return false
  for (const word of haystackWords) {
    for (let length = target.length - 1; length <= target.length + 1; length++) {
      for (let start = 0; start + length <= word.length; start++) {
        if (withinOneEdit(word.slice(start, start + length), target)) return true
      }
    }
  }
  return false
}

export interface SearchIndex {
  text: string
  choseong: string
  jamoWords: string[]
}

export function buildIndex(parts: string[]): SearchIndex {
  const text = normalize(parts.join(' '))
  return { text, choseong: toChoseong(text), jamoWords: text.split(/[\s·,()[\]「」<>:|/]+/).filter(Boolean).map(toJamo) }
}

// Multi-word synonyms ("game jam") are joined before splitting so they stay one term.
const PHRASES = SYNONYM_GROUPS.flatMap(group => group.filter(word => word.includes(' ')).map(word => [normalize(word), normalize(group[0])]))

export function searchTerms(query: string): string[] {
  let text = normalize(query)
  for (const [phrase, word] of PHRASES) text = text.split(phrase).join(word)
  return text.trim().split(/\s+/).filter(Boolean)
}

/** Every term must match: exactly, by synonym, by 초성, or (when ``fuzzy``) with one typo. */
export function matchesSearch(index: SearchIndex, terms: string[], fuzzy = false): boolean {
  return terms.every(term => {
    if (isChoseongQuery(term)) return index.choseong.includes(term)
    const alternatives = SYNONYMS.get(term) ?? [term]
    if (alternatives.some(word => containsWord(index.text, word))) return true
    return fuzzy && fuzzyContains(index.jamoWords, term)
  })
}
