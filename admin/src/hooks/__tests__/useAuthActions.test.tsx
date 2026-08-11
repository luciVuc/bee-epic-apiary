/** Tests for the useAuthActions hook — Task 10.8 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore, type Store } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import authReducer from "../../store/authSlice";
import { useAuthActions } from "../useAuthActions";
import * as api from "../../utils/api";
import { ApiError } from "../../utils/api";
import type { ICaller } from "../../types";

function makeStore(): Store {
  return configureStore({ reducer: { auth: authReducer } });
}

function withStore(store: Store) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe("useAuthActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("login({email, password}) dispatches the login thunk with the payload and resolves to the ICaller", async () => {
    const caller: ICaller = {
      email: "u@x",
      role: "OWNER" as ICaller["role"],
      via: "cookie",
    };
    const loginSpy = vi.spyOn(api.api, "login").mockResolvedValue(caller);

    const store = makeStore();
    const { result } = renderHook(() => useAuthActions(), {
      wrapper: withStore(store),
    });

    let resolved: ICaller | undefined;
    await act(async () => {
      resolved = await result.current.login({ email: "u@x", password: "p" });
    });

    expect(loginSpy).toHaveBeenCalledWith({ email: "u@x", password: "p" });
    expect(resolved).toEqual(caller);
  });

  it("propagates success (logout resolves to undefined) and rejection (login throws the IApiError payload)", async () => {
    // Success case — logout resolves to undefined.
    vi.spyOn(api.api, "logout").mockResolvedValue(undefined);
    const store = makeStore();
    const { result } = renderHook(() => useAuthActions(), {
      wrapper: withStore(store),
    });
    let logoutResult: unknown = "sentinel";
    await act(async () => {
      logoutResult = await result.current.logout();
    });
    expect(logoutResult).toBeUndefined();

    // Rejection case — login throws with the IApiError shape.
    vi.spyOn(api.api, "login").mockRejectedValue(
      new ApiError({ code: "UNAUTHORIZED" }),
    );
    let caught: { code?: string } | undefined;
    await act(async () => {
      try {
        await result.current.login({ email: "u@x", password: "bad" });
      } catch (err) {
        caught = err as { code?: string };
      }
    });
    expect(caught?.code).toBe("UNAUTHORIZED");
  });

  it("returns stable references across renders (useCallback preserves identities)", () => {
    const store = makeStore();
    const { result, rerender } = renderHook(() => useAuthActions(), {
      wrapper: withStore(store),
    });
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.login).toBe(first.login);
    expect(second.logout).toBe(first.logout);
    expect(second.refresh).toBe(first.refresh);
    expect(second.changePassword).toBe(first.changePassword);
  });
});
