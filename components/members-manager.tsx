"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Member = {
  id: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
};

type Props = {
  members: Member[];
  canManage: boolean;
};

export function MembersManager({ members, canManage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function addMember(formData: FormData) {
    setError(null);

    const response = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        role: formData.get("role"),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Failed to add member." }));
      setError(body.error ?? "Failed to add member.");
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <section className="panel stack-lg">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>Members and roles</h2>
        </div>
      </div>

      {canManage ? (
        <form action={addMember} className="form-grid stack-md">
          <label className="field">
            <span>Name</span>
            <input name="name" required placeholder="Operator" />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" required placeholder="ops@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" placeholder="Required for new users" />
          </label>
          <label className="field">
            <span>Role</span>
            <select name="role" defaultValue="VIEWER">
              <option value="VIEWER">VIEWER</option>
              <option value="OPERATOR">OPERATOR</option>
              <option value="ADMIN">ADMIN</option>
              <option value="OWNER">OWNER</option>
            </select>
          </label>
          <button className="button" type="submit" disabled={isPending}>
            Add member
          </button>
        </form>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="stack-md">
        {members.map((member) => (
          <article className="list-card" key={member.id}>
            <div>
              <h3>{member.name}</h3>
              <p className="muted">{member.email}</p>
            </div>
            <div className="stack-xs align-end">
              <span className="status-pill">{member.role}</span>
              <span className="muted">since {member.createdAt.slice(0, 10)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}