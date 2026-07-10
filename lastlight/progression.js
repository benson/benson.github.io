export const PROGRESSION_VERSION = 1;
export const MAP_ORDER = ["warehouse", "outskirts", "lab", "beachhead"];
export const DIFFICULTY_ORDER = ["story", "hard", "extreme"];

export const MAP_REQUIREMENTS = {
  warehouse: null,
  outskirts: { map: "warehouse", difficulty: "story" },
  lab: { map: "outskirts", difficulty: "hard" },
  beachhead: { map: "lab", difficulty: "extreme" },
};

export function emptyProgress() {
  return { version: PROGRESSION_VERSION, completed: {} };
}

export function normalizeProgress(value) {
  const progress = emptyProgress();
  for (const map of MAP_ORDER) {
    for (const difficulty of DIFFICULTY_ORDER) {
      if (value?.completed?.[map]?.[difficulty] === true) {
        progress.completed[map] ||= {};
        progress.completed[map][difficulty] = true;
      }
    }
  }
  return progress;
}

export function hasCompleted(progress, map, difficulty) {
  return progress?.completed?.[map]?.[difficulty] === true;
}

export function isMapUnlocked(progress, map) {
  const requirement = MAP_REQUIREMENTS[map];
  return requirement === null || Boolean(requirement && hasCompleted(progress, requirement.map, requirement.difficulty));
}

export function isDifficultyUnlocked(progress, map, difficulty) {
  if (!isMapUnlocked(progress, map)) return false;
  const index = DIFFICULTY_ORDER.indexOf(difficulty);
  if (index <= 0) return index === 0;
  return hasCompleted(progress, map, DIFFICULTY_ORDER[index - 1]);
}

export function completeRun(current, map, difficulty) {
  const progress = normalizeProgress(current);
  if (!MAP_ORDER.includes(map) || !DIFFICULTY_ORDER.includes(difficulty)) return { progress, unlocks: [] };

  const mapsBefore = new Set(MAP_ORDER.filter((id) => isMapUnlocked(progress, id)));
  const difficultiesBefore = new Set(DIFFICULTY_ORDER.filter((id) => isDifficultyUnlocked(progress, map, id)));
  progress.completed[map] ||= {};
  progress.completed[map][difficulty] = true;

  const unlocks = [];
  for (const id of MAP_ORDER) if (!mapsBefore.has(id) && isMapUnlocked(progress, id)) unlocks.push({ type: "map", map: id });
  for (const id of DIFFICULTY_ORDER) {
    if (!difficultiesBefore.has(id) && isDifficultyUnlocked(progress, map, id)) unlocks.push({ type: "difficulty", map, difficulty: id });
  }
  return { progress, unlocks };
}
