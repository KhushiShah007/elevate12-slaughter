import { motion } from 'framer-motion';
import { collagePlaces } from '../../data/photos';
import { Polaroid } from '../cards/Polaroid';

const COLUMNS = 3;
type CollagePlace = ReturnType<typeof collagePlaces>[number];

function Column({ places, duration, offset }: { places: CollagePlace[]; duration: number; offset: number }) {
  // The list is doubled so the strip can loop seamlessly by moving up exactly half its height.
  const strip = [...places, ...places];
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden" style={{ marginTop: offset }}>
      <motion.div
        className="flex flex-col items-center gap-4"
        animate={{ y: ['0%', '-50%'] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        {strip.map((p, i) => (
          <Polaroid
            key={`${p.place}-${i}`}
            pastel={p.pastel}
            caption={p.place}
            sub={p.country}
            tilt={((i * 7) % 9) - 4}
            className="w-[92%]"
            image={{ src: p.src, alt: '' }}
          />
        ))}
      </motion.div>
    </div>
  );
}

/** Background wall of real destination photos (Wikimedia Commons), drifting slowly upward. */
export function PolaroidCollage() {
  const places = collagePlaces(21);
  const columns = Array.from({ length: COLUMNS }, (_, c) => places.filter((_, i) => i % COLUMNS === c));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex gap-3 overflow-hidden px-3">
      {columns.map((places, c) => (
        <Column key={c} places={places} duration={60 + c * 14} offset={c === 1 ? -80 : c * 30} />
      ))}
    </div>
  );
}
