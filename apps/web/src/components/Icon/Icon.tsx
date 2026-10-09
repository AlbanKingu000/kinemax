import { ICON_PATHS, type IconName } from './icon-paths';

interface IconProps {
  name: IconName;
  /** Size in px (width and height). */
  size?: number;
  /** Accessible name. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
  className?: string;
}

/** Inline SVG icon in the current text color. */
export function Icon({ name, size = 20, label, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
