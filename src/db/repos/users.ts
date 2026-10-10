import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import type { PreferencesRecord, User } from '../../types';

export async function getCurrentUser() {
  const id = (await db.meta.get('currentUserId'))?.value;
  return id ? ((await db.users.get(id)) ?? null) : null;
}

/** Demo sign-up: the account lives on this device. No password is ever stored. */
export async function signUpUser(name: string, contact: string) {
  const user: User = { id: `u-${crypto.randomUUID()}`, name, phoneOrEmail: contact, homeCity: 'Mumbai' };
  await writeAndQueue('users', user.id, user, `New account: ${name}`);
  await db.meta.put({ key: 'currentUserId', value: user.id });
  return user;
}

/** Demo log-in: reuse the account on this device, or the sample traveller. */
export async function logInUser(contact: string) {
  const users = await db.users.toArray();
  const match = users.find((u) => u.phoneOrEmail === contact) ?? (await getCurrentUser()) ?? users[0];
  if (match) await db.meta.put({ key: 'currentUserId', value: match.id });
  return match ?? null;
}

export async function getPreferences() {
  const user = await getCurrentUser();
  return user ? ((await db.preferences.get(user.id)) ?? null) : null;
}

export async function savePreferences(answers: PreferencesRecord['answers'], notes: PreferencesRecord['notes'] = {}) {
  const user = await getCurrentUser();
  if (!user) return;
  const existing = await db.preferences.get(user.id);
  const record: PreferencesRecord = { userId: user.id, answers, notes, updatedAt: new Date().toISOString(), rev: existing?.rev };
  await writeAndQueue('preferences', user.id, record, 'Travel persona answers');
}
