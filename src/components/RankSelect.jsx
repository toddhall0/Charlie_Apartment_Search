// Rank picker. Choosing a number inserts this listing at that position; the
// app re-sequences everything else so ranks stay unique and contiguous.
export function RankSelect({ rank, rankedCount, onSetRank, compact = false }) {
  // If this listing is currently unranked, it can take a new slot at the end.
  const max = rank != null ? Math.max(rankedCount, 1) : rankedCount + 1
  const options = []
  for (let i = 1; i <= max; i++) options.push(i)

  return (
    <select
      value={rank ?? ''}
      onChange={(e) => onSetRank(e.target.value === '' ? null : Number(e.target.value))}
      aria-label="Rank"
      title="Rank this listing"
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: compact ? '4px 6px' : '6px 8px',
        borderRadius: 4,
        border: '2px solid #000',
        background: rank != null ? '#FCCC0A' : '#fff',
        color: '#000',
        fontFamily: 'Helvetica, Arial, sans-serif',
        cursor: 'pointer',
      }}
    >
      <option value="">— Rank</option>
      {options.map((i) => (
        <option key={i} value={i}>
          #{i}
        </option>
      ))}
    </select>
  )
}

export default RankSelect
