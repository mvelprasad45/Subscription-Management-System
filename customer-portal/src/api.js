export const API_URL = import.meta.env.VITE_API_URL || '';

export async function api(path, options = {}) {
  const token = localStorage.getItem('brightloop-token');
  const response = await fetch(`${API_URL}/api/customer${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(data?.error || 'Request failed.');
  return data;
}

export const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount || 0));
export const dateLabel = (value) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled';