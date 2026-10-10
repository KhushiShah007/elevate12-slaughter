import { Cloud, CloudOff, Smartphone } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';
import { Chip } from '../ui/Chip';

/** Says where a screen's data comes from: this phone, or the cloud. */
export function SourceChip({ source }: { source: 'device' | 'cloud' }) {
  const online = useOnline();
  if (source === 'device') {
    return (
      <Chip tone="ok" icon={<Smartphone size={12} />}>
        On-device
      </Chip>
    );
  }
  return online ? (
    <Chip icon={<Cloud size={12} />}>Cloud</Chip>
  ) : (
    <Chip tone="warn" icon={<CloudOff size={12} />}>
      Cloud · offline
    </Chip>
  );
}
