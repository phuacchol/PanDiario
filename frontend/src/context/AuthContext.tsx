import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, TOKEN_KEY } from "@/src/api/client";
import { getDb } from "@/src/utils/localDb";

export type User = {
  id: string;
  email: string;
  name: string;
  currency: string;
  theme: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (u: Partial<User>) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);
const ACTIVE_USER_KEY = "pan_admin_active_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Sincronizar usuarios creados offline en segundo plano
  const syncOfflineUsers = useCallback(async () => {
    try {
      const db = await getDb();
      if (!db) return;
      const unsynced = await db.getAllAsync<any>(`SELECT * FROM users WHERE synced = 0`).catch(() => []);
      for (const u of unsynced) {
        try {
          const res = await api.post("/auth/register", {
            email: u.email,
            password: u.password,
            name: u.name,
          });
          if (res && res.access_token) {
            await db.runAsync(
              `UPDATE users SET id = ?, token = ?, synced = 1 WHERE email = ?`,
              [res.user.id, res.access_token, u.email]
            ).catch(() => {});
          }
        } catch {
          try {
            const loginRes = await api.post("/auth/login", {
              email: u.email,
              password: u.password,
            });
            if (loginRes && loginRes.access_token) {
              await db.runAsync(
                `UPDATE users SET id = ?, token = ?, synced = 1 WHERE email = ?`,
                [loginRes.user.id, loginRes.access_token, u.email]
              ).catch(() => {});
            }
          } catch {}
        }
      }
    } catch {}
  }, []);

  // Carga inmediata de sesión: Memoria local primero, red después
  const loadMe = useCallback(async () => {
    try {
      // 1. Lectura inmediata de caché local (< 30ms)
      const [rawUser, token] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_USER_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);

      if (rawUser) {
        try {
          setUser(JSON.parse(rawUser));
        } catch {}
      }

      // Si no estaba en AsyncStorage, buscar en SQLite local
      if (!rawUser && token) {
        const db = await getDb();
        if (db) {
          const localRow = await db.getFirstAsync<any>(`SELECT * FROM users WHERE token = ?`, [token]).catch(() => null);
          if (localRow) {
            const u: User = {
              id: localRow.id,
              email: localRow.email,
              name: localRow.name || localRow.email.split("@")[0],
              currency: localRow.currency || "PEN",
              theme: localRow.theme || "light",
            };
            setUser(u);
            await AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(u));
          }
        }
      }

      // 2. Liberar interfaz inmediatamente sin esperar la red
      setLoading(false);

      // 3. Verificación silenciosa en segundo plano (no bloquea ni cierra sesión si no hay internet)
      if (token) {
        api.get("/auth/me")
          .then(async (me) => {
            if (me && me.id) {
              setUser(me);
              await AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(me));
            }
          })
          .catch((err) => {
            // Sin conexión o servidor lento: la sesión local se mantiene
            // intacta. Se registra solo en consola, nunca como alerta
            // visible — el usuario ya está adentro con sus datos locales.
            console.warn("[sync] /auth/me falló (se mantiene la sesión local):", err);
          });
      }
    } catch {
      setLoading(false);
    } finally {
      syncOfflineUsers();
    }
  }, [syncOfflineUsers]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const db = await getDb();

    // 0. Camino rápido: si este dispositivo ya inició sesión antes con estas
    // credenciales, entra de inmediato con los datos locales en vez de
    // congelar el spinner esperando al servidor remoto (que puede tardar
    // varios segundos, p. ej. por un cold start). La verificación/renovación
    // del token corre después, en segundo plano, sin bloquear la UI.
    const localUser = db
      ? await db.getFirstAsync<any>(`SELECT * FROM users WHERE LOWER(TRIM(email)) = ?`, [cleanEmail]).catch(() => null)
      : null;

    if (localUser && localUser.password === password) {
      const u: User = {
        id: localUser.id,
        email: localUser.email,
        name: localUser.name || cleanEmail.split("@")[0],
        currency: localUser.currency || "PEN",
        theme: localUser.theme || "light",
      };
      if (localUser.token) {
        await AsyncStorage.setItem(TOKEN_KEY, localUser.token);
      }
      await AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(u));
      setUser(u);

      // Verificación silenciosa en segundo plano (no bloquea ni cierra sesión si falla)
      if (localUser.token) {
        api
          .get("/auth/me")
          .then(async (me) => {
            if (!me || !me.id) return;
            setUser(me);
            await AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(me));
            if (db) {
              await db.runAsync(
                `UPDATE users SET name = ?, currency = ?, theme = ? WHERE id = ?`,
                [me.name, me.currency || "PEN", me.theme || "light", me.id]
              ).catch(() => {});
            }
          })
          .catch((err) => console.warn("[sync] /auth/me falló (se mantiene la sesión local):", err));
      }
      return;
    }

    // 1. Sin sesión local válida en este dispositivo: intento online
    try {
      const res = await api.post("/auth/login", { email: cleanEmail, password });
      if (res && res.access_token) {
        await Promise.all([
          AsyncStorage.setItem(TOKEN_KEY, res.access_token),
          AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(res.user)),
        ]);
        setUser(res.user);

        // Guardar credenciales en SQLite para acceso instantáneo offline
        if (db) {
          await db.runAsync(
            `INSERT OR REPLACE INTO users (id, email, password, name, currency, theme, token, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              res.user.id,
              cleanEmail,
              password,
              res.user.name || cleanEmail.split("@")[0],
              res.user.currency || "PEN",
              res.user.theme || "light",
              res.access_token,
            ]
          ).catch(() => {});
        }
        return;
      }
    } catch (onlineErr: any) {
      const msg = String(onlineErr?.message || "").toLowerCase();
      const isNetworkError =
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("failed") ||
        msg.includes("servidor") ||
        msg.includes("timeout");

      // Si fue credenciales inválidas (401/400 del servidor), informar error real
      if (!isNetworkError && (msg.includes("incorrect") || msg.includes("inválid") || msg.includes("no existe"))) {
        throw onlineErr;
      }
    }

    // 2. Sin red (o credenciales que el servidor no pudo validar) y sin
    // coincidencia local válida: si existe un usuario local con ese correo
    // pero otra contraseña, es un error real; si no existe, nunca inició
    // sesión en este dispositivo y se requiere conexión.
    if (localUser && localUser.password !== password) {
      throw new Error("Contraseña incorrecta.");
    }

    throw new Error("Sin conexión a internet. Esta cuenta no ha iniciado sesión previamente en este dispositivo.");
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = (name || cleanEmail.split("@")[0]).trim();

    // 1. Intento Online
    try {
      const res = await api.post("/auth/register", {
        email: cleanEmail,
        password,
        name: displayName,
      });
      if (res && res.access_token) {
        await Promise.all([
          AsyncStorage.setItem(TOKEN_KEY, res.access_token),
          AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(res.user)),
        ]);
        setUser(res.user);

        const db = await getDb();
        if (db) {
          await db.runAsync(
            `INSERT OR REPLACE INTO users (id, email, password, name, currency, theme, token, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              res.user.id,
              cleanEmail,
              password,
              res.user.name,
              res.user.currency || "PEN",
              res.user.theme || "light",
              res.access_token,
            ]
          ).catch(() => {});
        }
        return;
      }
    } catch (onlineErr: any) {
      const msg = String(onlineErr?.message || "").toLowerCase();
      const isNetworkError =
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("failed") ||
        msg.includes("servidor");

      if (!isNetworkError) {
        throw onlineErr;
      }
    }

    // 2. Fallback Offline
    const tempId = "usr_local_" + Date.now();
    const tempToken = "offline_token_" + Date.now();

    const db = await getDb();
    if (db) {
      await db.runAsync(
        `INSERT OR REPLACE INTO users (id, email, password, name, currency, theme, token, synced)
         VALUES (?, ?, ?, ?, 'PEN', 'light', ?, 0)`,
        [tempId, cleanEmail, password, displayName, tempToken]
      ).catch(() => {});
    }

    const offlineUser: User = {
      id: tempId,
      email: cleanEmail,
      name: displayName,
      currency: "PEN",
      theme: "light",
    };

    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, tempToken),
      AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(offlineUser)),
    ]);
    setUser(offlineUser);
  }, []);

  // La única vía para salir del sistema
  const signOut = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(ACTIVE_USER_KEY),
    ]);
    setUser(null);
  }, []);

  const updateUser = useCallback(async (u: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...u };
      AsyncStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(updated));
      return updated;
    });

    try {
      await api.patch("/settings", u);
    } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signOut, updateUser, refresh: loadMe }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
