/**
 * Run by `prisma db seed`, which package.json wires to **`node prisma/seed.ts`**
 * - deliberately not `ts-node`.
 *
 * The shipped image installs with `npm ci --omit=dev`, so ts-node and
 * typescript are not in it, while this file is (the Dockerfile copies `prisma/`
 * so `migrate deploy` has the schema). Node 24 strips TypeScript types natively,
 * so plain `node` runs this file unchanged both on a dev machine and inside the
 * production container.
 *
 * The `--disable-warning` flag only silences Node's suggestion to add
 * `"type": "module"` to package.json - advice that would be actively wrong
 * here, since the compiled service itself is CommonJS.
 *
 * The catch: only *erasable* syntax is allowed - type annotations, `interface`,
 * `type`. No `enum`, no `namespace`, no parameter properties, no decorators.
 * Keep it that way or `docker compose exec account-service npm run prisma:seed`
 * starts failing again.
 */
import { PrismaClient, Role } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@shop.local',
    password: 'Admin123!',
    firstName: 'Ada',
    lastName: 'Admin',
    role: Role.ADMIN,
  },
  {
    email: 'user@shop.local',
    password: 'User123!',
    firstName: 'Uma',
    lastName: 'User',
    role: Role.USER,
  },
];

async function main(): Promise<void> {
  // Seeds must be idempotent: `upsert` only, so re-running against an existing
  // database is a no-op instead of a duplicate-key crash. That is what makes it
  // safe to run the seed from a deploy pipeline.
  for (const seedUser of SEED_USERS) {
    const password = await hash(seedUser.password, SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        // Reset the password too, so the credentials printed in the README always
        // work no matter what a previous lab session did to this row.
        password,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        role: seedUser.role,
        isActive: true,
      },
      create: {
        email: seedUser.email,
        password,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        role: seedUser.role,
      },
    });

    console.log(`seeded user ${user.email} (${user.role})`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
