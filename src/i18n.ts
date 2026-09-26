import en from '../strings/en.json';

const dict: Record<string, string> = en;

export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}
