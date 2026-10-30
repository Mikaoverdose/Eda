import { getLocale } from "@shared/i18n";
export function formatDateTime(value: string | number): string {
  return new Date(value).toLocaleString(getLocale());
}
