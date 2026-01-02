import type { Context, Next } from "hono";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyIdToken, isAnonymousUser } from "../services/firebase";
import { errorResponse } from "@sudobility/shapeshyft_types";
import { eq } from "drizzle-orm";
import { db, users } from "../db";

declare module "hono" {
  interface ContextVariableMap {
    firebaseUser: DecodedIdToken;
    userId: string;
    userEmail: string | null;
  }
}

/**
 * Get or create user by Firebase UID
 * Returns the internal user UUID
 */
async function getOrCreateUser(
  firebaseUid: string,
  email?: string | null
): Promise<string> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  const created = await db
    .insert(users)
    .values({
      firebase_uid: firebaseUid,
      email: email ?? null,
    })
    .returning();

  return created[0]!.id;
}

export async function firebaseAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json(errorResponse("Authorization header required"), 401);
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return c.json(
      errorResponse("Invalid authorization format. Use: Bearer <token>"),
      401
    );
  }

  try {
    const decodedToken = await verifyIdToken(token);

    if (isAnonymousUser(decodedToken)) {
      return c.json(
        errorResponse("Anonymous users cannot access this resource"),
        403
      );
    }

    // Get or create the internal user and get their UUID
    const userId = await getOrCreateUser(decodedToken.uid, decodedToken.email);

    c.set("firebaseUser", decodedToken);
    c.set("userId", userId);
    c.set("userEmail", decodedToken.email ?? null);
    await next();
  } catch {
    return c.json(errorResponse("Invalid or expired Firebase token"), 401);
  }
}
