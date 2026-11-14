/**
 * `x.y.z` versions, compared as numbers.
 *
 * As text, `1.10.0` sorts before `1.9.0` — and a force-update gate that gets
 * that wrong either locks out everybody on the newest build or lets the
 * oldest one through. Every comparison in this feature goes through here.
 *
 * Each part is at most nine digits, so it always fits the `int` the database
 * casts it to in `ck_app_versions_order`. No leading zeros: `1.02.0` would be
 * a second spelling of `1.2.0`, and two spellings of one version is how a
 * comparison quietly goes wrong.
 */
export const VERSION_PATTERN =
  /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;

export function isVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/** Negative if `a` is older than `b`, zero if equal, positive if newer. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function parse(value: string): [number, number, number] {
  if (!isVersion(value)) {
    throw new Error(`Not an x.y.z version: ${value}`);
  }
  const [x, y, z] = value.split('.').map(Number);
  return [x, y, z];
}
