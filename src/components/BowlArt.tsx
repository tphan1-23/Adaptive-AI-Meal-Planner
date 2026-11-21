/** Placeholder top-down bowl from the design. Dataset recipes have no photos yet. */
export default function BowlArt({ size = 184 }: { size?: number }) {
  return (
    <svg role="img" aria-label="Illustration of a bowl of food" viewBox="0 0 400 400" width={size} height={size}>
      <circle cx="200" cy="200" r="176" fill="#fff" />
      <circle cx="200" cy="200" r="156" fill="none" stroke="#E3E3E0" strokeWidth="2" />
      <circle cx="200" cy="200" r="132" fill="#F1EFEB" />
      <g fill="#D92D20">
        <rect x="138" y="108" width="38" height="38" rx="8" transform="rotate(18 157 127)" />
        <rect x="222" y="132" width="38" height="38" rx="8" transform="rotate(-10 241 151)" />
        <rect x="206" y="206" width="38" height="38" rx="8" transform="rotate(24 225 225)" />
      </g>
      <g fill="#F4958D">
        <rect x="184" y="92" width="34" height="34" rx="8" transform="rotate(-14 201 109)" />
        <rect x="160" y="160" width="34" height="34" rx="8" transform="rotate(30 177 177)" />
        <rect x="250" y="190" width="30" height="30" rx="7" transform="rotate(8 265 205)" />
      </g>
      <g fill="#E3C28F">
        <circle cx="118" cy="214" r="12" />
        <circle cx="144" cy="238" r="12" />
        <circle cx="112" cy="250" r="12" />
        <circle cx="170" cy="262" r="12" />
        <circle cx="196" cy="286" r="12" />
      </g>
      <g fill="#2E2E2E">
        <ellipse cx="262" cy="258" rx="30" ry="14" transform="rotate(-28 262 258)" />
        <ellipse cx="236" cy="288" rx="28" ry="13" transform="rotate(20 236 288)" />
        <ellipse cx="288" cy="232" rx="24" ry="11" transform="rotate(-50 288 232)" />
      </g>
    </svg>
  );
}
