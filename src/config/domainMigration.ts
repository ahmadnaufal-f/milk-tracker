export const DEFAULT_MIGRATION_DESTINATION = 'https://pump.arkaes.dev';
export const DEFAULT_MIGRATION_OLD_ORIGIN = 'https://pump.a-naufal.dev';
export const DEFAULT_MIGRATION_RETIREMENT_DATE = '2026-11-10';
export const DEFAULT_MIGRATION_CAMPAIGN_ID = 'milk-tracker-domain-2026';

export interface DomainMigrationConfig {
  campaignId: string;
  enabled: boolean;
  destinationReady: boolean;
  oldOrigins: string[];
  destinationOrigin: string | null;
  retirementDate: string | null;
}

type MigrationEnv = Pick<
  ImportMetaEnv,
  | 'VITE_DOMAIN_MIGRATION_ENABLED'
  | 'VITE_DOMAIN_MIGRATION_READY'
  | 'VITE_DOMAIN_MIGRATION_OLD_ORIGINS'
  | 'VITE_DOMAIN_MIGRATION_DESTINATION'
  | 'VITE_DOMAIN_MIGRATION_RETIREMENT_DATE'
  | 'VITE_DOMAIN_MIGRATION_CAMPAIGN_ID'
>;

function parseFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function parseDateOnly(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate;
}

export function getDomainMigrationConfig(env: MigrationEnv = import.meta.env): DomainMigrationConfig {
  const destinationOrigin = parseHttpsOrigin(
    env.VITE_DOMAIN_MIGRATION_DESTINATION?.trim() || DEFAULT_MIGRATION_DESTINATION,
  );
  const oldOrigins = (env.VITE_DOMAIN_MIGRATION_OLD_ORIGINS ?? DEFAULT_MIGRATION_OLD_ORIGIN)
    .split(',')
    .map(parseHttpsOrigin)
    .filter((origin): origin is string => origin !== null);

  return {
    campaignId: env.VITE_DOMAIN_MIGRATION_CAMPAIGN_ID?.trim() || DEFAULT_MIGRATION_CAMPAIGN_ID,
    enabled: parseFlag(env.VITE_DOMAIN_MIGRATION_ENABLED),
    destinationReady: parseFlag(env.VITE_DOMAIN_MIGRATION_READY),
    oldOrigins: [...new Set(oldOrigins)],
    destinationOrigin,
    retirementDate: parseDateOnly(
      env.VITE_DOMAIN_MIGRATION_RETIREMENT_DATE || DEFAULT_MIGRATION_RETIREMENT_DATE,
    ),
  };
}

function currentOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

export function isOldMigrationOrigin(
  origin: string | undefined = currentOrigin(),
  config: DomainMigrationConfig = getDomainMigrationConfig(),
): boolean {
  if (!config.enabled || !origin) return false;
  const normalizedOrigin = parseHttpsOrigin(origin);
  return (
    normalizedOrigin !== null &&
    normalizedOrigin !== config.destinationOrigin &&
    !config.oldOrigins.includes(config.destinationOrigin || '') &&
    config.oldOrigins.includes(normalizedOrigin)
  );
}

export function isMigrationDestinationAvailable(
  config: DomainMigrationConfig = getDomainMigrationConfig(),
  origin: string | undefined = currentOrigin(),
): boolean {
  if (
    !config.enabled ||
    !config.destinationReady ||
    !config.destinationOrigin ||
    config.oldOrigins.length === 0 ||
    config.oldOrigins.includes(config.destinationOrigin)
  ) return false;
  const normalizedOrigin = origin ? parseHttpsOrigin(origin) : null;
  return normalizedOrigin !== null && config.oldOrigins.includes(normalizedOrigin);
}

export function isDomainMigrationActive(
  origin: string | undefined = currentOrigin(),
  config: DomainMigrationConfig = getDomainMigrationConfig(),
): boolean {
  return isOldMigrationOrigin(origin, config);
}

export function formatMigrationRetirementDate(date: string | null, locale = 'en-US'): string | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
