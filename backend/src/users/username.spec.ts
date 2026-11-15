import {
  normalizeUsername,
  suggestionCandidates,
  usernameProblem,
} from './username.js';

describe('username rules', () => {
  it.each(['aarav', 'aarav.k', 'aarav_k', 'aarav.k_', '_aarav', 'a1b', 'a'.repeat(30)])(
    'accepts %s',
    (u) => expect(usernameProblem(u)).toBeNull(),
  );

  it.each([
    ['ab', 'at least 3'],
    ['a'.repeat(31), 'at most 30'],
    ['aarav-k', 'only letters'],
    ['aarav k', 'only letters'],
    ['Aarav', 'only letters'],
    ['.aarav', 'start or end'],
    ['aarav.', 'start or end'],
    ['aa..rav', '..'],
  ])('rejects %s (%s)', (u, why) => {
    expect(usernameProblem(u)).toContain(why);
  });

  it('normalises case, spaces and a leading @', () => {
    expect(normalizeUsername('  @Aarav.K ')).toBe('aarav.k');
  });

  it('suggests the ticket’s three first, all well-formed', () => {
    const s = suggestionCandidates('aarav.k');
    expect(s.slice(0, 3)).toEqual(['aarav.k1', 'aarav.k_', 'aaravk']);
    for (const c of s) expect(usernameProblem(c)).toBeNull();
    expect(s).not.toContain('aarav.k');
  });

  it('suggests well-formed names even for garbage input', () => {
    for (const input of ['ADMIN', '..', 'a', 'x'.repeat(40), 'हिन्दी']) {
      const s = suggestionCandidates(input);
      expect(s.length).toBeGreaterThan(0);
      for (const c of s) expect(usernameProblem(c)).toBeNull();
    }
  });
});
