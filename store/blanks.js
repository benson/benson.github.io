const blanks = [
  {
    id: "printful-586",
    provider: "Printful",
    providerId: "586",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Comfort Colors 1717",
    subtitle: "Unisex garment-dyed heavyweight t-shirt",
    image: "assets/blanks/printful-586.jpg",
    cost: 15.29,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    colorCount: 45,
    colors: ["Black", "Blue Jean", "Butter", "Crunchberry", "Espresso", "Flo Blue", "Granite", "Ivory", "Moss", "Pepper"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "best premium default: soft garment-dyed feel, lots of colors, easy to explain to buyers.",
    watch: "cost is meaningfully higher than basic tees; big dark designs still need proof mockups.",
    tags: ["premium default", "garment dyed", "heavyweight"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-garment-dyed-heavyweight-shirt-comfort-colors-1717"
  },
  {
    id: "printful-71",
    provider: "Printful",
    providerId: "71",
    category: "tee",
    groups: ["tee"],
    name: "Bella + Canvas 3001",
    subtitle: "Unisex staple t-shirt",
    image: "assets/blanks/printful-71.jpg",
    cost: 11.69,
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    colorCount: 83,
    colors: ["Black", "Asphalt", "Autumn", "Baby Blue", "Forest", "Heather Dust", "Natural", "Navy", "Red", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "best broad default when color and size coverage matter.",
    watch: "feels more standard startup-tee than interesting blank.",
    tags: ["broad default", "huge color range"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-staple-t-shirt-bella-canvas-3001"
  },
  {
    id: "printful-1421",
    provider: "Printful",
    providerId: "1421",
    category: "tee",
    groups: ["tee"],
    name: "LAT Apparel 6901",
    subtitle: "Unisex fine jersey tee",
    image: "assets/blanks/printful-1421.png",
    cost: 11.49,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    colorCount: 7,
    colors: ["Black", "Coyote Brown", "Heather", "Light Blue", "Natural", "Navy", "White"],
    techniques: ["DTG", "embroidery"],
    best: "current store path: inexpensive, mapped, and already proven by the first shirt.",
    watch: "limited palette compared with Bella or Comfort Colors.",
    tags: ["current mapped blank", "good margin"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/lat-unisex-fine-jersey-tee-6901"
  },
  {
    id: "printful-438",
    provider: "Printful",
    providerId: "438",
    category: "tee",
    groups: ["tee"],
    name: "Gildan 5000",
    subtitle: "Unisex classic tee",
    image: "assets/blanks/printful-438.jpg",
    cost: 9.25,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    colorCount: 35,
    colors: ["Black", "Carolina Blue", "Daisy", "Forest Green", "Natural", "Navy", "Red", "Royal", "Sand", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "cheapest sensible tee for low-price jokes, experiments, or tiny-margin drops.",
    watch: "not a premium-feeling shirt; choose only when price is the point.",
    tags: ["cheapest", "broad sizes"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-classic-tee-gildan-5000"
  },
  {
    id: "printful-12",
    provider: "Printful",
    providerId: "12",
    category: "tee",
    groups: ["tee"],
    name: "Gildan 64000",
    subtitle: "Unisex basic softstyle t-shirt",
    image: "assets/blanks/printful-12.jpg",
    cost: 9.44,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    colorCount: 34,
    colors: ["Black", "Charcoal", "Cornsilk", "Forest Green", "Maroon", "Military Green", "Natural", "Navy", "Sport Grey", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "cheap but softer than the 5000, with plenty of normal colors.",
    watch: "still reads like a basic merch blank.",
    tags: ["cheap", "softstyle"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-basic-softstyle-t-shirt-gildan-64000"
  },
  {
    id: "printful-508",
    provider: "Printful",
    providerId: "508",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Cotton Heritage MC1086",
    subtitle: "Men's premium heavyweight tee",
    image: "assets/blanks/printful-508.jpg",
    cost: 16.85,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    colorCount: 7,
    colors: ["Agave", "Black", "Brick Red", "Carbon Grey", "Charcoal Heather", "Vintage Gold", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "heavier and more streetwear-ish than basic blanks without leaving Printful.",
    watch: "small color range and higher production cost.",
    tags: ["heavyweight", "premium"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/mens-premium-heavyweight-tee-cotton-heritage-mc1086"
  },
  {
    id: "printful-917",
    provider: "Printful",
    providerId: "917",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Cotton Heritage MC1087",
    subtitle: "Men's box tee",
    image: "assets/blanks/printful-917.png",
    cost: 17.45,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    colorCount: 5,
    colors: ["Black", "Navy Blazer", "Vintage Black", "Vintage White", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "boxier silhouette for designs that want a heavier streetwear object.",
    watch: "expensive; fewer colors; men's sizing language.",
    tags: ["box fit", "heavy"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/mens-box-tee-cotton-heritage-mc1087"
  },
  {
    id: "printful-880",
    provider: "Printful",
    providerId: "880",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Bella + Canvas 4810",
    subtitle: "Unisex oversized garment-dyed t-shirt",
    image: "assets/blanks/printful-880.png",
    cost: 16.49,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colorCount: 6,
    colors: ["Khaki", "Light Washed Denim", "Vintage White", "Washed Black", "Washed Charcoal", "Washed Maroon"],
    techniques: ["DTG", "embroidery"],
    best: "soft washed oversized look inside the current Printful catalog.",
    watch: "small color range; verify print scale carefully.",
    tags: ["oversized", "garment dyed"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-oversized-garment-dyed-t-shirt-bella-canvas-4810"
  },
  {
    id: "printful-713",
    provider: "Printful",
    providerId: "713",
    category: "tee",
    groups: ["premium", "tee"],
    name: "AS Colour 5082",
    subtitle: "Men's oversized faded t-shirt",
    image: "assets/blanks/printful-713.png",
    cost: 23.92,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colorCount: 7,
    colors: ["Faded Black", "Faded Bone", "Faded Coal", "Faded Eucalyptus", "Faded Grey", "Faded Indigo", "Faded Khaki"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "nice if the blank itself is part of the appeal.",
    watch: "very expensive for casual joke shirts.",
    tags: ["premium", "oversized", "pricey"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/oversized-faded-t-shirt-ascolour-5082"
  },
  {
    id: "printful-593",
    provider: "Printful",
    providerId: "593",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Comfort Colors 6030",
    subtitle: "Unisex garment-dyed pocket t-shirt",
    image: "assets/blanks/printful-593.jpg",
    cost: 19.55,
    sizes: ["S", "M", "L", "XL", "2XL"],
    colorCount: 11,
    colors: ["Berry", "Black", "Brick", "Butter", "Flo Blue", "Grey", "True Navy", "Violet", "Watermelon", "White"],
    techniques: ["DTG", "embroidery"],
    best: "good when the pocket is part of the joke or front detail.",
    watch: "back print works, but front placement is constrained by the pocket.",
    tags: ["pocket tee", "garment dyed"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/unisex-garment-dyed-pocket-t-shirt-comfort-colors-6030"
  },
  {
    id: "printful-753",
    provider: "Printful",
    providerId: "753",
    category: "tee",
    groups: ["premium", "tee"],
    name: "Comfort Colors 6014",
    subtitle: "Unisex garment-dyed heavyweight long sleeve",
    image: "assets/blanks/printful-753.png",
    cost: 19.62,
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    colorCount: 7,
    colors: ["Black", "Blue Jean", "Grey", "Light Green", "Navy", "Violet", "White"],
    techniques: ["DTG", "embroidery", "DTF"],
    best: "cooler-weather version of the Comfort Colors feel.",
    watch: "cost pushes sale price up fast.",
    tags: ["long sleeve", "garment dyed"],
    sourceUrl: "https://www.printful.com/custom/mens/long-sleeve-shirts/unisex-garment-dyed-heavyweight-long-sleeve-shirt-comfort-colors-6014"
  },
  {
    id: "printful-907",
    provider: "Printful",
    providerId: "907",
    category: "tee",
    groups: ["tee"],
    name: "Comfort Colors 9360",
    subtitle: "Unisex garment-dyed tank top",
    image: "assets/blanks/printful-907.png",
    cost: 18.07,
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    colorCount: 31,
    colors: ["Black", "Blossom", "Blue Jean", "Butter", "Granite", "Ivory", "Pepper", "Seafoam", "Terracotta", "Watermelon"],
    techniques: ["DTG"],
    best: "seasonal or beachy drops where color matters.",
    watch: "expensive for a tank; DTG only.",
    tags: ["tank", "many colors"],
    sourceUrl: "https://www.printful.com/custom/mens/tank-tops/unisex-garment-dyed-tank-top-comfort-colors-9360"
  },
  {
    id: "printful-515",
    provider: "Printful",
    providerId: "515",
    category: "tee",
    groups: ["tee"],
    name: "Shaka Wear SHHTDS",
    subtitle: "Unisex oversized tie-dye t-shirt",
    image: "assets/blanks/printful-515.jpg",
    cost: 18.60,
    sizes: ["S", "M", "L", "XL", "2XL"],
    colorCount: 5,
    colors: ["Black / White", "Classic rainbow", "Milky way", "Navy / White", "Sherbet rainbow"],
    techniques: ["embroidery", "DTF"],
    best: "the only Shaka-branded Printful path I found that fits our current backend.",
    watch: "not the plain max-heavy blank; no normal DTG path.",
    tags: ["shaka", "tie dye", "not max heavy"],
    sourceUrl: "https://www.printful.com/custom/mens/t-shirts/oversized-tie-dye-t-shirt-shaka-wear-shhtds"
  },
  {
    id: "printful-206",
    provider: "Printful",
    providerId: "206",
    category: "hat",
    groups: ["hat"],
    name: "Yupoong 6245CM",
    subtitle: "Classic dad hat",
    image: "assets/blanks/printful-206.jpg",
    cost: 13.75,
    sizes: ["one size"],
    colorCount: 11,
    colors: ["Black", "Cranberry", "Dark Grey", "Green Camo", "Khaki", "Light Blue", "Navy", "Pink", "Spruce", "White"],
    techniques: ["embroidery", "DTF"],
    best: "default dad hat: familiar, flexible, and good for simple front marks.",
    watch: "embroidered detail must stay simple; tiny text is risky.",
    tags: ["hat default", "dad hat"],
    sourceUrl: "https://www.printful.com/custom/embroidered/dad-hats/classic-dad-cap-yupoong-6245cm"
  },
  {
    id: "printful-99",
    provider: "Printful",
    providerId: "99",
    category: "hat",
    groups: ["hat"],
    name: "Yupoong 6089M",
    subtitle: "Classic snapback",
    image: "assets/blanks/printful-99.jpg",
    cost: 16.89,
    sizes: ["one size"],
    colorCount: 21,
    colors: ["Black", "Dark Grey", "Dark Navy", "Green Camo", "Heather Grey", "Maroon", "Natural / Black", "Red", "Silver", "White"],
    techniques: ["embroidery"],
    best: "structured snapback feel for bigger logo energy.",
    watch: "embroidery only in Printful; no full-color print fallback.",
    tags: ["snapback", "structured"],
    sourceUrl: "https://www.printful.com/custom/embroidered/snapbacks/classic-snapback-yupoong-6089m"
  },
  {
    id: "printful-422",
    provider: "Printful",
    providerId: "422",
    category: "hat",
    groups: ["hat", "premium"],
    name: "Richardson 112",
    subtitle: "Snapback trucker cap",
    image: "assets/blanks/printful-422.png",
    cost: 17.89,
    sizes: ["one size"],
    colorCount: 7,
    colors: ["Black", "Black / Charcoal", "Black / White", "Charcoal / Black", "Heather Grey / Black", "Heather Grey / White", "Loden"],
    techniques: ["embroidery"],
    best: "premium trucker option with a known blank name.",
    watch: "not cheap; front embroidery only from the catalog data I saw.",
    tags: ["trucker", "premium hat"],
    sourceUrl: "https://www.printful.com/custom/embroidered/trucker-hats/snapback-trucker-cap-richardson-112"
  },
  {
    id: "printful-252",
    provider: "Printful",
    providerId: "252",
    category: "hat",
    groups: ["hat"],
    name: "Yupoong 6606",
    subtitle: "Retro trucker hat",
    image: "assets/blanks/printful-252.jpg",
    cost: 13.29,
    sizes: ["one size"],
    colorCount: 20,
    colors: ["Black", "Black / White", "Brown / Khaki", "Caramel", "Charcoal", "Cranberry", "Evergreen", "Navy", "Pink", "White"],
    techniques: ["embroidery"],
    best: "cheap trucker lane with lots of colorways.",
    watch: "front embroidery only; mesh-back style is less universal.",
    tags: ["trucker", "good value"],
    sourceUrl: "https://www.printful.com/custom/embroidered/trucker-hats/retro-trucker-cap-yupoong-6606"
  },
  {
    id: "printful-627",
    provider: "Printful",
    providerId: "627",
    category: "hat",
    groups: ["hat"],
    name: "Otto Cap 39-165",
    subtitle: "Foam trucker hat",
    image: "assets/blanks/printful-627.png",
    cost: 12.48,
    sizes: ["one size"],
    colorCount: 13,
    colors: ["Black", "Black / White", "Blue / White", "Hot Pink / White", "Navy", "Red", "Royal / White", "White"],
    techniques: ["embroidery", "DTF"],
    best: "fun cheap hat for loud, graphic, less-serious drops.",
    watch: "foam trucker is a strong look; use intentionally.",
    tags: ["cheapest hat", "foam trucker"],
    sourceUrl: "https://www.printful.com/custom/embroidered/trucker-hats/foam-trucker-hat-otto-cap-39-165"
  },
  {
    id: "printful-396",
    provider: "Printful",
    providerId: "396",
    category: "hat",
    groups: ["hat"],
    name: "Otto Cap 104-1018",
    subtitle: "Distressed dad hat",
    image: "assets/blanks/printful-396.jpg",
    cost: 14.69,
    sizes: ["one size"],
    colorCount: 4,
    colors: ["Black", "Charcoal Grey", "Khaki", "Navy"],
    techniques: ["embroidery", "DTF"],
    best: "worn-in casual look without many decisions.",
    watch: "only four colors and distressing is not subtle.",
    tags: ["dad hat", "distressed"],
    sourceUrl: "https://www.printful.com/custom/embroidered/hats/distressed-dad-hat-otto-cap-104-1018"
  },
  {
    id: "printful-1634",
    provider: "Printful",
    providerId: "1634",
    category: "hat",
    groups: ["hat", "premium"],
    name: "Comfort Colors CCWC0",
    subtitle: "Coastal washed cap",
    image: "assets/blanks/printful-1634.png",
    cost: 18.87,
    sizes: ["one size"],
    colorCount: 12,
    colors: ["Black", "Blue Jean", "Butter", "Chalky Mint", "Crimson", "Granite", "Ivory", "Moss", "Orchid", "Sandstone"],
    techniques: ["DTF"],
    best: "washed Comfort Colors vibe for printed cap ideas.",
    watch: "DTF only in Printful; not the embroidery hat path.",
    tags: ["comfort colors", "printed cap"],
    sourceUrl: "https://www.printful.com/custom/embroidered/dad-hats/coastal-washed-cap-comfort-colors-ccwc0"
  },
  {
    id: "printful-846",
    provider: "Printful",
    providerId: "846",
    category: "hat",
    groups: ["hat", "premium"],
    name: "Richardson 258",
    subtitle: "Classic rope cap",
    image: "assets/blanks/printful-846.png",
    cost: 15.99,
    sizes: ["one size"],
    colorCount: 4,
    colors: ["Black / White", "Kelly / White", "Light Blue / White", "White / Black"],
    techniques: ["DTF", "embroidery"],
    best: "small retro cap drops, especially simple front marks.",
    watch: "only four colorways.",
    tags: ["rope cap", "retro"],
    sourceUrl: "https://www.printful.com/custom/embroidered/snapbacks/classic-rope-cap-richardson-258"
  },
  {
    id: "printful-379",
    provider: "Printful",
    providerId: "379",
    category: "hat",
    groups: ["hat"],
    name: "Big Accessories BX003",
    subtitle: "Bucket hat",
    image: "assets/blanks/printful-379.jpg",
    cost: 15.55,
    sizes: ["one size"],
    colorCount: 3,
    colors: ["Black", "Navy", "White"],
    techniques: ["embroidery", "DTF"],
    best: "good oddball accessory when a tee feels too expected.",
    watch: "limited colors and smaller audience.",
    tags: ["bucket hat"],
    sourceUrl: "https://www.printful.com/custom/embroidered/bucket-hats/bucket-hat-big-accessories-bx003"
  },
  {
    id: "printful-266",
    provider: "Printful",
    providerId: "266",
    category: "hat",
    groups: ["hat"],
    name: "Yupoong 1501KC",
    subtitle: "Cuffed beanie",
    image: "assets/blanks/printful-266.jpg",
    cost: 12.79,
    sizes: ["one size"],
    colorCount: 12,
    colors: ["Baby Pink", "Black", "Brown", "Dark Grey", "Gold", "Heather Grey", "Navy", "Olive", "Red", "White"],
    techniques: ["embroidery"],
    best: "cold-weather logo/object ideas; simple embroidery works well.",
    watch: "seasonal; small design area.",
    tags: ["beanie", "embroidery"],
    sourceUrl: "https://www.printful.com/custom/embroidered/beanies/cuffed-beanie-yupoong-1501kc"
  }
];

const grid = document.querySelector("#blank-grid");
const template = document.querySelector("#blank-template");
const count = document.querySelector("#blank-count");
const buttons = [...document.querySelectorAll("[data-blank-filter]")];

let activeFilter = "all";

const namedColors = new Map([
  ["black", "#111111"],
  ["white", "#f8f5ee"],
  ["navy", "#17213f"],
  ["dark navy", "#121a33"],
  ["blue jean", "#526f88"],
  ["flo blue", "#5aaed2"],
  ["light blue", "#bdd0e9"],
  ["red", "#b93332"],
  ["cranberry", "#7d2230"],
  ["maroon", "#5d1c2a"],
  ["forest green", "#23452a"],
  ["moss", "#68745d"],
  ["olive", "#676d45"],
  ["khaki", "#c3ab7b"],
  ["sand", "#d4c3a2"],
  ["natural", "#eee1cc"],
  ["ivory", "#f3ead4"],
  ["butter", "#f4d46e"],
  ["gold", "#c99b34"],
  ["grey", "#8c8a85"],
  ["gray", "#8c8a85"],
  ["granite", "#54504b"],
  ["charcoal", "#454545"],
  ["washed black", "#2b2927"],
  ["vintage black", "#242321"],
  ["pepper", "#34302b"],
  ["espresso", "#3b241d"],
  ["pink", "#e8a3b4"],
  ["baby pink", "#efbfd0"],
  ["berry", "#8f3157"],
  ["watermelon", "#d95764"],
  ["purple", "#55316e"],
  ["royal", "#1e62b4"],
  ["royal blue", "#1e62b4"]
]);

function hashColor(name) {
  let hash = 0;
  for (const char of name) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 38% 54%)`;
}

function colorForName(name) {
  const lower = name.toLowerCase().replace(/\s*\/\s*.*/, "").trim();
  return namedColors.get(lower) || hashColor(lower);
}

function costLabel(blank) {
  if (blank.costLabel) return blank.costLabel;
  return `from $${blank.cost.toFixed(2)}`;
}

function setFilter(filter) {
  activeFilter = filter;
  for (const button of buttons) {
    const selected = button.dataset.blankFilter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  render();
}

function visibleBlanks() {
  if (activeFilter === "all") return blanks;
  return blanks.filter((blank) => blank.groups.includes(activeFilter) || blank.category === activeFilter);
}

function renderSwatches(target, colors) {
  target.innerHTML = "";
  for (const color of colors.slice(0, 10)) {
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = colorForName(color);
    dot.title = color;
    dot.setAttribute("aria-label", color);
    target.append(dot);
  }
}

function render() {
  const visible = visibleBlanks();
  grid.innerHTML = "";
  count.textContent = `${visible.length} options shown`;

  for (const blank of visible) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".blank-card");
    const imageLink = node.querySelector(".blank-media-link");
    const image = node.querySelector(".blank-image");
    const provider = node.querySelector(".provider-mark");
    const cost = node.querySelector(".blank-cost");
    const name = node.querySelector(".blank-name");
    const subtitle = node.querySelector(".blank-subtitle");
    const sizes = node.querySelector(".blank-sizes");
    const colorCount = node.querySelector(".blank-color-count");
    const techniques = node.querySelector(".blank-techniques");
    const strip = node.querySelector(".color-strip");
    const best = node.querySelector(".blank-best");
    const watch = node.querySelector(".blank-watch");
    const tags = node.querySelector(".blank-tags");
    const source = node.querySelector(".blank-source");

    card.dataset.category = blank.category;
    image.src = new URL(blank.image, import.meta.url).href;
    image.alt = `${blank.name} blank product photo`;
    imageLink.href = blank.sourceUrl;
    provider.textContent = `${blank.provider} ${blank.providerId}`;
    cost.textContent = costLabel(blank);
    name.textContent = blank.name;
    subtitle.textContent = blank.subtitle;
    sizes.textContent = blank.sizes.join(" / ");
    colorCount.textContent = String(blank.colorCount);
    techniques.textContent = blank.techniques.join(" / ");
    best.textContent = blank.best;
    watch.textContent = blank.watch;
    renderSwatches(strip, blank.colors);

    for (const tag of blank.tags) {
      const item = document.createElement("li");
      item.textContent = tag;
      tags.append(item);
    }

    source.href = blank.sourceUrl;
    source.textContent = "open Printful product page";
    grid.append(node);
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => setFilter(button.dataset.blankFilter));
}

render();
