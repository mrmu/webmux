/** Client-side API helper */

async function fetchApi(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  if (res.status === 401) {
    window.location.reload();
    throw new Error("Unauthorized");
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
