import { AdProvider, RewardedKind } from './AdProvider';
import { queueEvent } from './analytics';

interface CgAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CgModules {
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    sdkGameLoadingStart(): void;
    sdkGameLoadingStop(): void;
    happytime(): void;
  };
  ad: {
    requestAd(type: 'rewarded' | 'midgame', callbacks: CgAdCallbacks): void;
    hasAdblock(): boolean;
  };
}

type CgPartial = Partial<CgModules>;

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v2.js';

function rawSdk(): CgPartial | null {
  return (window as unknown as { CrazyGames?: { SDK?: CgPartial } }).CrazyGames?.SDK ?? null;
}

/** SDK bootstrap exposes game/ad modules asynchronously after the script loads. */
function modules(): CgModules | null {
  const s = rawSdk();
  return s && s.game && s.ad ? (s as CgModules) : null;
}

function waitForModules(timeoutMs: number): Promise<CgModules | null> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const m = modules();
      if (m || Date.now() - started > timeoutMs) resolve(m);
      else window.setTimeout(tick, 100);
    };
    tick();
  });
}

function loadScript(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    const timer = window.setTimeout(() => reject(new Error('sdk timeout')), timeoutMs);
    el.src = url;
    el.async = true;
    el.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('sdk load failed'));
    };
    document.head.appendChild(el);
  });
}

export class CrazyGamesProvider implements AdProvider {
  private scriptLoaded = false;
  private pending: ((m: CgModules) => void)[] = [];

  async init(): Promise<void> {
    if (!rawSdk()) {
      try {
        await loadScript(SDK_URL, 6000);
      } catch {
        this.scriptLoaded = false;
        return;
      }
    }
    this.scriptLoaded = true;
    const m = await waitForModules(5000);
    if (m) this.flush(m);
  }

  /** Calls made before the SDK modules exist are buffered and replayed after init. */
  private call(fn: (m: CgModules) => void): void {
    const m = modules();
    if (m) {
      fn(m);
      return;
    }
    if (this.pending.length < 20) this.pending.push(fn);
  }

  private flush(m: CgModules): void {
    const queue = this.pending;
    this.pending = [];
    for (const fn of queue) fn(m);
  }

  async showRewarded(_kind: RewardedKind): Promise<boolean> {
    if (!this.scriptLoaded) return false;
    const m = await waitForModules(3000);
    if (!m) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      try {
        m.ad.requestAd('rewarded', {
          adStarted: () => {},
          adFinished: () => done(true),
          adError: () => done(false),
        });
      } catch {
        done(false);
      }
      window.setTimeout(() => done(false), 30000);
    });
  }

  async showInterstitial(): Promise<void> {
    if (!this.scriptLoaded) return;
    const m = await waitForModules(2000);
    if (!m) return;
    try {
      m.ad.requestAd('midgame', { adStarted: () => {}, adFinished: () => {}, adError: () => {} });
    } catch {
      // interstitials are best-effort; never block the game loop
    }
  }

  gameplayStart(): void {
    this.call((m) => m.game.gameplayStart());
  }

  gameplayStop(): void {
    this.call((m) => m.game.gameplayStop());
  }

  loadingStart(): void {
    this.call((m) => m.game.sdkGameLoadingStart());
  }

  loadingFinished(): void {
    this.call((m) => m.game.sdkGameLoadingStop());
  }

  track(event: string, data?: Record<string, string | number>): void {
    queueEvent(event, data);
  }
}
