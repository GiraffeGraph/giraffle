interface GraphIconProps {
  size?: number;
}

export function GraphIcon({ size = 20 }: GraphIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="17" r="2.1" />
      <circle cx="12" cy="7" r="2.1" />
      <circle cx="18" cy="13" r="2.1" />
      <path d="M7.8 15.9 10.2 8.2" />
      <path d="M13.9 8.5 16.4 11.5" />
      <path d="M8 16.2 15.7 14" />
    </svg>
  );
}
