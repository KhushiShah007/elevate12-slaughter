import { useState, type ReactNode } from 'react';
import { pastelBg, type Pastel } from '../../design/tokens';

/** Polaroid photo. Shows the photo when there is one; a pastel square with an icon otherwise. */
export function Polaroid({ pastel, caption, sub, icon, image, tilt = 0, className = 'w-36' }: {
  pastel: Pastel;
  caption: string;
  sub?: string;
  icon?: ReactNode;
  image?: { src: string; alt: string };
  tilt?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = image && !failed;
  return (
    <figure className={`shrink-0 bg-paper p-2 pb-3 shadow-card ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      <div className={`grain grid aspect-square place-items-center overflow-hidden ${pastelBg[pastel]} text-ink/50`}>
        {showImage ? (
          <img src={image.src} alt={image.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </div>
      <figcaption className="mt-2 font-display text-sm italic leading-snug text-espresso">
        {caption}
        {sub && <span className="block font-body text-[0.625rem] font-semibold uppercase not-italic tracking-widest text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}
