import { auth } from "@/lib/auth";

export async function requireUserSession() {
  return auth();
}

export async function requireApiSession() {
  return auth();
}