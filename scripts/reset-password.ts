/**
 * One-off CLI to reset any account's password directly in the database.
 * Usage: npm run reset-password -- <email> <newPassword>
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [, , email, newPassword] = process.argv;

  if (!email || !newPassword) {
    console.error("Usage: npm run reset-password -- <email> <newPassword>");
    process.exit(1);
  }
  if (newPassword.length < 6) {
    console.error("New password must be at least 6 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    console.error(`No account found with email "${email}".`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { email }, data: { password: hash } });

  console.log(`✅ Password updated for ${existing.email} (${existing.role}). You can sign in with the new password now.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
