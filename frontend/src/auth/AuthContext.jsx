import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  exchangeOAuth2CodeRequest,
  loginRequest,
  registerRequest,
} from "../services/authService";
import { getMyProfile } from "../services/profileService";

import {
  buildUserFromToken,
  isTokenExpired,
} from "../utils/jwt";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(
    localStorage.getItem("accessToken"),
  );

  const [refreshToken, setRefreshToken] = useState(
    localStorage.getItem("refreshToken"),
  );

  const [user, setUser] = useState(() => {
    const storedToken =
      localStorage.getItem("accessToken");

    if (
      !storedToken ||
      isTokenExpired(storedToken)
    ) {
      return null;
    }

    return buildUserFromToken(storedToken);
  });

  const [loading, setLoading] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("rememberMe");

    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const saveAuthentication = useCallback(
    (data, rememberMe = true) => {
      const newAccessToken =
        data.accessToken ?? data.token ?? null;

      const newRefreshToken =
        data.refreshToken ?? null;

      if (!newAccessToken) {
        throw new Error(
          "Phản hồi đăng nhập không có accessToken",
        );
      }

      localStorage.setItem(
        "accessToken",
        newAccessToken,
      );

      if (newRefreshToken) {
        localStorage.setItem(
          "refreshToken",
          newRefreshToken,
        );
      } else {
        localStorage.removeItem("refreshToken");
      }

      localStorage.setItem(
        "rememberMe",
        String(Boolean(rememberMe)),
      );

      const currentUser =
        buildUserFromToken(newAccessToken);

      localStorage.setItem(
        "user",
        JSON.stringify(currentUser),
      );

      setAccessToken(newAccessToken);
      setRefreshToken(newRefreshToken);
      setUser(currentUser);

      return currentUser;
    },
    [],
  );

  const updateCachedUser = useCallback((profile) => {
    if (!profile) {
      return null;
    }

    setUser((current) => {
      const merged = {
        ...(current ?? {}),
        ...profile,
      };

      localStorage.setItem(
        "user",
        JSON.stringify(merged),
      );

      return merged;
    });

    return profile;
  }, []);

  const refreshUserProfile = useCallback(async () => {
    if (!accessToken || isTokenExpired(accessToken)) {
      return null;
    }

    const profile = await getMyProfile();
    updateCachedUser(profile);
    return profile;
  }, [accessToken, updateCachedUser]);

  const login = useCallback(
    async (credentials, options = {}) => {
      setLoading(true);

      try {
        const data = await loginRequest(credentials);

        return saveAuthentication(
          data,
          options.rememberMe ?? true,
        );
      } finally {
        setLoading(false);
      }
    },
    [saveAuthentication],
  );

  const loginWithOAuth2Code = useCallback(
    async (code) => {
      setLoading(true);

      try {
        const data =
          await exchangeOAuth2CodeRequest(code);

        return saveAuthentication(data, true);
      } finally {
        setLoading(false);
      }
    },
    [saveAuthentication],
  );

  const register = useCallback(
    async (payload) => {
      setLoading(true);

      try {
        return await registerRequest(payload);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      !accessToken ||
      isTokenExpired(accessToken)
    ) {
      if (accessToken) {
        logout();
      }

      return;
    }

    const tokenUser = buildUserFromToken(accessToken);
    setUser((current) => ({
      ...tokenUser,
      ...(current ?? {}),
      userId: tokenUser.userId,
      email: tokenUser.email,
      role: tokenUser.role,
    }));

    refreshUserProfile().catch(() => {
      // Giữ thông tin từ JWT nếu identity-service tạm thời chưa phản hồi.
    });
  }, [accessToken, logout, refreshUserProfile]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      user,
      loading,
      isAuthenticated: Boolean(
        accessToken && user,
      ),
      login,
      loginWithOAuth2Code,
      register,
      logout,
      refreshUserProfile,
      updateCachedUser,
    }),
    [
      accessToken,
      refreshToken,
      user,
      loading,
      login,
      loginWithOAuth2Code,
      register,
      logout,
      refreshUserProfile,
      updateCachedUser,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth phải được dùng bên trong AuthProvider",
    );
  }

  return context;
}
