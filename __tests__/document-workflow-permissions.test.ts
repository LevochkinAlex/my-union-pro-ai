import test from "node:test";
import assert from "node:assert/strict";
import { getEmptyPermissions } from "@/lib/staff-permission-matrix";
import {
  getAllowedActionsForStatus,
  hasWorkflowActionPermission,
} from "@/lib/document-workflow-permissions";
import { DEFAULT_RPO_ROLE_TEMPLATES } from "@/lib/rpo-role-templates";

test("reviewer can approve without edit rights", () => {
  const permissions = getEmptyPermissions();
  permissions.documents_review = true;
  permissions.documents_edit = false;
  permissions.documents_approve = false;

  assert.equal(hasWorkflowActionPermission(permissions, "approve"), true);
  assert.equal(hasWorkflowActionPermission(permissions, "reject"), true);
  assert.equal(hasWorkflowActionPermission(permissions, "submit_for_approval"), false);
});

test("PENDING_APPROVAL actions are filtered by permissions", () => {
  const permissions = getEmptyPermissions();
  permissions.documents_review = true;

  const actions = getAllowedActionsForStatus("PENDING_APPROVAL", permissions);
  assert.deepEqual(actions, ["approve", "reject"]);
});

test("editor can start and rollback workflow", () => {
  const permissions = getEmptyPermissions();
  permissions.documents_edit = true;

  assert.equal(hasWorkflowActionPermission(permissions, "submit_for_approval"), true);
  assert.equal(hasWorkflowActionPermission(permissions, "return_to_draft"), true);
  assert.equal(hasWorkflowActionPermission(permissions, "sign"), false);
});

test("documents_approve does not replace reviewer permission", () => {
  const permissions = getEmptyPermissions();
  permissions.documents_approve = true;

  assert.equal(hasWorkflowActionPermission(permissions, "approve"), false);
  assert.equal(hasWorkflowActionPermission(permissions, "reject"), false);
  assert.equal(hasWorkflowActionPermission(permissions, "submit_for_signature"), true);
});

test("role templates follow activity split for secretary and committee member", () => {
  const secretary = DEFAULT_RPO_ROLE_TEMPLATES.find((role) => role.name === "Секретарь");
  const committeeMember = DEFAULT_RPO_ROLE_TEMPLATES.find(
    (role) => role.name === "Член профкома"
  );

  assert.ok(secretary);
  assert.ok(committeeMember);

  assert.equal(secretary!.permissions.documents_review, true);
  assert.equal(secretary!.permissions.documents_sign, false);
  assert.equal(secretary!.permissions.appeals_manage, true);

  assert.equal(committeeMember!.permissions.documents_review, true);
  assert.equal(committeeMember!.permissions.documents_edit, false);
  assert.equal(committeeMember!.permissions.documents_approve, false);
  assert.equal(committeeMember!.permissions.appeals_view, false);
});
