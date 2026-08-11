/** Tests for the useCaller hook — Plan 3 lifecycle */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore, type Store, type AnyAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import authReducer from "../../store/authSlice";
import { useCaller } from "../useCaller";
import * as api from "../../utils/api";

function makeStore(): Store {
  return configureStore({ reducer: { auth: authReducer } });
}

function withStore(store: Store) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe("useCaller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches fetchCaller exactly once across multiple mounts when status leaves 'idle'", async () => {
    // Pin the network call so the thunk resolves deterministically.
    vi.spyOn(api.api, "getWhoami").mockResolvedValue({ caller: null });

    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, "dispatch");

    renderHook(() => useCaller(), { wrapper: withStore(store) });
    // Let the thunk's pending/fulfilled cycle run.
    await new Promise((r) => setTimeout(r, 0));

    // Mount two more hook instances. They observe status='succeeded' and must NOT re-fire.
    renderHook(() => useCaller(), { wrapper: withStore(store) });
    renderHook(() => useCaller(), { wrapper: withStore(store) });

    // Only the first mount should have dispatched the thunk.
    const thunkDispatches = dispatchSpy.mock.calls.filter(([action]) => {
      if (typeof action === "function") return true;
      const a = action as AnyAction;
      return (
        typeof a?.type === "string" && a.type.startsWith("auth/fetchCaller")
      );
    });
    // The thunk itself counts as 1 dispatch + 1 pending lifecycle action + 1 fulfilled
    // action. The thunk-as-function dispatch is the only one that triggers a NEW
    // network call; lifecycle actions are bookkeeping. Assert at most one
    // function-typed dispatch (the network probe).
    const functionDispatches = dispatchSpy.mock.calls.filter(
      ([a]) => typeof a === "function",
    );
    expect(functionDispatches.length).toBe(1);
    expect(thunkDispatches.length).toBeGreaterThanOrEqual(1);
  });

  it("returns { caller, status, error, refetch } with caller exposed even when null", async () => {
    vi.spyOn(api.api, "getWhoami").mockResolvedValue({ caller: null });
    const store = makeStore();
    const { result } = renderHook(() => useCaller(), {
      wrapper: withStore(store),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.caller).toBeNull();
    expect(["loading", "succeeded"]).toContain(result.current.status);
    expect(typeof result.current.refetch).toBe("function");
  });

  it("refetch() re-dispatches fetchCaller even after a previous resolution", async () => {
    const probe = vi
      .spyOn(api.api, "getWhoami")
      .mockResolvedValue({ caller: null });
    const store = makeStore();
    const { result } = renderHook(() => useCaller(), {
      wrapper: withStore(store),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(probe).toHaveBeenCalledTimes(1);
    result.current.refetch();
    await new Promise((r) => setTimeout(r, 0));
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
