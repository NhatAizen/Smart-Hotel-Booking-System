import apiClient from "../api/apiClient";

export async function loginRequest(payload) {
  const response = await apiClient.post(
    "/auth/login",
    payload,
  );

  return response.data;
}

export async function registerRequest(payload) {
  const response = await apiClient.post(
    "/auth/register",
    payload,
  );

  return response.data;
}

export async function refreshTokenRequest(refreshToken) {
  const response = await apiClient.post(
    "/auth/refresh",
    {
      refreshToken,
    },
  );

  return response.data;
}

export async function forgotPasswordRequest(email) {
  const response = await apiClient.post(
    "/auth/forgot-password",
    {
      email,
    },
  );

  return response.data;
}

export async function resetPasswordRequest(
  token,
  newPassword,
) {
  const response = await apiClient.post(
    "/auth/reset-password",
    {
      token,
      newPassword,
    },
  );

  return response.data;
}

export async function verifyEmailRequest(token) {
  const response = await apiClient.get(
    "/auth/verify-email",
    {
      params: {
        token,
      },
    },
  );

  return response.data;
}

export async function resendVerificationRequest(email) {
  const response = await apiClient.post(
    "/auth/resend-verification",
    {
      email,
    },
  );

  return response.data;
}

export async function exchangeOAuth2CodeRequest(code) {
  const response = await apiClient.post(
    "/auth/oauth2/exchange",
    {
      code,
    },
  );

  return response.data;
}