import { MembershipRole } from "@prisma/client";

import { ConnectionManager } from "@/components/connection-manager";
import { getWorkspaceConnections } from "@/lib/app-data";
import { requireUserSession } from "@/lib/auth/session";
import { hasRequiredRole } from "@/lib/rbac";

export default async function ConnectionsPage() {
  const session = await requireUserSession();
  const connections = await getWorkspaceConnections(session.user.workspaceId);

  return (
    <ConnectionManager
      connections={connections}
      canManage={hasRequiredRole(session.user.role as MembershipRole, MembershipRole.ADMIN)}
    />
  );
}