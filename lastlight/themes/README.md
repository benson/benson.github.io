# Lastlight themes

`lastlight.js` is the stable asset contract between game data and art. It gives
every swappable image a logical key, so a future rebrand can replace the full
look without renaming specialists, weapons, maps, gameplay effects, or archive
entries throughout the game.

## Make a new visual theme

1. Copy `lastlight.js` to a new module, preserving the shape of `assets` and all
   logical keys.
2. Change the theme `id`, display `name`, and asset path values. Paths are
   relative to `lastlight/index.html`; keeping art under
   `assets/themes/<theme-id>/` makes complete art packs easy to move or remove.
3. Export the new object through `defineTheme(...)`. Validation will fail fast
   when a key is missing, misspelled, or points to the same image as another key.
4. Register/select the new manifest at the game boundary. Avoid putting theme
   paths back into character, weapon, map, or archive definitions.

Example consumer code:

```js
import { LASTLIGHT_THEME, getThemeAsset } from "./themes/lastlight.js";

const theme = LASTLIGHT_THEME;
const zuriPortrait = getThemeAsset("specialists.zuri", theme);
const glassCannonIcon = getThemeAsset("archive.augments.glassCannon", theme);
```

The archive contract contains 24 images: three events, six squad boons, and 15
augments. `validateTheme(theme)` returns `{ valid, errors, assetCount }` for
editor tooling and tests.
