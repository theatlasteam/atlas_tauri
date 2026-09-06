export const COMPASS_MODELS = [
  { id: "glm-5.3-flash", label: "GLM 5.3 Flash" },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "qwen3.6-35b", label: "Qwen 3.6 35B" },
] as const;

export type CompassModelId = (typeof COMPASS_MODELS)[number]["id"];

const STORAGE_KEY = "atlas.compassModel";

export function isCompassModel(id: string): id is CompassModelId {
  return COMPASS_MODELS.some((m) => m.id === id);
}

export function loadCompassModel(): CompassModelId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isCompassModel(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "kimi-k2.7-code";
}

export function saveCompassModel(id: CompassModelId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
