import { Cloud, CloudOff, Smartphone } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';
import { Chip } from '../ui/Chip';
import { useT } from '../../i18n';

/** Says where a screen's data comes from: this phone, or the cloud. */
export function SourceChip({ source }: { source: 'device' | 'cloud' }) {
  const online = useOnline();
  const { t } = useT();
  if (source === 'device') {
    return (
      <Chip tone="ok" icon={<Smartphone size={12} />}>
        {t('common.onDevice')}
      </Chip>
    );
  }
  return online ? (
    <Chip icon={<Cloud size={12} />}>{t('common.cloud')}</Chip>
  ) : (
    <Chip tone="warn" icon={<CloudOff size={12} />}>
      {t('common.cloudOffline')}
    </Chip>
  );
}
