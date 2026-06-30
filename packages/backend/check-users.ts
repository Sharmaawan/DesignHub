import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
p.user.findMany({ select: { id: true, email: true, name: true } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e))
  .finally(() => p.$disconnect());
