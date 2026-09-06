import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "pan_admin_token";

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function req(path: string, options: RequestInit = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error((data && (data.detail || data.message)) || "Ocurrió un error en el servidor");
    }
    return data;
  } catch (error: any) {
    // Si es error de red o timeout, preserva la información sin alterar sesión
    throw error;
  }
}

export const api = {
  base: BASE,
  get: (p: string) => req(p),
  post: (p: string, body?: any) => req(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: (p: string, body?: any) => req(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: (p: string, body?: any) => req(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: (p: string) => req(p, { method: "DELETE" }),
  // multipart upload (audio)
  upload: async (p: string, formData: FormData) => {
    const headers = { ...(await authHeaders()) };
    const res = await fetch(`${BASE}/api${p}`, { method: "POST", headers, body: formData as any });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.detail) || "Error al subir audio");
    return data;
  },
};
