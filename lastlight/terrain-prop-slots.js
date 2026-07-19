// Deterministic placement envelopes for authored terrain props. These broad
// rectangles are layout inputs only; collision always comes from the alpha
// mask of each prop image after its exact render transform is applied.
export const TERRAIN_PROP_SLOTS = Object.freeze([
  [-1450,-840,360,140],[-1040,-1040,170,260],[-540,-920,310,90],[620,-1050,420,150],[1250,-760,220,330],
  [-1570,650,300,220],[-950,880,430,105],[-220,1030,280,110],[580,850,180,260],[1130,790,390,130],
  [-1640,-170,180,300],[1480,-130,150,360],[-640,280,220,80],[720,-300,260,86],
].map((slot) => Object.freeze(slot)));
