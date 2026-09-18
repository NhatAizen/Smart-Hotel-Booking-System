import { useState } from "react";

import { resolveAvatarUrl } from "../../utils/avatar";

export default function AvatarImage({
  source,
  fallback = null,
  alt = "Ảnh đại diện",
  onError,
  ...imageProps
}) {
  const resolvedSource = resolveAvatarUrl(source);
  const [failedSource, setFailedSource] = useState(null);

  if (!resolvedSource || failedSource === resolvedSource) {
    return fallback;
  }

  return (
    <img
      {...imageProps}
      src={resolvedSource}
      alt={alt}
      onError={(event) => {
        setFailedSource(resolvedSource);
        onError?.(event);
      }}
    />
  );
}
