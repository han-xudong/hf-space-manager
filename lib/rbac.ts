import { MembershipRole } from "@prisma/client";

const roleOrder: Record<MembershipRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

export function hasRequiredRole(current: MembershipRole, required: MembershipRole) {
  return roleOrder[current] >= roleOrder[required];
}