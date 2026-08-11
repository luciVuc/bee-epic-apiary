import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store";
import { login, logout, refresh, changePassword } from "../store/authSlice";
import type { ICaller } from "../types";

export interface IUseAuthActionsResult {
  login: (params: { email: string; password: string }) => Promise<ICaller>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (params: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}

/**
 * Wraps the auth-slice thunks in a hook so component code never touches
 * `useDispatch` or imports thunks directly. Each returned function is a
 * `useCallback`-stable wrapper around `dispatch(thunk(payload)).unwrap()`.
 *
 * Why `.unwrap()`: RTK's `createAsyncThunk` dispatch returns a promise that
 * always resolves with either `{payload}` or `{error}`. Calling `.unwrap()`
 * yields the raw payload on `.fulfilled` and THROWS on `.rejected`, so
 * component code can `try/catch` like a normal async function. When the
 * thunk rejected via `rejectWithValue(err.apiError)` (as `login` and
 * `changePassword` do — see authSlice.ts), the thrown value IS the
 * `IApiError` payload, letting callers key on `err.code`.
 *
 * Return-type split: `login` yields the `ICaller` (the thunk resolves with
 * `data.caller`); `logout` / `refresh` / `changePassword` collapse to
 * `Promise<void>` because their fulfilled payloads are API response
 * wrappers that consumers don't need — they only care about success or
 * failure.
 */
export function useAuthActions(): IUseAuthActionsResult {
  const dispatch = useDispatch<AppDispatch>();

  const doLogin = useCallback(
    (params: { email: string; password: string }): Promise<ICaller> =>
      dispatch(login(params)).unwrap(),
    [dispatch],
  );

  const doLogout = useCallback(
    (): Promise<void> =>
      dispatch(logout())
        .unwrap()
        .then(() => undefined),
    [dispatch],
  );

  const doRefresh = useCallback(
    (): Promise<void> =>
      dispatch(refresh())
        .unwrap()
        .then(() => undefined),
    [dispatch],
  );

  const doChangePassword = useCallback(
    (params: { currentPassword: string; newPassword: string }): Promise<void> =>
      dispatch(changePassword(params))
        .unwrap()
        .then(() => undefined),
    [dispatch],
  );

  return {
    login: doLogin,
    logout: doLogout,
    refresh: doRefresh,
    changePassword: doChangePassword,
  };
}
