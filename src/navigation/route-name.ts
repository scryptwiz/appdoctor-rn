/**
 * Best-effort active route name from React Navigation state tree.
 * Avoids a hard dependency on `@react-navigation/native` types at runtime.
 */
export function getActiveRouteName(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const s = state as {
    index?: number;
    routes?: Array<{ name?: string; state?: unknown }>;
  };
  if (!Array.isArray(s.routes) || typeof s.index !== "number") return undefined;
  const route = s.routes[s.index];
  if (!route || typeof route !== "object") return undefined;
  if (route.state !== undefined) return getActiveRouteName(route.state);
  return typeof route.name === "string" ? route.name : undefined;
}
