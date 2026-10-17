// The site mark: a small house with a heart window, drawn here rather than borrowed from any
// official emblem. Keep public/favicon.svg in step with it.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="20" fill="var(--brand)" />
      <rect x="25" y="9.5" width="3.6" height="7" rx="1.2" fill="#f4b183" />
      <path d="M10 19.2 20 10.6l10 8.6Z" fill="#f08a5d" stroke="#f08a5d" strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="12.6" y="18.2" width="14.8" height="12.6" rx="2.6" fill="#fff8ec" />
      <path d="M17.8 30.8v-4.4a2.2 2.2 0 0 1 4.4 0v4.4Z" fill="#0f6e56" />
      <path d="M20 24.2l-2.2-2.1a1.3 1.3 0 0 1 2.2-1.6 1.3 1.3 0 0 1 2.2 1.6Z" fill="#f08a5d" />
    </svg>
  )
}
