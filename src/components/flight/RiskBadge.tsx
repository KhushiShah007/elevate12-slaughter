import type { RiskLevel } from '../../types';
import { Chip } from '../ui/Chip';

const labels: Record<RiskLevel, string> = {
  ok: 'Connection safe',
  warn: 'Tight connection',
  bad: 'Connection at risk',
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Chip tone={level} dot>
      {labels[level]}
    </Chip>
  );
}
