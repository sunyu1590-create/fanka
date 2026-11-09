"use client";
import { useState } from "react";

export default function ProgressiveImage({ lowSrc, src, alt, onHighReady, onHighError }: { lowSrc: string; src: string; alt: string; onHighReady?: () => void; onHighError?: () => void }) {
  const [highReady, setHighReady] = useState(false);
  const hasHigherResolution = Boolean(src && src !== lowSrc);
  return (
    <div className="progressive-image-stack">
      <img className="progressive-image-low" src={lowSrc || src} alt={alt} decoding="async" onLoad={!hasHigherResolution ? onHighReady : undefined} onError={!hasHigherResolution ? onHighError : undefined} />
      {hasHigherResolution && (
        <img
          className={`progressive-image-high${highReady ? " is-ready" : ""}`}
          src={src}
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => { setHighReady(true); onHighReady?.(); }}
          onError={onHighError}
        />
      )}
    </div>
  );
}
