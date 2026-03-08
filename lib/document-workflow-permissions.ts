import type { StaffPermissionsMap } from "@/lib/staff-permission-matrix";

export type WorkflowAction =
  | "submit_for_review"
  | "submit_for_approval"
  | "approve"
  | "reject"
  | "submit_for_signature"
  | "sign"
  | "register"
  | "send"
  | "receive"
  | "complete"
  | "archive"
  | "return_to_draft";

export const STATUS_ACTIONS: Record<string, WorkflowAction[]> = {
  DRAFT: ["submit_for_review", "submit_for_approval", "archive"],
  GENERATED: ["submit_for_review", "submit_for_approval", "submit_for_signature", "sign", "archive"],
  PENDING_REVIEW: ["submit_for_approval", "reject", "return_to_draft"],
  PENDING_APPROVAL: ["approve", "reject", "return_to_draft"],
  PENDING_SIGNATURE: ["sign", "reject"],
  SIGNED: ["register"],
  REGISTERED: ["send", "complete", "archive"],
  SENT: ["complete", "archive"],
  RECEIVED: ["submit_for_review", "complete", "archive"],
  COMPLETED: ["archive"],
  REJECTED: ["return_to_draft"],
  ARCHIVED: [],
};

const ACTION_PERMISSION_RULES: Record<WorkflowAction, Array<keyof StaffPermissionsMap>> = {
  submit_for_review: ["documents_create", "documents_edit"],
  submit_for_approval: ["documents_create", "documents_edit"],
  // approve/reject in workflow is reviewer action, not chairman final approval.
  approve: ["documents_review"],
  reject: ["documents_review"],
  submit_for_signature: ["documents_approve"],
  sign: ["documents_sign"],
  register: ["documents_create", "documents_edit"],
  send: ["documents_create", "documents_edit"],
  receive: ["documents_create", "documents_edit"],
  complete: ["documents_edit"],
  archive: ["documents_edit"],
  return_to_draft: ["documents_edit"],
};

const WORKFLOW_ACTIONS = Object.keys(ACTION_PERMISSION_RULES) as WorkflowAction[];

export function isWorkflowAction(action: string): action is WorkflowAction {
  return WORKFLOW_ACTIONS.includes(action as WorkflowAction);
}

export function hasWorkflowActionPermission(
  permissions: StaffPermissionsMap,
  action: WorkflowAction
): boolean {
  return ACTION_PERMISSION_RULES[action].some((permissionKey) => permissions[permissionKey] === true);
}

export function getAvailableActionsForStatus(status: string): WorkflowAction[] {
  return STATUS_ACTIONS[status] ?? [];
}

export function getAllowedActionsForStatus(
  status: string,
  permissions: StaffPermissionsMap
): WorkflowAction[] {
  return getAvailableActionsForStatus(status).filter((action) =>
    hasWorkflowActionPermission(permissions, action)
  );
}
