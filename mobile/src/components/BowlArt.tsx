import { Image } from "react-native";
import Svg, { Circle, Ellipse, G, Rect } from "react-native-svg";

/**
 * Recipe picture. Shows a photo when the API gives an `imageUrl` (not available yet: dataset
 * recipes have no photos), otherwise the design's placeholder bowl.
 */
export default function BowlArt({ size = 184, imageUrl }: { size?: number; imageUrl?: string | null }) {
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} accessibilityLabel="Photo of the recipe" style={{ width: "100%", height: "100%", borderRadius: 28 }} resizeMode="cover" />;
  }
  return (
    <Svg viewBox="0 0 400 400" width={size} height={size} accessibilityLabel="Illustration of a bowl of food">
      <Circle cx="200" cy="200" r="176" fill="#fff" />
      <Circle cx="200" cy="200" r="156" fill="none" stroke="#E3E3E0" strokeWidth="2" />
      <Circle cx="200" cy="200" r="132" fill="#F1EFEB" />
      <G fill="#D92D20">
        <Rect x="138" y="108" width="38" height="38" rx="8" rotation="18" origin="157, 127" />
        <Rect x="222" y="132" width="38" height="38" rx="8" rotation="-10" origin="241, 151" />
        <Rect x="206" y="206" width="38" height="38" rx="8" rotation="24" origin="225, 225" />
      </G>
      <G fill="#F4958D">
        <Rect x="184" y="92" width="34" height="34" rx="8" rotation="-14" origin="201, 109" />
        <Rect x="160" y="160" width="34" height="34" rx="8" rotation="30" origin="177, 177" />
        <Rect x="250" y="190" width="30" height="30" rx="7" rotation="8" origin="265, 205" />
      </G>
      <G fill="#E3C28F">
        <Circle cx="118" cy="214" r="12" />
        <Circle cx="144" cy="238" r="12" />
        <Circle cx="112" cy="250" r="12" />
        <Circle cx="170" cy="262" r="12" />
        <Circle cx="196" cy="286" r="12" />
      </G>
      <G fill="#2E2E2E">
        <Ellipse cx="262" cy="258" rx="30" ry="14" rotation="-28" origin="262, 258" />
        <Ellipse cx="236" cy="288" rx="28" ry="13" rotation="20" origin="236, 288" />
        <Ellipse cx="288" cy="232" rx="24" ry="11" rotation="-50" origin="288, 232" />
      </G>
    </Svg>
  );
}
