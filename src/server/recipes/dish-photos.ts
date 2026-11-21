// Real photos for recipes. The Food.com dataset has no images, so a recipe is matched to a well-known dish by its
// name, and that dish gets a free photo from Wikipedia/Wikimedia Commons. The photo addresses are resolved once by
// `npm run build:dish-photos` and stored in dish-photos.json, so serving a recipe makes no outside request.
// A recipe that matches no dish gets no photo (clients then show an illustration).
import photos from "./dish-photos.json";

export interface DishPhoto {
  url: string;
  /** The Wikipedia article the photo comes from, for credit. */
  page: string;
}

/** Ordered: the first match wins, so specific dishes come before general ones. [pattern, Wikipedia article title] */
export const DISH_RULES: [RegExp, string][] = [
  // Named soups first: "chicken noodle soup" is a soup, not a noodle dish.
  [/\bchicken (noodle )?soup\b/, "Chicken soup"],
  [/\btomato soup\b/, "Tomato soup"],
  [/\b(fettuccin[ei]?|fettucine) alfredo\b/, "Fettuccine Alfredo"],
  [/\b(mac(aroni)? (and|&|n') cheese|macaroni cheese)\b/, "Macaroni and cheese"],
  [/\blasagn[ae]\b/, "Lasagne"],
  [/\b(spaghetti|bolognese)\b/, "Spaghetti"],
  [/\b(ravioli|tortellini|gnocchi)\b/, "Ravioli"],
  [/\b(pad thai)\b/, "Pad thai"],
  [/\b(ramen)\b/, "Ramen"],
  [/\b(pho)\b/, "Phở"],
  [/\b(lo mein|chow mein)\b/, "Chow mein"],
  [/\budon\b/, "Udon"],
  [/\b(noodles?)\b/, "Noodle"],
  [/\b(pasta|linguine|penne|fettuccin[ei]?|rigatoni|macaroni|orzo|manicotti)\b/, "Pasta"],
  [/\b(fried rice)\b/, "Fried rice"],
  [/\bbiryani\b/, "Biryani"],
  [/\brisotto\b/, "Risotto"],
  [/\bpaella\b/, "Paella"],
  [/\bsushi\b/, "Sushi"],
  [/\bburritos?\b/, "Burrito"],
  [/\b(tacos?)\b/, "Taco"],
  [/\benchiladas?\b/, "Enchilada"],
  [/\bquesadillas?\b/, "Quesadilla"],
  [/\bfajitas?\b/, "Fajita"],
  [/\bchili\b/, "Chili con carne"],
  [/\bgumbo\b/, "Gumbo"],
  [/\bchowder\b/, "Chowder"],
  [/\b(minestrone)\b/, "Minestrone"],
  [/\b(lentil|dal|dhal)\b.*\b(soup|stew|curry)?\b/, "Lentil soup"],
  [/\bcurry\b/, "Curry"],
  [/\bstew\b/, "Stew"],
  [/\bsoup\b/, "Soup"],
  [/\bcaesar\b/, "Caesar salad"],
  [/\bgreek salad\b/, "Greek salad"],
  [/\b(coleslaw|slaw)\b/, "Coleslaw"],
  [/\bpotato salad\b/, "Potato salad"],
  [/\b(tuna salad)\b/, "Tuna salad"],
  [/\bsalad\b/, "Salad"],
  [/\b(burgers?|hamburgers?|cheeseburgers?)\b/, "Hamburger"],
  [/\bmeatloaf\b/, "Meatloaf"],
  [/\bmeatballs?\b/, "Meatball"],
  [/\b(fried chicken)\b/, "Fried chicken"],
  [/\bchicken (parmesan|parmigiana|parm)\b/, "Chicken parmigiana"],
  [/\b(buffalo )?(chicken )?wings?\b/, "Buffalo wing"],
  [/\b(roast(ed)? chicken|chicken roast)\b/, "Roast chicken"],
  [/\b(pork chops?)\b/, "Pork chop"],
  [/\b(spare ?ribs|ribs|bbq ribs)\b/, "Spare ribs"],
  [/\b(steaks?|sirloin|ribeye)\b/, "Steak"],
  [/\b(salmon)\b/, "Salmon as food"],
  [/\b(shrimp|prawns?)\b/, "Shrimp and prawn as food"],
  [/\b(tuna)\b/, "Tuna"],
  [/\b(fish|cod|tilapia|halibut|trout)\b/, "Fish as food"],
  [/\b(turkey)\b/, "Turkey as food"],
  [/\b(lamb)\b/, "Lamb and mutton"],
  [/\b(tofu)\b/, "Tofu"],
  [/\b(sausages?)\b/, "Sausage"],
  [/\bpizzas?\b/, "Pizza"],
  [/\b(sandwich(es)?|sub|panini|wrap)\b/, "Sandwich"],
  [/\bquiche\b/, "Quiche"],
  [/\b(frittata|omelet|omelette)\b/, "Omelette"],
  [/\bfalafel\b/, "Falafel"],
  [/\bhummus\b/, "Hummus"],
  [/\b(kebabs?|kabobs?)\b/, "Kebab"],
  [/\bstir[- ]?fr(y|ied)\b/, "Stir frying"],
  [/\bcasserole\b/, "Casserole"],
  [/\b(baked potato|twice baked)\b/, "Baked potato"],
  [/\bchicken\b/, "Chicken as food"],
  [/\b(beef|pork)\b/, "Roast beef"],
];

/** The dish a recipe is matched to (a Wikipedia article title), or null when no rule fits. */
export function dishTitle(name: string): string | null {
  const text = name.toLowerCase().replace(/[^a-z0-9&' ]+/g, " ");
  for (const [re, title] of DISH_RULES) if (re.test(text)) return title;
  return null;
}

const table = photos as Record<string, DishPhoto | undefined>;

/** A photo for the recipe, or null. Only titles present in dish-photos.json can match. */
export function photoFor(name: string): DishPhoto | null {
  const title = dishTitle(name);
  return (title && table[title]) || null;
}
