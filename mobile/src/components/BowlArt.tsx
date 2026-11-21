import { useState } from "react";
import { Image } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
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
    return <Image source={{ uri: imageUrl }} accessibilityLabel={name ? `Photo of ${name}` : "Photo of the recipe"} style={{ width: "100%", height: "100%", borderRadius: 28 }} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  const kind = dishKind(name, tags);
  return (
    <Svg accessibilityLabel={name ? `Illustration of ${name}` : "Illustration of a meal"} viewBox="0 0 400 400" width={size} height={size}>
      <Circle cx="200" cy="200" r="176" fill="#fff" />
      <Circle cx="200" cy="200" r="156" fill="none" stroke="#E3E3E0" strokeWidth="2" />
      <Circle cx="200" cy="200" r="132" fill={kind === "soup" ? "#E9B872" : "#F1EFEB"} />
      {kind === "noodles" && (
        <G fill="none" stroke="#E3C28F" strokeWidth="14" strokeLinecap="round">
          <Path d="M110 170c40-40 60 40 100 0s60 40 100 0" />
          <Path d="M110 210c40-40 60 40 100 0s60 40 100 0" />
          <Path d="M120 250c40-40 60 40 100 0s50 30 80 0" />
          <G fill="#D92D20" stroke="none"><Circle cx="170" cy="150" r="14" /><Circle cx="240" cy="236" r="14" /><Circle cx="214" cy="190" r="12" /></G>
        </G>
      )}
      {kind === "soup" && (
        <G>
          <Circle cx="200" cy="200" r="104" fill="#F4A24C" />
          <G fill="#D92D20"><Circle cx="160" cy="180" r="16" /><Circle cx="236" cy="224" r="16" /></G>
          <G fill="#6BA05A"><Circle cx="214" cy="170" r="12" /><Circle cx="170" cy="240" r="12" /><Circle cx="250" cy="180" r="10" /></G>
          <G fill="none" stroke="#C9C9C5" strokeWidth="6" strokeLinecap="round"><Path d="M150 70c-14 18 14 30 0 48" /><Path d="M200 60c-14 18 14 30 0 48" /><Path d="M250 70c-14 18 14 30 0 48" /></G>
        </G>
      )}
      {kind === "salad" && (
        <G>
          <G fill="#6BA05A"><Ellipse cx="160" cy="170" rx="44" ry="22" transform="rotate(-30 160 170)" /><Ellipse cx="236" cy="168" rx="44" ry="22" transform="rotate(30 236 168)" /><Ellipse cx="200" cy="244" rx="46" ry="22" /></G>
          <G fill="#8FC27A"><Ellipse cx="210" cy="206" rx="30" ry="16" transform="rotate(20 210 206)" /><Ellipse cx="150" cy="226" rx="26" ry="14" transform="rotate(-20 150 226)" /></G>
          <G fill="#D92D20"><Circle cx="186" cy="190" r="15" /><Circle cx="250" cy="220" r="15" /><Circle cx="150" cy="150" r="12" /></G>
          <G fill="#F5D76E"><Circle cx="230" cy="150" r="10" /><Circle cx="170" cy="262" r="10" /></G>
        </G>
      )}
      {kind === "protein" && (
        <G>
          <Ellipse cx="190" cy="196" rx="76" ry="52" fill="#A5622F" transform="rotate(-18 190 196)" />
          <Ellipse cx="184" cy="188" rx="58" ry="36" fill="#C47A3F" transform="rotate(-18 184 188)" />
          <G fill="none" stroke="#6BA05A" strokeWidth="12" strokeLinecap="round"><Path d="M250 240l50 30" /><Path d="M236 262l50 30" /><Path d="M262 218l44 20" /></G>
          <Circle cx="132" cy="262" r="24" fill="#F5D76E" />
        </G>
      )}
      {kind === "bowl" && (
        <G>
          <G fill="#D92D20"><Rect x="138" y="108" width="38" height="38" rx="8" transform="rotate(18 157 127)" /><Rect x="222" y="132" width="38" height="38" rx="8" transform="rotate(-10 241 151)" /><Rect x="206" y="206" width="38" height="38" rx="8" transform="rotate(24 225 225)" /></G>
          <G fill="#F4958D"><Rect x="184" y="92" width="34" height="34" rx="8" transform="rotate(-14 201 109)" /><Rect x="160" y="160" width="34" height="34" rx="8" transform="rotate(30 177 177)" /><Rect x="250" y="190" width="30" height="30" rx="7" transform="rotate(8 265 205)" /></G>
          <G fill="#E3C28F"><Circle cx="118" cy="214" r="12" /><Circle cx="144" cy="238" r="12" /><Circle cx="112" cy="250" r="12" /><Circle cx="170" cy="262" r="12" /><Circle cx="196" cy="286" r="12" /></G>
          <G fill="#2E2E2E"><Ellipse cx="262" cy="258" rx="30" ry="14" transform="rotate(-28 262 258)" /><Ellipse cx="236" cy="288" rx="28" ry="13" transform="rotate(20 236 288)" /><Ellipse cx="288" cy="232" rx="24" ry="11" transform="rotate(-50 288 232)" /></G>
        </G>
      )}
    </Svg>
  );
}
