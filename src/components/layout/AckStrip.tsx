import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { AckButton, needsAck, useNotices } from '../../screens/me/Notifications';

/** Urgent alert waiting for Acknowledge: shown on every in-app screen. */
export function AckStrip() {
  const { data, reload } = useNotices(30_000);
  const n = data?.notifications.find(needsAck);
  if (!n) return null;
  return (
    <div role="alert" className="sticky top-12 z-20 mx-gutter mb-2 flex items-center gap-3 rounded-md border border-bad/30 bg-paper px-3 py-2 shadow-lift">
      <BellRing size={18} className="shrink-0 text-bad" />
      <Link to="/notifications" className="min-w-0 flex-1 text-sm">
        <span className="block truncate font-medium text-ink">{n.title}</span>
        <span className="block truncate text-xs text-muted">{n.body}</span>
      </Link>
      <AckButton id={n.id} onDone={reload} />
    </div>
  );
}
