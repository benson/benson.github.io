// groceries-api — KV-backed shopping list. fully open (personal use), CORS *.
// single KV key holds the whole list; every write is read-modify-write.

const KEY = 'groceries';

// store-section order is the canonical default. clients may reorder locally.
const SECTIONS = [
  'produce',
  'bakery',
  'meat & seafood',
  'dairy & eggs',
  'frozen',
  'pantry & canned',
  'snacks',
  'beverages',
  'household',
  'personal care',
  'other',
];

// substring -> section. first match wins, longer/more-specific keys first.
const KEYWORDS = [
  ['produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berry', 'strawberr', 'blueberr', 'raspberr', 'melon', 'avocado', 'tomato', 'potato', 'onion', 'garlic', 'ginger', 'lettuce', 'spinach', 'kale', 'carrot', 'celery', 'cucumber', 'bell pepper', 'peppers', 'jalapeno', 'jalapeño', 'broccoli', 'cauliflower', 'zucchini', 'squash', 'mushroom', 'corn', 'peas', 'bean sprout', 'cilantro', 'parsley', 'basil', 'herb', 'salad', 'cabbage', 'asparagus', 'pear', 'peach', 'plum', 'cherry', 'mango', 'pineapple', 'kiwi', 'fruit', 'veggie', 'scallion', 'shallot', 'radish', 'beet', 'leek', 'sweet potato', 'eggplant', 'yam']],
  ['bakery', ['bread', 'bagel', 'baguette', 'roll', 'bun', 'croissant', 'muffin', 'tortilla', 'pita', 'naan', 'cake', 'pastry', 'donut', 'doughnut', 'sourdough', 'brioche', 'ciabatta']],
  ['meat & seafood', ['chicken', 'beef', 'pork', 'steak', 'ground beef', 'ground turkey', 'turkey', 'bacon', 'sausage', 'ham', 'salami', 'pepperoni', 'lamb', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'tilapia', 'crab', 'lobster', 'scallop', 'meat', 'ribs', 'chop', 'mince', 'deli', 'hot dog', 'brat']],
  ['dairy & eggs', ['milk', 'egg', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'sour cream', 'cottage', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'ricotta', 'half and half', 'half-and-half', 'creamer', 'kefir', 'oat milk', 'almond milk', 'soy milk']],
  ['frozen', ['frozen', 'ice cream', 'popsicle', 'pizza', 'fries', 'waffle', 'frozen veg', 'tater tot', 'ice']],
  ['pantry & canned', ['rice', 'pasta', 'noodle', 'flour', 'sugar', 'salt', 'oil', 'olive oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'soy sauce', 'broth', 'stock', 'canned', 'soup', 'cereal', 'oat', 'oatmeal', 'honey', 'syrup', 'peanut butter', 'jam', 'jelly', 'spice', 'baking', 'yeast', 'lentil', 'chickpea', 'bean', 'tomato sauce', 'salsa', 'spaghetti', 'taco', 'cumin', 'paprika', 'cinnamon', 'vanilla', 'stock cube', 'bouillon', 'coconut milk', 'tahini', 'spread', 'nutella']],
  ['snacks', ['chip', 'crisp', 'cracker', 'cookie', 'candy', 'chocolate', 'pretzel', 'popcorn', 'nut', 'almond', 'cashew', 'granola bar', 'snack', 'gum', 'trail mix', 'jerky', 'fruit snack', 'biscuit']],
  ['beverages', ['water', 'soda', 'coke', 'pepsi', 'orange juice', 'apple juice', 'grape juice', 'juice', 'coffee', 'tea', 'beer', 'wine', 'seltzer', 'sparkling', 'gatorade', 'energy drink', 'kombucha', 'lemonade', 'cola', 'drink', 'la croix']],
  ['household', ['paper towel', 'toilet paper', 'tissue', 'napkin', 'trash bag', 'garbage bag', 'foil', 'plastic wrap', 'cling film', 'ziploc', 'detergent', 'dish soap', 'dishwasher', 'cleaner', 'bleach', 'sponge', 'laundry', 'fabric softener', 'light bulb', 'battery', 'candle', 'air freshener', 'paper plate', 'cup', 'straw', 'match']],
  ['personal care', ['shampoo', 'conditioner', 'soap', 'body wash', 'toothpaste', 'toothbrush', 'floss', 'deodorant', 'razor', 'shaving', 'lotion', 'sunscreen', 'tampon', 'pad', 'q-tip', 'cotton', 'band-aid', 'bandage', 'vitamin', 'medicine', 'ibuprofen', 'advil', 'tylenol', 'cough', 'lip balm', 'mouthwash', 'makeup', 'hand sanitizer', 'diaper', 'wipes']],
];

// match a keyword at a word boundary so 'oil' doesn't match 'toilet' and
// 'tea' doesn't match 'steak', while still matching plurals ('apple' -> 'apples').
function matchesWord(text, kw) {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + esc, 'i').test(text);
}

