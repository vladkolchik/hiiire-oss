function normalizePathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export function getSamePageHashTargetId(href: string, currentHref: string) {
  let targetUrl: URL;
  let currentUrl: URL;

  try {
    targetUrl = new URL(href, currentHref);
    currentUrl = new URL(currentHref);
  } catch {
    return "";
  }

  if (
    !targetUrl.hash ||
    targetUrl.origin !== currentUrl.origin ||
    normalizePathname(targetUrl.pathname) !== normalizePathname(currentUrl.pathname)
  ) {
    return "";
  }

  try {
    return decodeURIComponent(targetUrl.hash.slice(1));
  } catch {
    return "";
  }
}
