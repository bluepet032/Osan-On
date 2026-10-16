// Admin Firebase UIDs, comma-separated, from the repository variable VITE_ADMIN_UIDS. UIDs rather
// than e-mail addresses, because build-time variables end up in the public JavaScript bundle.
export const parseAdminUids = (value: string | undefined) => (value ?? '').split(',').map(uid => uid.trim()).filter(Boolean)

const ADMIN_UIDS = parseAdminUids(import.meta.env.VITE_ADMIN_UIDS)

// Hides the collection status screens only; the status data itself (data/sources.json) stays public.
export const isAdmin = (uid: string | undefined, admins = ADMIN_UIDS) => Boolean(uid) && admins.includes(uid!)
