type SpaceIdentityInput = {
  repoId: string;
  name?: string | null;
  subdomain?: string | null;
  ownerUsername?: string | null;
};

export function isCanonicalRepoId(value: string | null | undefined) {
  return Boolean(value && value.includes("/"));
}

export function getCanonicalRepoId(input: SpaceIdentityInput) {
  if (isCanonicalRepoId(input.repoId)) {
    return input.repoId;
  }

  if (isCanonicalRepoId(input.name)) {
    return input.name as string;
  }

  if (input.ownerUsername && input.subdomain) {
    const prefix = `${input.ownerUsername}-`;

    if (input.subdomain.startsWith(prefix)) {
      return `${input.ownerUsername}/${input.subdomain.slice(prefix.length)}`;
    }
  }

  return input.repoId;
}

export function getSpaceDisplayName(input: SpaceIdentityInput) {
  const canonicalRepoId = getCanonicalRepoId(input);

  if (isCanonicalRepoId(canonicalRepoId)) {
    return canonicalRepoId;
  }

  return input.subdomain ?? input.name ?? input.repoId;
}