import test from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_PERMISSION_KEYS,
  normalizeStaffPermissions,
  getAllStaffPermissions,
  isStaffPermission,
} from "@/lib/staff-permission-matrix";

test("normalizeStaffPermissions keeps only known permission keys", () => {
  const result = normalizeStaffPermissions({
    documents_view: true,
    unknown_permission: true,
  });

  assert.equal(result.documents_view, true);
  assert.equal((result as Record<string, boolean>).unknown_permission, undefined);
  assert.equal(Object.keys(result).length, STAFF_PERMISSION_KEYS.length);
});

test("getAllStaffPermissions enables all known permission keys", () => {
  const result = getAllStaffPermissions();
  const enabledCount = Object.values(result).filter(Boolean).length;
  assert.equal(enabledCount, STAFF_PERMISSION_KEYS.length);
});

test("isStaffPermission validates known keys", () => {
  assert.equal(isStaffPermission("documents_create"), true);
  assert.equal(isStaffPermission("nope"), false);
});

