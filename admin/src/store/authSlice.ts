/** Redux slice for caller (authentication) state */
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { ICaller } from "../types";
import type { IApiError } from "@bee-epic/shared";
import * as api from "../utils/api";
import { ApiError } from "../utils/api";

export interface IAuthState {
  caller: ICaller | null;
  status: "idle" | "loading" | "succeeded" | "error";
  error: string | null;
  /**
   * Whether the server offers first-time OWNER bootstrap. `null` = unknown
   * (either we haven't asked or the caller is authenticated so the flag is
   * irrelevant). Populated by `fetchCaller.fulfilled` on the null-caller
   * branch and cleared to `null` on successful login.
   */
  bootstrapAvailable: boolean | null;
  loginInFlight: boolean;
  logoutInFlight: boolean;
  /**
   * True while a `refresh()` thunk is in flight. Doubles as the 401-
   * interceptor mutex (Task 10.9): the interceptor reads this flag to
   * coalesce concurrent refresh attempts triggered by parallel failing
   * requests.
   */
  refreshInFlight: boolean;
}

const initialState: IAuthState = {
  caller: null,
  status: "idle",
  error: null,
  bootstrapAvailable: null,
  loginInFlight: false,
  logoutInFlight: false,
  refreshInFlight: false,
};

/**
 * Fetch the resolved caller identity plus (if unauthenticated) the
 * `bootstrapAvailable` flag from `/whoami`. The full `{caller,
 * bootstrapAvailable?}` shape is stored so the SPA can render either the
 * login page or the first-time OWNER bootstrap flow.
 */
export const fetchCaller = createAsyncThunk("auth/fetchCaller", async () => {
  return await api.api.getWhoami();
});

/**
 * Reject payload shape for the auth thunks: either the structured
 * `IApiError` from the server (so components / reducers can key on
 * `code`) or a bare string fallback for network / unknown errors.
 */
type AuthRejectPayload = IApiError | string;

/**
 * Derive the `state.error` string from a thunk-rejected action's payload.
 * When the thunk called `rejectWithValue(err.apiError)` we get an
 * `IApiError` — we store its `code` so downstream tests / pages can match
 * on it. Otherwise the payload is already a string; fall back to
 * `action.error.message` when neither is present.
 */
function errorFromRejection(
  payload: unknown,
  fallbackMessage: string | undefined,
): string {
  if (payload && typeof payload === "object" && "code" in payload) {
    return (payload as IApiError).code;
  }
  if (typeof payload === "string") return payload;
  return fallbackMessage ?? "Unknown error";
}

/** Sign in with email + password. Server sets the session cookies. */
export const login = createAsyncThunk<
  ICaller,
  { email: string; password: string },
  { rejectValue: AuthRejectPayload }
>("auth/login", async (params, { rejectWithValue }) => {
  try {
    return await api.api.login(params);
  } catch (err: unknown) {
    if (err instanceof ApiError) return rejectWithValue(err.apiError);
    return rejectWithValue(err instanceof Error ? err.message : "Login failed");
  }
});

/**
 * Clear the session cookies. Even if the server call fails (network
 * unreachable, expired session, …) the client still forgets the caller so
 * the UX cannot get stuck in a "signed in" state pointing at nothing.
 */
export const logout = createAsyncThunk<
  void,
  void,
  { rejectValue: AuthRejectPayload }
>("auth/logout", async (_, { rejectWithValue }) => {
  try {
    await api.api.logout();
  } catch (err: unknown) {
    if (err instanceof ApiError) return rejectWithValue(err.apiError);
    return rejectWithValue(
      err instanceof Error ? err.message : "Logout failed",
    );
  }
});

/**
 * Rotate the access + refresh cookies. The 401 interceptor (Task 10.9)
 * reads `state.auth.refreshInFlight` to coalesce concurrent attempts.
 * On success the reducer intentionally leaves `caller`/`status` untouched
 * because the server rotated the cookie in place.
 */
