// Leave unset to use the same-origin Vite or production reverse proxy.
const configured = import.meta.env.VITE_SWARMGUARD_API_ORIGIN as string | undefined;
export const apiOrigin = configured ? new URL(configured).origin : "";
