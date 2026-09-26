const QUEUE_KEY = 'cozy-solitaire-analytics';
const QUEUE_MAX = 200;

export interface AnalyticsEvent {
  t: number;
  event: string;
  data?: Record<string, string | number>;
}

export function queueEvent(event: string, data?: Record<string, string | number>): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    queue.push({ t: Date.now(), event, data });
    while (queue.length > QUEUE_MAX) queue.shift();
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // analytics must never break the game
  }
  if (import.meta.env.DEV) console.debug('[analytics]', event, data ?? '');
}

export function analyticsQueue(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as AnalyticsEvent[];
  } catch {
    return [];
  }
}
