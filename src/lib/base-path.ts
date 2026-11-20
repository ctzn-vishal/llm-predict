// The app is served under basePath (next.config.ts). Next prefixes <Link>,
// router.push and /_next assets itself, but not literal fetch() URLs or plain
// <a href>, so those go through this.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBase = (path: string) => `${BASE_PATH}${path}`;
