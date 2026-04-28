type WorkspaceListener = () => void;

const workspaceListeners = new Map<string, Set<WorkspaceListener>>();

export function subscribeWorkspaceUpdates(workspaceId: string, listener: WorkspaceListener) {
  const listeners = workspaceListeners.get(workspaceId) ?? new Set<WorkspaceListener>();
  listeners.add(listener);
  workspaceListeners.set(workspaceId, listeners);

  return () => {
    const current = workspaceListeners.get(workspaceId);

    if (!current) {
      return;
    }

    current.delete(listener);

    if (current.size === 0) {
      workspaceListeners.delete(workspaceId);
    }
  };
}

export function publishWorkspaceUpdate(workspaceId: string) {
  const listeners = workspaceListeners.get(workspaceId);

  if (!listeners || listeners.size === 0) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}