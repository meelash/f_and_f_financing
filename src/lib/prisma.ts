import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaAdapter } from "@/lib/prisma-adapter";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ?? new PrismaClient({ adapter: createPrismaAdapter() });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
