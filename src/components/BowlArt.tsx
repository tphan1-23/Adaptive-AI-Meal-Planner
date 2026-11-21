"use client";

import { useState } from "react";
import { dishKind } from "@/lib/dish-art";

/**
 * Recipe picture. Shows a photo when the API gives an `imageUrl` (dataset recipes have no photos yet),
 * otherwise an illustration that matches the kind of dish (noodles, soup, salad, protein, bowl).
 */
export default function BowlArt({
  size = 184,
  name = "",
  tags = [],
  imageUrl,
}: {
  size?: number;
  name?: string;
  tags?: string[];
  imageUrl?: string | null;
}) {
  const [failed, setFailed] = useState(false); // if a photo cannot load, fall back to the illustration
  if (imageUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name ? `Photo of ${name}` : "Photo of the recipe"} className="h-full w-full rounded-[28px] object-cover" onError={() => setFailed(true)} />;
  }
  const kind = dishKind(name, tags);
  return (
    <svg role="img" aria-label={name ? `Illustration of ${name}` : "Illustration of a meal"} viewBox="0 0 400 400" width={size} height={size}>
      <circle cx="200" cy="200" r="176" fill="#fff" />
      <circle cx="200" cy="200" r="156" fill="none" stroke="#E3E3E0" strokeWidth="2" />
      <circle cx="200" cy="200" r="132" fill={kind === "soup" ? "#E9B872" : "#F1EFEB"} />
      {kind === "noodles" && (
        <g fill="none" stroke="#E3C28F" strokeWidth="14" strokeLinecap="round">
          <path d="M110 170c40-40 60 40 100 0s60 40 100 0" />
          <path d="M110 210c40-40 60 40 100 0s60 40 100 0" />
          <path d="M120 250c40-40 60 40 100 0s50 30 80 0" />
          <g fill="#D92D20" stroke="none"><circle cx="170" cy="150" r="14" /><circle cx="240" cy="236" r="14" /><circle cx="214" cy="190" r="12" /></g>
        </g>
      )}
      {kind === "soup" && (
        <g>
          <circle cx="200" cy="200" r="104" fill="#F4A24C" />
          <g fill="#D92D20"><circle cx="160" cy="180" r="16" /><circle cx="236" cy="224" r="16" /></g>
          <g fill="#6BA05A"><circle cx="214" cy="170" r="12" /><circle cx="170" cy="240" r="12" /><circle cx="250" cy="180" r="10" /></g>
          <g fill="none" stroke="#C9C9C5" strokeWidth="6" strokeLinecap="round"><path d="M150 70c-14 18 14 30 0 48" /><path d="M200 60c-14 18 14 30 0 48" /><path d="M250 70c-14 18 14 30 0 48" /></g>
        </g>
      )}
      {kind === "salad" && (
        <g>
          <g fill="#6BA05A"><ellipse cx="160" cy="170" rx="44" ry="22" transform="rotate(-30 160 170)" /><ellipse cx="236" cy="168" rx="44" ry="22" transform="rotate(30 236 168)" /><ellipse cx="200" cy="244" rx="46" ry="22" /></g>
          <g fill="#8FC27A"><ellipse cx="210" cy="206" rx="30" ry="16" transform="rotate(20 210 206)" /><ellipse cx="150" cy="226" rx="26" ry="14" transform="rotate(-20 150 226)" /></g>
          <g fill="#D92D20"><circle cx="186" cy="190" r="15" /><circle cx="250" cy="220" r="15" /><circle cx="150" cy="150" r="12" /></g>
          <g fill="#F5D76E"><circle cx="230" cy="150" r="10" /><circle cx="170" cy="262" r="10" /></g>
        </g>
      )}
      {kind === "protein" && (
        <g>
          <ellipse cx="190" cy="196" rx="76" ry="52" fill="#A5622F" transform="rotate(-18 190 196)" />
          <ellipse cx="184" cy="188" rx="58" ry="36" fill="#C47A3F" transform="rotate(-18 184 188)" />
          <g fill="none" stroke="#6BA05A" strokeWidth="12" strokeLinecap="round"><path d="M250 240l50 30" /><path d="M236 262l50 30" /><path d="M262 218l44 20" /></g>
          <circle cx="132" cy="262" r="24" fill="#F5D76E" />
        </g>
      )}
      {kind === "bowl" && (
        <g>
          <g fill="#D92D20"><rect x="138" y="108" width="38" height="38" rx="8" transform="rotate(18 157 127)" /><rect x="222" y="132" width="38" height="38" rx="8" transform="rotate(-10 241 151)" /><rect x="206" y="206" width="38" height="38" rx="8" transform="rotate(24 225 225)" /></g>
          <g fill="#F4958D"><rect x="184" y="92" width="34" height="34" rx="8" transform="rotate(-14 201 109)" /><rect x="160" y="160" width="34" height="34" rx="8" transform="rotate(30 177 177)" /><rect x="250" y="190" width="30" height="30" rx="7" transform="rotate(8 265 205)" /></g>
          <g fill="#E3C28F"><circle cx="118" cy="214" r="12" /><circle cx="144" cy="238" r="12" /><circle cx="112" cy="250" r="12" /><circle cx="170" cy="262" r="12" /><circle cx="196" cy="286" r="12" /></g>
          <g fill="#2E2E2E"><ellipse cx="262" cy="258" rx="30" ry="14" transform="rotate(-28 262 258)" /><ellipse cx="236" cy="288" rx="28" ry="13" transform="rotate(20 236 288)" /><ellipse cx="288" cy="232" rx="24" ry="11" transform="rotate(-50 288 232)" /></g>
        </g>
      )}
    </svg>
  );
}
