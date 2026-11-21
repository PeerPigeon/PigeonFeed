/** A colour for a person's mark, from their key: the same person, the same colour, everywhere. */
export function hueOf(signer: string): string {
  let h = 0
  for (let i = 0; i < signer.length; i++) h = (h * 31 + signer.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 38% 42%)`
}

/** The letter in a person's mark. */
export const initial = (name: string): string => (name.trim()[0] ?? '?')

/** Text cut where its links are: only http(s) addresses become links. */
export function withLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  const re = /https?:\/\/[^\s<>"']+/g
  let at = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    // A full stop or bracket after an address is the sentence's, not the address's.
    const url = m[0].replace(/[.,;:!?)\]]+$/, '')
    if (m.index > at) out.push({ text: text.slice(at, m.index) })
    out.push({ text: url, href: url })
    at = m.index + url.length
    re.lastIndex = at
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
