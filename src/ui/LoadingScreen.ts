const screen = document.getElementById('loading-screen');
const meter = screen?.querySelector<HTMLElement>('.loading-meter');
const fill = document.getElementById('loading-fill');
const status = document.getElementById('loading-status');
const percent = document.getElementById('loading-percent');

export function setLoadingProgress(progress: number, message: string): void {
  if (!screen || !meter || !fill || !status || !percent) return;
  const value = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  screen.classList.add('is-tracking');
  fill.style.width = `${value}%`;
  status.textContent = message;
  percent.textContent = `${value}%`;
  meter.setAttribute('aria-valuenow', String(value));
  meter.setAttribute('aria-valuetext', `${message} ${value}%`);
}

export function finishLoading(): void {
  if (!screen || screen.classList.contains('is-complete')) return;
  screen.classList.add('is-complete');
  window.setTimeout(() => screen.remove(), 400);
}
