import { createSupabaseAdmin, passwordIsCorrect } from "../auth/admin";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";

/**
 * Permanently delete the signed-in user's account: all their data, then their login.
 * The current password is required, so a stolen access token alone cannot delete an account.
 *
 * Order matters: data first. If removing the login then fails the user keeps a login with no data and can
 * retry; the other order could leave health data behind with no way to reach it.
 * Everything tied to the profile is removed by cascade (plans, entries, logs, signals, favorites, shopping
 * items, weigh-ins, the user's private AI recipes).
 */
export async function deleteAccount(userId: string, password: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (error || !email) throw new HttpError(404, "Account not found");
  if (!(await passwordIsCorrect(email, password))) throw new HttpError(403, "Wrong password");

  await prisma.profile.deleteMany({ where: { id: userId } });
  const del = await admin.auth.admin.deleteUser(userId);
  if (del.error) throw new HttpError(500, "Your data was deleted but the login could not be removed. Please try again.");
  return { deleted: true };
}
