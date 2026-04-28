import { MembershipRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { TrackedSpaceDetailClient } from "@/components/tracked-space-detail-client";
import { getTrackedSpaceDetailByRepoId } from "@/lib/app-data";
import { requireUserSession } from "@/lib/auth/session";
import { hasRequiredRole } from "@/lib/rbac";

type Props = {
  params: Promise<{ owner: string; repo: string }>;
};

export default async function TrackedSpacePage({ params }: Props) {
  const session = await requireUserSession();
  const { owner, repo } = await params;
  const repoId = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`;

  const space = await getTrackedSpaceDetailByRepoId(session.user.workspaceId, repoId);

  if (!space) {
    notFound();
  }

  return (
    <TrackedSpaceDetailClient
      space={space}
      canOperate={hasRequiredRole(session.user.role as MembershipRole, MembershipRole.OPERATOR)}
      canManageSchedules={hasRequiredRole(session.user.role as MembershipRole, MembershipRole.ADMIN)}
    />
  );
}