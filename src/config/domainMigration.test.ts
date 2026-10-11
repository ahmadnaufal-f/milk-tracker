import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATION_CAMPAIGN_ID,
  DEFAULT_MIGRATION_DESTINATION,
  DEFAULT_MIGRATION_OLD_ORIGIN,
  DEFAULT_MIGRATION_RETIREMENT_DATE,
  getDomainMigrationConfig,
  isMigrationDestinationAvailable,
  isOldMigrationOrigin,
} from './domainMigration';

describe('domain migration configuration', () => {
  it('defaults to disabled with the supplied old/new origins and date', () => {
    const config = getDomainMigrationConfig({});

    expect(config).toMatchObject({
      campaignId: DEFAULT_MIGRATION_CAMPAIGN_ID,
      enabled: false,
      destinationReady: false,
      oldOrigins: [DEFAULT_MIGRATION_OLD_ORIGIN],
      destinationOrigin: DEFAULT_MIGRATION_DESTINATION,
      retirementDate: DEFAULT_MIGRATION_RETIREMENT_DATE,
    });
    expect(isOldMigrationOrigin('https://old.example', config)).toBe(false);
    expect(isMigrationDestinationAvailable(config, 'https://old.example')).toBe(false);
  });

  it('requires exact HTTPS source origins and excludes the destination', () => {
    const config = getDomainMigrationConfig({
      VITE_DOMAIN_MIGRATION_ENABLED: 'true',
      VITE_DOMAIN_MIGRATION_READY: 'true',
      VITE_DOMAIN_MIGRATION_OLD_ORIGINS: 'https://old.example/, https://preview.example/path, http://insecure.example, https://old.example',
      VITE_DOMAIN_MIGRATION_DESTINATION: 'https://pump.arkaes.dev',
    });

    expect(config.oldOrigins).toEqual(['https://old.example']);
    expect(isOldMigrationOrigin('https://old.example', config)).toBe(true);
    expect(isOldMigrationOrigin('https://old.example.evil', config)).toBe(false);
    expect(isOldMigrationOrigin('https://pump.arkaes.dev', {
      ...config,
      oldOrigins: ['https://old.example', 'https://pump.arkaes.dev'],
    })).toBe(false);
    expect(isMigrationDestinationAvailable(config, 'https://old.example')).toBe(true);
    expect(isMigrationDestinationAvailable(config, 'https://preview.example')).toBe(false);
  });

  it('fails closed if the source list is empty or overlaps the destination', () => {
    const enabled = getDomainMigrationConfig({
      VITE_DOMAIN_MIGRATION_ENABLED: 'true',
      VITE_DOMAIN_MIGRATION_READY: 'true',
      VITE_DOMAIN_MIGRATION_OLD_ORIGINS: '',
    });
    const overlap = {
      ...enabled,
      oldOrigins: ['https://old.example', DEFAULT_MIGRATION_DESTINATION],
    };

    expect(isMigrationDestinationAvailable(enabled, 'https://old.example')).toBe(false);
    expect(isMigrationDestinationAvailable(overlap, 'https://old.example')).toBe(false);
    expect(isOldMigrationOrigin(DEFAULT_MIGRATION_DESTINATION, overlap)).toBe(false);
  });

  it('shows an enabled default campaign only on the confirmed old domain', () => {
    const config = getDomainMigrationConfig({
      VITE_DOMAIN_MIGRATION_ENABLED: 'true',
      VITE_DOMAIN_MIGRATION_READY: 'true',
    });
    expect(isOldMigrationOrigin('https://pump.a-naufal.dev', config)).toBe(true);
    expect(isMigrationDestinationAvailable(config, 'https://pump.a-naufal.dev')).toBe(true);
    expect(isOldMigrationOrigin('https://pump.arkaes.dev', config)).toBe(false);
    expect(isOldMigrationOrigin('https://pump.a-naufal.dev.evil.example', config)).toBe(false);
    expect(isOldMigrationOrigin('https://track-milk-pump.web.app', config)).toBe(false);
  });

  it('rejects destination URLs with paths, queries, credentials, or non-HTTPS schemes', () => {
    for (const destination of [
      'http://pump.example',
      'https://pump.example/path',
      'https://pump.example/?next=elsewhere',
      'https://user:pass@pump.example',
    ]) {
      expect(getDomainMigrationConfig({ VITE_DOMAIN_MIGRATION_DESTINATION: destination }).destinationOrigin).toBeNull();
    }
  });

  it('keeps the retirement value as a valid date-only string', () => {
    expect(getDomainMigrationConfig({ VITE_DOMAIN_MIGRATION_RETIREMENT_DATE: '2026-02-29' }).retirementDate).toBeNull();
    expect(getDomainMigrationConfig({ VITE_DOMAIN_MIGRATION_RETIREMENT_DATE: '2026-11-10' }).retirementDate).toBe('2026-11-10');
  });
});
