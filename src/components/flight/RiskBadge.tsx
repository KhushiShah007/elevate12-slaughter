import type { RiskLevel } from '../../types';
import { Chip } from '../ui/Chip';
import { useT, type MessageKey } from '../../i18n';

const labels: Record<RiskLevel, MessageKey> = { ok: 'risk.ok', warn: 'risk.warn', bad: 'risk.bad' };

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useT();
  return (
    <Chip tone={level} dot>
      {t(labels[level])}
    </Chip>
  );
}
