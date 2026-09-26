import { queueEvent } from './analytics';

export type RewardedKind = 'x2' | 'undo-refill' | 'hint-refill' | 'piggy';

export interface AdProvider {
  init(): Promise<void>;
  showRewarded(kind: RewardedKind): Promise<boolean>;
  showInterstitial(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  loadingStart(): void;
  loadingFinished(): void;
  track(event: string, data?: Record<string, string | number>): void;
}

/** Dev/local provider: no real ads, rewarded always succeeds. */
export class LocalProvider implements AdProvider {
  async init(): Promise<void> {}
  async showRewarded(_kind: RewardedKind): Promise<boolean> {
    return true;
  }
  async showInterstitial(): Promise<void> {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  loadingStart(): void {}
  loadingFinished(): void {}
  track(event: string, data?: Record<string, string | number>): void {
    queueEvent(event, data);
  }
}

let provider: AdProvider = new LocalProvider();

export function setAdProvider(p: AdProvider): void {
  provider = p;
}

export function ads(): AdProvider {
  return provider;
}

/** Basic Launch has no playable ads, so its build must not offer ad rewards. */
export function adsEnabled(): boolean {
  return import.meta.env.VITE_PLATFORM !== 'crazygames' || import.meta.env.VITE_CG_LAUNCH === 'full';
}
