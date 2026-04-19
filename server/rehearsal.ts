let rehearsalMode = false;

export function getRehearsalMode() {
  return { enabled: rehearsalMode };
}

export function isRehearsalMode() {
  return rehearsalMode;
}

export function setRehearsalMode(enabled: boolean) {
  rehearsalMode = enabled;
  return getRehearsalMode();
}
