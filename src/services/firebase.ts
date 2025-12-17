import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getRequiredEnv } from "../lib/env-helper";

const FIREBASE_PROJECT_ID = getRequiredEnv("FIREBASE_PROJECT_ID");
const FIREBASE_CLIENT_EMAIL = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
const FIREBASE_PRIVATE_KEY = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(
  /\\n/g,
  "\n"
);

let app: App;

if (getApps().length === 0) {
  app = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
  });
} else {
  app = getApps()[0]!;
}

const auth = getAuth(app);

export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return auth.verifyIdToken(token);
}

export function isAnonymousUser(decodedToken: DecodedIdToken): boolean {
  return decodedToken.firebase?.sign_in_provider === "anonymous";
}
