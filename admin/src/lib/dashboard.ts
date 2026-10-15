import 'server-only';

import { apiGetAuthed, type ApiResult } from './api';

/** The shape of `/admin/v1/dashboard`. Every nullable field is a real gap. */
export interface Dashboard {
  generatedAt: string;
  counters: {
    sev0: number;
    failedToday: number;
    moderationQueue: number;
    approvals: number;
  };
  overdue: {
    capsuleId: string;
    unlockAt: string;
    overdueSeconds: number;
    timezone: string | null;
    attempts: number;
    lastError: string | null;
  }[];
  kpis: {
    deliverySuccess30d: { value: number | null; previous: number | null };
    capsulesDueToday: {
      value: number;
      sent: number;
      queued: number;
      failed: number;
    };
    activeUsers: { value: number; previous: number };
    mrr: { value: number; currency: string } | null;
  };
  deliveries24h: {
    hour: string;
    delivered: number;
    retrying: number;
    failed: number;
  }[];
  channels: { channel: string; successPct: number | null }[];
  unlockLoad7d: { day: string; count: number }[];
  timeline: {
    id: string;
    at: string;
    actorType: string;
    actor: string | null;
    action: string;
    resourceType: string;
  }[];
  tasks: {
    id: string;
    kind: string;
    reason: string;
    requestedBy: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
  health: {
    scheduler: { pending: number; dead: number; lagSeconds: number | null };
    media: { pending: number; processing: number; failed: number };
    apiP95Ms: number | null;
    replicaLagSeconds: number | null;
    email: string | null;
    push: string | null;
  };
}

export function loadDashboard(token: string): Promise<ApiResult<Dashboard>> {
  return apiGetAuthed<Dashboard>('/api/v1/admin/v1/dashboard', token);
}

/** `1284` → `1,284`; `1020000` → `1.02M`. The comp's number formatting. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

/** `263` → `4m 23s`. Durations read as durations, not as decimals. */
export function duration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The delta pill: `+0.04 pt`, `+2.3%`, or nothing when there is no baseline. */
export function delta(
  current: number | null,
  previous: number | null,
  unit: 'pt' | '%',
): { label: string; up: boolean } | null {
  if (current === null || previous === null || previous === 0) return null;

  const diff = unit === 'pt' ? current - previous : ((current - previous) / previous) * 100;
  const rounded = Math.round(diff * 100) / 100;
  if (rounded === 0) return null;

  return {
    label: `${rounded > 0 ? '+' : ''}${rounded}${unit === 'pt' ? ' pt' : '%'}`,
    up: rounded > 0,
  };
}
