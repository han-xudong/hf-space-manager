import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      workspaceId: string;
      role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
    };
  }

  interface User {
    id: string;
    workspaceId: string;
    role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    workspaceId: string;
    role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  }
}
