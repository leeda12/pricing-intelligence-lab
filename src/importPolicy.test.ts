import { describe, expect, it } from 'vitest';
import { shouldShowImportControls } from './importPolicy';

describe('production import controls', () => {
  it('keeps import controls unavailable when production imports are disabled', () => {
    expect(shouldShowImportControls(false)).toBe(false);
  });

  it('shows import controls for local development when imports are enabled', () => {
    expect(shouldShowImportControls(true)).toBe(true);
  });
});