// longest matching keyword wins, so 'peanut butter' beats 'butter' and
// 'ice cream' beats 'cream'. ties go to the earlier (more upstream) section.
function guessSection(name) {
  const n = (name || '').toLowerCase();
  let best = 'other';
  let bestLen = 0;
  for (const [section, words] of KEYWORDS) {
    for (const w of words) {
      if (w.length > bestLen && matchesWord(n, w)) {
        best = section;
        bestLen = w.length;
      }
    }
  }
  return best;
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function genId() {
  return crypto.randomUUID().slice(0, 8);
}

async function getList(env) {
  const items = await env.LIST.get(KEY, 'json');
  return Array.isArray(items) ? items : [];
}

async function putList(env, items) {
  await env.LIST.put(KEY, JSON.stringify(items));
  return items;
}

// turn free text into individual item names: split on commas, newlines, " and "
function parseNames(input) {
  const names = [];
  const push = (s) => {
    const t = (s || '').trim().replace(/\s+/g, ' ');
    if (t) names.push(t.slice(0, 80));
  };
  if (Array.isArray(input)) {
    input.forEach(push);
  } else if (typeof input === 'string') {
    input
      .split(/\n|,|;|•|\band\b/i)
      .forEach(push);
  }
  return names;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (request.method === 'GET' && (path === '/list' || path === '/')) {
        return json({ items: await getList(env), sections: SECTIONS });
      }

      if (request.method === 'POST' && path === '/add') {
        const body = await request.json().catch(() => ({}));
        const names = parseNames(body.names ?? body.name ?? body.text);
        if (!names.length) return json({ error: 'no item name provided' }, 400);
        const items = await getList(env);
        const added = [];
        for (const name of names) {
          const item = {
            id: genId(),
            name,
            section: SECTIONS.includes(body.section) ? body.section : guessSection(name),
            checked: false,
            addedAt: new Date().toISOString(),
          };
          items.push(item);
          added.push(item);
        }
        await putList(env, items);
        return json({ items, added });
      }

      if (request.method === 'POST' && path === '/toggle') {
        const { id } = await request.json().catch(() => ({}));
        const items = await getList(env);
        const it = items.find((i) => i.id === id);
        if (!it) return json({ error: 'not found' }, 404);
        it.checked = !it.checked;
        await putList(env, items);
        return json({ items });
      }

      if (request.method === 'POST' && path === '/move') {
        const { id, section } = await request.json().catch(() => ({}));
        if (!SECTIONS.includes(section)) return json({ error: 'bad section' }, 400);
        const items = await getList(env);
        const it = items.find((i) => i.id === id);
        if (!it) return json({ error: 'not found' }, 404);
        it.section = section;
        await putList(env, items);
        return json({ items });
      }

      if (request.method === 'POST' && path === '/rename') {
        const { id, name } = await request.json().catch(() => ({}));
        const clean = (name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        if (!clean) return json({ error: 'empty name' }, 400);
        const items = await getList(env);
        const it = items.find((i) => i.id === id);
        if (!it) return json({ error: 'not found' }, 404);
        it.name = clean;
        await putList(env, items);
        return json({ items });
      }

      if (request.method === 'POST' && path === '/remove') {
        const { id } = await request.json().catch(() => ({}));
        const items = (await getList(env)).filter((i) => i.id !== id);
        await putList(env, items);
        return json({ items });
      }

      if (request.method === 'POST' && path === '/clear') {
        await putList(env, []);
        return json({ items: [] });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  },
};
