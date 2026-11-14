import { compareVersions, isVersion } from './semver.js';

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    // The whole reason this file exists.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
  });

  it('treats equal versions as equal', () => {
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
  });

  it('refuses to compare something that is not x.y.z', () => {
    expect(() => compareVersions('1.4', '1.4.0')).toThrow();
  });
});

describe('isVersion', () => {
  it.each(['0.0.0', '1.4.0', '10.20.30', '999999999.0.1'])('accepts %s', (v) =>
    expect(isVersion(v)).toBe(true),
  );

  it.each([
    '1.4',
    '1.4.0.1',
    'v1.4.0',
    '1.04.0',
    '1.4.0-beta',
    ' 1.4.0',
    '1000000000.0.0',
    '',
  ])('rejects %j', (v) => expect(isVersion(v)).toBe(false));
});
