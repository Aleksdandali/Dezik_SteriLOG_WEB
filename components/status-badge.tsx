import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const orderStatusMap: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Очікує',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  confirmed: {
    label: 'Підтверджено',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  canceled: {
    label: 'Скасовано',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
  },
};

const cycleResultMap: Record<string, { label: string; className: string }> = {
  success: {
    label: 'Успішно',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  fail: {
    label: 'Невдало',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
  },
};

interface StatusBadgeProps {
  status: string;
  type?: 'order' | 'cycle';
}

export function StatusBadge({ status, type = 'order' }: StatusBadgeProps) {
  const map = type === 'order' ? orderStatusMap : cycleResultMap;
  const config = map[status];

  if (!config) {
    return <Badge variant="outline">{status}</Badge>;
  }

  return (
    <Badge className={cn('font-medium', config.className)} variant="secondary">
      {config.label}
    </Badge>
  );
}