export const refresh = createAsyncThunk<
  void,
  void,
  { rejectValue: AuthRejectPayload }
>("auth/refresh", async (_, { rejectWithValue }) => {
  try {
    await api.api.refresh();
  } catch (err: unknown) {
    if (err instanceof ApiError) return rejectWithValue(err.apiError);
    return rejectWithValue(
      err instanceof Error ? err.message : "Refresh failed",
    );
  }
});

/**
 * Change the current caller's password. Server contract: the current
 * session survives, so the reducer leaves `caller` untouched on both
 * `.pending` and `.fulfilled`; only `.rejected` writes to `state.error`.
 */
export const changePassword = createAsyncThunk<
  void,
  { currentPassword: string; newPassword: string },
  { rejectValue: AuthRejectPayload }
>("auth/changePassword", async (params, { rejectWithValue }) => {
  try {
    await api.api.changePassword(params);
  } catch (err: unknown) {
    if (err instanceof ApiError) return rejectWithValue(err.apiError);
    return rejectWithValue(
      err instanceof Error ? err.message : "Change password failed",
    );
  }
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /**
     * Returns the auth slice to its initial idle state. Used by the 401
     * interceptor (Task 10.9) on refresh failure to force `useCaller` to
     * re-probe, and by the hook's `refetch()` helper for explicit
     * re-checks. Clears every field including the three in-flight flags
     * and `bootstrapAvailable`.
     */
    resetAuth: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      /* ------------------------------ fetchCaller ------------------------- */
      .addCase(fetchCaller.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCaller.fulfilled, (state, action) => {
        // 'succeeded' on a null caller is intentional: we asked the worker
        // and it answered "not authenticated". Setting status back to 'idle'
        // would cause useCaller's effect to re-fire forever.
        state.caller = action.payload.caller;
        state.bootstrapAvailable = action.payload.bootstrapAvailable ?? null;
        state.status = "succeeded";
        state.error = null;
      })
      .addCase(fetchCaller.rejected, (state, action) => {
        state.status = "error";
        state.error = action.error.message ?? "Failed to fetch caller";
      })
      /* ------------------------------ login ------------------------------- */
      .addCase(login.pending, (state) => {
        state.loginInFlight = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.caller = action.payload;
        state.status = "succeeded";
        state.error = null;
        state.bootstrapAvailable = null;
        state.loginInFlight = false;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "error";
        state.error = errorFromRejection(action.payload, action.error.message);
        state.loginInFlight = false;
      })
      /* ------------------------------ logout ------------------------------ */
      .addCase(logout.pending, (state) => {
        state.logoutInFlight = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.caller = null;
        state.status = "succeeded";
        state.error = null;
        state.logoutInFlight = false;
      })
      .addCase(logout.rejected, (state) => {
        // Logout must not fail the UX. Reset locally even on server error.
        state.caller = null;
        state.status = "succeeded";
        state.error = null;
        state.logoutInFlight = false;
      })
      /* ------------------------------ refresh ----------------------------- */
      .addCase(refresh.pending, (state) => {
        state.refreshInFlight = true;
      })
      .addCase(refresh.fulfilled, (state) => {
        // Server rotated the cookie — caller / status intentionally untouched.
        state.refreshInFlight = false;
      })
      .addCase(refresh.rejected, (state) => {
        // Refresh failure means the session is gone; drop the caller so
        // guards route the user to /login. The 401 interceptor will also
        // dispatch resetAuth() but doing it here keeps the slice consistent
        // even if refresh is called directly.
        state.refreshInFlight = false;
        state.caller = null;
        state.status = "succeeded";
        state.error = null;
      })
      /* ------------------------------ changePassword ---------------------- */
      .addCase(changePassword.fulfilled, (state) => {
        // Session survives — no caller / status changes.
        state.error = null;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.error = errorFromRejection(action.payload, action.error.message);
      });
  },
});

export const { resetAuth } = authSlice.actions;
export default authSlice.reducer;
