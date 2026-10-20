/* Дава или отнема права на администратор на платформата (/admin на основния домейн).
   pnpm platform-admin <имейл> [--revoke] */
import { eq } from "drizzle-orm";
import { controlDb } from "./control";
import { users } from "./control-schema";

const email = process.argv[2]?.toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email) {
  console.error("Употреба: pnpm platform-admin <имейл> [--revoke]");
  process.exit(1);
}

controlDb
  .update(users)
  .set({ isPlatformAdmin: !revoke })
  .where(eq(users.email, email))
  .then(([res]) => {
    if (res.affectedRows === 0) {
      console.error(`Няма потребител с имейл ${email}. Първо се регистрирайте.`);
      process.exit(1);
    }
    console.log(revoke ? `${email} вече не е администратор на платформата.` : `${email} е администратор на платформата: ${process.env.APP_DOMAIN ?? "localhost:3000"}/admin`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
