import { isMessageKey, t, type MessageKey } from "@phoenix/shared";
import { ApiFailure, NetworkFailure } from "./api";

/** The text for an error from the API or the network: always Italian from the catalog. */
export function errorText(error: unknown): string {
  if (error instanceof NetworkFailure) return t("ui.network-error");
  const key: string = error instanceof ApiFailure ? error.key : "errors.unavailable";
  const known: MessageKey = isMessageKey(key) ? key : "errors.unavailable";
  return t(known);
}
