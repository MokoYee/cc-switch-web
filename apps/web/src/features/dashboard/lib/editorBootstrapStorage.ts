export type DashboardEditorSelectionKind =
  | "provider"
  | "app-quota"
  | "workspace"
  | "session"
  | "prompt-template"
  | "skill";

const STORAGE_KEY_PREFIX = "cc-switch-web.dashboard.editor-selection";

const buildStorageKey = (kind: DashboardEditorSelectionKind): string =>
  `${STORAGE_KEY_PREFIX}.${kind}`;

const getSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const readDashboardEditorSelection = (
  kind: DashboardEditorSelectionKind
): string | null => {
  const storage = getSessionStorage();
  if (storage === null) {
    return null;
  }

  const value = storage.getItem(buildStorageKey(kind));
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const writeDashboardEditorSelection = (
  kind: DashboardEditorSelectionKind,
  id: string
): void => {
  const storage = getSessionStorage();
  if (storage === null) {
    return;
  }

  const normalized = id.trim();
  if (normalized.length === 0) {
    storage.removeItem(buildStorageKey(kind));
    return;
  }

  storage.setItem(buildStorageKey(kind), normalized);
};
