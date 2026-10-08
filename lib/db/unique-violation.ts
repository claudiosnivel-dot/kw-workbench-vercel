import { Prisma } from "@/lib/generated/prisma/client";

type DriverAdapterFailure = { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };

/** Violazione di un vincolo unico: P2002 di Prisma o SQLSTATE 23505 riportato dal driver adapter. */
export function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  return error.code === "P2002" || (error as DriverAdapterFailure).meta?.driverAdapterError?.cause?.originalCode === "23505";
}
