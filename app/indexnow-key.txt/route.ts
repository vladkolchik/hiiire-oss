const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const NO_STORE_HEADERS = {
  "cache-control": "no-store",
};

export function GET(): Response {
  const key = process.env.INDEXNOW_KEY?.trim();

  if (!key) {
    return new Response("Not found", {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }

  if (!INDEXNOW_KEY_PATTERN.test(key)) {
    return new Response("Invalid IndexNow key", {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(key, {
    headers: {
      ...NO_STORE_HEADERS,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
