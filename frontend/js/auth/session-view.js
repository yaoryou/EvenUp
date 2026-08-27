export function authUserSnapshot(user) {
  if (!user) return null;

  return {
    id: user.id ?? null,
    email: user.email ?? null,
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    app_metadata: user.app_metadata ?? {},
    user_metadata: user.user_metadata ?? {},
    identities: (user.identities ?? []).map((identity) => ({
      id: identity.id ?? null,
      provider: identity.provider ?? null,
      identity_data: identity.identity_data ?? {},
      created_at: identity.created_at ?? null,
      last_sign_in_at: identity.last_sign_in_at ?? null
    }))
  };
}
