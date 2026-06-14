// Duplicate detection for listings.
//
// Two listings are considered the same apartment if their normalized
// address+unit match, or if they point at the same StreetEasy building/unit
// path. Low listing counts make the O(n^2) grouping below perfectly fine.

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Canonical address+unit key.
export function listingKey(l) {
  return norm(l.address) + '|' + norm(l.unit)
}

// Normalized StreetEasy path (ignores query/host), or null.
function sePath(l) {
  if (!l || !l.streeteasy_url) return null
  try {
    return new URL(l.streeteasy_url).pathname.toLowerCase().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function sameListing(a, b) {
  if (listingKey(a) === listingKey(b)) return true
  const pa = sePath(a)
  const pb = sePath(b)
  return !!(pa && pb && pa === pb)
}

// True if `listing` matches any item in `others`.
export function isDuplicateOf(listing, others) {
  return others.some((o) => sameListing(o, listing))
}

// Group listings that refer to the same apartment; only returns groups with
// more than one member (i.e. actual duplicates).
export function findDuplicateGroups(listings) {
  const groups = []
  const used = new Set()
  for (let i = 0; i < listings.length; i++) {
    if (used.has(i)) continue
    const group = [listings[i]]
    used.add(i)
    for (let j = i + 1; j < listings.length; j++) {
      if (used.has(j)) continue
      if (group.some((g) => sameListing(g, listings[j]))) {
        group.push(listings[j])
        used.add(j)
      }
    }
    if (group.length > 1) groups.push(group)
  }
  return groups
}
