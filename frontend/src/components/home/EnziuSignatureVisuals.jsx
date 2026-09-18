export function EnziuOrbitMark({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M19 61.5C19 35.819 36.909 17 61.5 17 85.966 17 103 33.298 103 54.5c0 17.32-12.672 30.05-30.5 30.05-14.988 0-25.25-8.903-25.25-20.8 0-9.865 7.086-16.75 16.75-16.75 7.873 0 13.5 4.73 13.5 11.5 0 5.432-3.703 9.25-9 9.25" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="67.5" cy="67.75" r="5.75" fill="currentColor" />
      <path d="M28 94c9.131 6.137 19.526 9 31.5 9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function EnziuJourneyLine({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1120 170"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="enziu-journey-line-shadow"
        d="M10 94C151 15 231 154 380 86c143-65 242-3 341 36 123 49 220-91 389-31"
      />
      <path
        className="enziu-journey-line-path"
        d="M10 94C151 15 231 154 380 86c143-65 242-3 341 36 123 49 220-91 389-31"
      />
    </svg>
  );
}

export function EnziuConstellation({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 620 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="enziu-ai-line" x1="60" y1="50" x2="560" y2="470" gradientUnits="userSpaceOnUse">
          <stop stopColor="#21D6B1" />
          <stop offset=".48" stopColor="#22B7F2" />
          <stop offset="1" stopColor="#FF795E" />
        </linearGradient>
        <radialGradient id="enziu-ai-core">
          <stop stopColor="#D9FFF8" />
          <stop offset=".32" stopColor="#20D6B1" />
          <stop offset="1" stopColor="#087E9D" />
        </radialGradient>
      </defs>
      <path className="enziu-constellation-path" d="M78 352 183 160l126 79 118-151 111 218-160 121-206-14Z" stroke="url(#enziu-ai-line)" strokeWidth="2" strokeDasharray="8 12" />
      <path className="enziu-constellation-path constellation-delay" d="m183 160-11 253 137-174 69 188 49-339" stroke="url(#enziu-ai-line)" strokeWidth="1.5" strokeDasharray="5 14" opacity=".66" />
      <circle cx="78" cy="352" r="8" fill="#FF795E" />
      <circle cx="183" cy="160" r="12" fill="#22B7F2" />
      <circle cx="309" cy="239" r="28" fill="url(#enziu-ai-core)" />
      <circle cx="427" cy="88" r="7" fill="#21D6B1" />
      <circle cx="538" cy="306" r="11" fill="#22B7F2" />
      <circle cx="378" cy="427" r="7" fill="#FF795E" />
      <circle cx="172" cy="413" r="6" fill="#21D6B1" />
      <circle className="enziu-constellation-ring" cx="309" cy="239" r="57" stroke="#7AEBD5" strokeWidth="1.5" />
      <circle className="enziu-constellation-ring constellation-ring-wide" cx="309" cy="239" r="96" stroke="#33B9EC" strokeWidth="1" opacity=".55" />
    </svg>
  );
}
