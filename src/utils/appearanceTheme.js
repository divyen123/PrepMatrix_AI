export function resolveEffectiveDarkMode(preferredDarkMode, hasBackgroundImage = false) {
  return Boolean(preferredDarkMode || hasBackgroundImage);
}
