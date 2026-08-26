/**
 * @fileoverview HTTP client for the ShapeShyft API, entity-key first.
 * @description This MCP ships inside the API repo, so its tools track the
 * routes in `src/routes/` directly.
 *
 * Auth, in resolution order:
 *   1. **Entity API key** (`shyftent_...`) as `X-API-Key`. Authenticates as the
 *      entity itself, so it keeps working when the member who created it
 *      leaves -- the credential this MCP is built around.
 *   2. **Personal API key** (`shyft_...`) as `X-API-Key`. Acts as a user.
 *   3. **Firebase ID token** as `Authorization: Bearer`. Browser-session
 *      credential; needed only for routes an entity key may not reach.
 *
 * AI invocation routes (`/api/v1/ai/*`) use a **project API key**
 * (`sk_live_...`) instead, and public routes need no credential at all.
 *
 * An entity key deliberately cannot reach `/api/v1/users/*` or manage entity
 * API keys -- see `assertNotEntityKeyAuth` in src/routes/entity-api-keys.ts.
 * Those calls need a personal key or a Firebase token.
 *
 * Every API response is `{ success, data, timestamp }`; this client unwraps
 * `data` and throws `ApiError` on failure.
 */

export interface ClientConfig {
  /** Base URL, e.g. https://api.shapeshyft.ai or http://localhost:3000 */
  apiUrl: string;
  /** Entity API key (shyftent_...) -- preferred for entity-scoped tools */
  entityApiKey?: string | undefined;
  /** Personal API key (shyft_...) -- acts as a user */
  apiKey?: string | undefined;
  /** Firebase ID token -- for routes an entity key may not reach */
  authToken?: string | undefined;
  /** Project API key (sk_live_...) for AI invocation */
  projectApiKey?: string | undefined;
  /** Default entity slug used when a tool call omits `entitySlug` */
  entitySlug?: string | undefined;
  /** Default organization path for AI URLs */
  orgPath?: string | undefined;
}

/**
 * Which credential a request needs.
 *  - `admin`    entity key, else personal key, else Firebase token
 *  - `user`     personal key or Firebase token (entity keys are refused)
 *  - `project`  project API key, for AI invocation
 *  - `none`     public route
 */
export type AuthMode = "admin" | "user" | "project" | "none";

export interface RequestOptions {
  auth?: AuthMode;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Overrides the configured project API key for this call only */
  apiKeyOverride?: string | undefined;
}

/** Error thrown when the API returns a non-2xx response or `success: false`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let config: ClientConfig = { apiUrl: "https://api.shapeshyft.ai" };

/** Replace the client configuration. */
export function configure(next: ClientConfig): void {
  config = next;
}

/** Read the current configuration (secrets masked by the caller). */
export function getConfig(): ClientConfig {
  return config;
}

/** Update part of the configuration, leaving the rest intact. */
export function updateConfig(patch: Partial<ClientConfig>): void {
  config = { ...config, ...patch };
}

/**
 * Resolve the entity slug for a call.
 * @throws When neither the argument nor the default is set
 */
export function resolveEntitySlug(entitySlug?: string): string {
  const resolved = entitySlug ?? config.entitySlug;
  if (!resolved) {
    throw new ApiError(
      "No entity slug. Pass `entitySlug`, or set SHAPESHYFT_ENTITY_SLUG.",
      400
    );
  }
  return resolved;
}

/** Percent-encode one path segment. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Build the headers for a request, choosing the credential by auth mode.
 */
function buildHeaders(
  auth: AuthMode,
  apiKeyOverride?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth === "none") return headers;

  if (auth === "project") {
    const key = apiKeyOverride ?? config.projectApiKey;
    if (!key) {
      throw new ApiError(
        "No project API key. Pass `apiKey`, or set SHAPESHYFT_PROJECT_API_KEY.",
        401
      );
    }
    headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  // `user` refuses the entity key rather than sending one the API will reject
  // with a confusing 403.
  if (auth === "user") {
    if (config.apiKey) {
      headers["X-API-Key"] = config.apiKey;
      return headers;
    }
    if (config.authToken) {
      headers.Authorization = `Bearer ${config.authToken}`;
      return headers;
    }
    throw new ApiError(
      "This route needs a personal API key (shyft_...) or a Firebase token. " +
        "An entity API key cannot act on a user's behalf.",
      401
    );
  }

  if (config.entityApiKey) {
    headers["X-API-Key"] = config.entityApiKey;
    return headers;
  }
  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
    return headers;
  }
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
    return headers;
  }

  throw new ApiError(
    "No credentials. Set SHAPESHYFT_ENTITY_API_KEY (shyftent_...), " +
      "SHAPESHYFT_API_KEY (shyft_...), or SHAPESHYFT_AUTH_TOKEN, or call set_credentials.",
    401
  );
}

/**
 * Perform a request and unwrap the API envelope.
 */
async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { auth = "admin", query, body, apiKeyOverride } = options;

  const url = new URL(path, config.apiUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // Resolved before the try below: a missing or wrong-kind credential is a
  // client-side error, and must not be reported as a connectivity failure.
  const headers = buildHeaders(auth, apiKeyOverride);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error: any) {
    throw new ApiError(
      `Could not reach ${config.apiUrl}: ${error?.message ?? error}`,
      0
    );
  }

  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(
      `Non-JSON response (${response.status}): ${text.slice(0, 200)}`,
      response.status
    );
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error ?? `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return (payload?.data ?? payload) as T;
}

export const get = <T = unknown>(path: string, options?: RequestOptions) =>
  request<T>("GET", path, options);

export const post = <T = unknown>(path: string, options?: RequestOptions) =>
  request<T>("POST", path, options);

export const put = <T = unknown>(path: string, options?: RequestOptions) =>
  request<T>("PUT", path, options);

export const del = <T = unknown>(path: string, options?: RequestOptions) =>
  request<T>("DELETE", path, options);
