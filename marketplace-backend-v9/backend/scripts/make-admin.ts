/**
 * Promote (or demote) a user by email from the command line — the bootstrap path for the very
 * first admin when ADMIN_EMAILS isn't convenient (e.g. the account already exists and you don't
 * want to wait for their next login).
 *
 *   npm run make-admin -- alice@example.com            # → admin
 *   npm run make-admin -- alice@example.com buyer      # → back to buyer
 *
 * Reads the same .env as the server. Revokes the user's sessions so the new role takes effect at
 * their next request.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env';
import { ASSIGNABLE_ROLES, ROLES } from '../src/constants';
import { RefreshToken } from '../src/models/RefreshToken';
import { User } from '../src/models/User';

const [email, roleArg = ROLES.ADMIN] = process.argv.slice(2);

const main = async () => {
  if (!email) {
    console.error('Usage: npm run make-admin -- <email> [admin|seller|buyer]');
    process.exit(1);
  }
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(roleArg)) {
    console.error(`Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    console.error(`No user with email ${email}. They must register first.`);
    process.exit(1);
  }

  const previous = user.role;
  user.role = roleArg as (typeof ASSIGNABLE_ROLES)[number];
  if (!user.isEmailVerified) {
    user.isEmailVerified = true; // an operator vouching for the account is at least as strong as a code
    user.emailVerifiedAt = new Date();
  }
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

  console.log(`✔ ${user.email}: ${previous} → ${user.role} (existing sessions revoked; they need to sign in again)`);
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
