import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HomeScene } from './scenes/HomeScene';
import { ads, setAdProvider } from './platform/AdProvider';
import { CrazyGamesProvider } from './platform/CrazyGamesProvider';
import { queueEvent } from './platform/analytics';

if (import.meta.env.VITE_PLATFORM === 'crazygames') setAdProvider(new CrazyGamesProvider());

const sessionStartedAt = Date.now();
queueEvent('session_start', { platform: import.meta.env.VITE_PLATFORM ?? 'local' });
window.addEventListener('pagehide', () => {
  queueEvent('session_end', { durationSecs: Math.round((Date.now() - sessionStartedAt) / 1000) });
});

ads().loadingStart();
void ads().init();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2b3a2e',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  input: { activePointers: 1 },
  render: { antialias: true, powerPreference: 'high-performance' },
  disableContextMenu: true,
  scene: [BootScene, GameScene, HomeScene],
});

// dev-only handle for automated UI checks; stripped from production builds
if (import.meta.env.DEV) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
  void import('./app').then((app) => {
    (window as unknown as { __app?: typeof app }).__app = app;
  });
}
