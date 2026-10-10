// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeDbUrl } from '../db/client';

describe('DATABASE_URL clean-up', () => {
  it('encodes special characters in the password and trims quotes', () => {
    const u = normalizeDbUrl(' "postgresql://postgres.abc:p@ss#w/rd?@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" ')!;
    expect(u).toBe('postgresql://postgres.abc:p%40ss%23w%2Frd%3F@aws-0-ap-south-1.pooler.supabase.com:6543/postgres');
    expect(() => new URL(u)).not.toThrow();
  });
  it('leaves an already-encoded password alone', () => {
    expect(normalizeDbUrl('postgres://u:a%40b@h:5432/d')).toBe('postgres://u:a%40b@h:5432/d');
  });
  it('explains the placeholder', () => {
    expect(() => normalizeDbUrl('postgresql://postgres:[YOUR-PASSWORD]@db.x.supabase.co:5432/postgres')).toThrow(/placeholder/);
  });
});

describe('DATABASE_URL wrong kind', () => {
  it('says when the project URL was pasted', () => {
    expect(() => normalizeDbUrl('https://abc.supabase.co')).toThrow(/starts with "https:\/\/"/);
  });
});

describe('DATABASE_URL shape problems', () => {
  it('names a missing @ and a space without echoing the value', () => {
    expect(() => normalizeDbUrl('postgresql://postgres.x: secretpwaws-0-ap.pooler.supabase.com:6543/postgres')).toThrow(/space.*no "@"/);
    expect(() => normalizeDbUrl('postgresql://postgres.x: secretpwaws-0-ap.pooler.supabase.com:6543/postgres')).not.toThrow(/secretpw/);
  });
  it('accepts the pooler string', () => {
    expect(normalizeDbUrl('postgresql://postgres.abc:Pw123xyz@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres')).toContain('@aws-0');
  });
});
