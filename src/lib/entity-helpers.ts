/**
 * @fileoverview Shared entity permission helpers
 * @description Provides a singleton entity helpers instance and a shared
 * `getEntityWithPermission()` function used across multiple route files.
 * This eliminates duplication of entity config and permission checking.
 */

import {
  db,
  entities,
  entityMembers,
  entityInvitations,
  users,
} from "../db";
import {
  createEntityHelpers,
  type InvitationHelperConfig,
  type Entity,
} from "@sudobility/entity_service";

// =============================================================================
// Singleton Entity Helpers Configuration
// =============================================================================

/**
 * Shared InvitationHelperConfig used by all route files.
 * Uses the lazy Proxy-based db connection so it is safe to reference at
 * module load time -- actual database access is deferred.
 */
const sharedConfig: InvitationHelperConfig = {
  db: db as any,
  entitiesTable: entities,
  membersTable: entityMembers,
  invitationsTable: entityInvitations,
  usersTable: users,
};

/**
 * Singleton entity helpers instance.
 * All route files should import this instead of creating their own.
 */
export const entityHelpers = createEntityHelpers(sharedConfig);

// =============================================================================
// Permission Result Type
// =============================================================================

/** Successful permission check result */
interface PermissionSuccess {
  entity: Entity;
  error?: never;
  errorCode?: never;
}

/** Failed permission check result */
interface PermissionFailure {
  entity?: never;
  error: string;
  errorCode: string;
}

/** Discriminated union for permission check results */
export type EntityPermissionResult = PermissionSuccess | PermissionFailure;

// =============================================================================
// Shared Permission Helper
// =============================================================================

/**
 * Look up an entity by slug and verify the user has appropriate permissions.
 *
 * When `requireEdit` is true, checks if the user can create projects
 * (i.e., has an admin/editor role). Otherwise, checks view access.
 *
 * @param entitySlug - The entity's URL-safe slug
 * @param userId - The Firebase UID of the requesting user
 * @param requireEdit - If true, require edit-level permissions (default: false)
 * @returns A discriminated union with either `{ entity }` or `{ error, errorCode }`
 */
export async function getEntityWithPermission(
  entitySlug: string,
  userId: string,
  requireEdit = false
): Promise<EntityPermissionResult> {
  const entity = await entityHelpers.entity.getEntityBySlug(entitySlug);
  if (!entity) {
    return { error: "Entity not found", errorCode: "ENTITY_NOT_FOUND" };
  }

  if (requireEdit) {
    const canEdit = await entityHelpers.permissions.canCreateProjects(
      entity.id,
      userId
    );
    if (!canEdit) {
      return {
        error: "Insufficient permissions",
        errorCode: "INSUFFICIENT_PERMISSIONS",
      };
    }
  } else {
    const canView = await entityHelpers.permissions.canViewEntity(
      entity.id,
      userId
    );
    if (!canView) {
      return { error: "Access denied", errorCode: "ACCESS_DENIED" };
    }
  }

  return { entity };
}

/**
 * Determine the appropriate HTTP status code for a permission error.
 *
 * @param errorCode - The error code from `getEntityWithPermission()`
 * @returns 404 for not-found, 403 for access/permission errors
 */
export function getPermissionErrorStatus(errorCode: string): 400 | 403 | 404 {
  switch (errorCode) {
    case "ENTITY_NOT_FOUND":
      return 404;
    case "ACCESS_DENIED":
    case "INSUFFICIENT_PERMISSIONS":
      return 403;
    default:
      return 400;
  }
}
