import { DIRECTIONAL_ICONS, ICONS, type IconName } from '@ariana-reports/core';

/** Line icon from the shared icon set. Decorative: give the parent control an accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`ar-icon${DIRECTIONAL_ICONS.has(name) ? ' ar-icon-flip' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
