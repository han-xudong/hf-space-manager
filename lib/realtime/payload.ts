import { getWorkspaceDashboard } from "@/lib/app-data";

export async function getWorkspaceStreamPayload(workspaceId: string) {
  return getWorkspaceDashboard(workspaceId);
}