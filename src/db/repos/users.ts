import { db } from '../db';
import type { PreferencesRecord } from '../../types';

export async function getCurrentUser() {
  const id = (await db.meta.get('currentUserId'))?.value;
  return id ? ((await db.users.get(id)) ?? null) : null;
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
  // The account copy is saved through the API (useAuth().saveProfile).
  await db.preferences.put(record);
}
