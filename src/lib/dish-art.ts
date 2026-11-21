// Picks which placeholder illustration to show for a recipe, from its name and tags. Dataset recipes have no
// photos, so this keeps cards from all looking the same. Pure and shared with the phone app (mobile/src/lib).
export type DishKind = "noodles" | "soup" | "salad" | "protein" | "bowl";

const RULES: [DishKind, RegExp][] = [
  ["noodles", /\b(pasta|noodles?|spaghetti|lasagn[ae]|ramen|pho|macaroni|linguine|fettuccine|penne|ravioli|tortellini|lo mein|udon|orzo)\b/],
  ["soup", /\b(soup|stew|chili|chowder|curry|broth|bisque|gumbo|dal|dhal)\b/],
  ["salad", /\b(salad|slaw|greens|tabbouleh)\b/],
  ["protein", /\b(chicken|beef|pork|steak|fish|salmon|shrimp|tuna|turkey|lamb|burgers?|meatballs?|ribs|chops?|sausage|tofu)\b/],
];

export function dishKind(name: string, tags: string[] = []): DishKind {
  const text = `${name} ${tags.join(" ")}`.toLowerCase().replace(/[-_]/g, " ");
  // The name is the strongest hint, so try it alone before falling back to tags.
  for (const haystack of [name.toLowerCase(), text]) {
    for (const [kind, re] of RULES) if (re.test(haystack)) return kind;
  }
  return "bowl";
}
