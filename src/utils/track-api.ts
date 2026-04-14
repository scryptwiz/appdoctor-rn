import type { AppDoctorClient } from "../core/client.js";

/**
 * Wraps an async call and emits an `api_request` event with a synthetic URL label.
 */
export async function trackApi<T>(
  client: AppDoctorClient,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    client.emit({
      name: "api_request",
      method: "TRACK",
      url: label,
      status: 200,
      durationMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (e) {
    client.emit({
      name: "api_request",
      method: "TRACK",
      url: label,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
