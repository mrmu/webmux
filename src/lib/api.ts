/** Client-side API helper */

async function fetchApi(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (res.status === 401) {
    // Don't reload — redirect to login (unless already on login page)
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    const text = await res.text();
    throw new Error(text);
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  get: (url: string) => fetchApi(url),
  post: (url: string, body: unknown) =>
    fetchApi(url, { method: "POST", body: JSON.stringify(body) }),
  put: (url: string, body: unknown) =>
    fetchApi(url, { method: "PUT", body: JSON.stringify(body) }),
  del: (url: string) => fetchApi(url, { method: "DELETE" }),
};
