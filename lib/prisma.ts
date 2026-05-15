// lib/prisma.ts
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  let connectionString = process.env.DATABASE_URL!
  
  // Appends the parameter recommended by pg warning if it's not present
  if (!connectionString.includes("uselibpqcompat=true")) {
    const separator = connectionString.includes("?") ? "&" : "?"
    connectionString += `${separator}uselibpqcompat=true&sslmode=require`
  }

  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool as any)

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}