/** Tests for the auth slice — driving the Plan 3 caller lifecycle. */
import { describe, it, expect } from "vitest";
import authReducer, {
  fetchCaller,
  login,
  logout,
  refresh,
  changePassword,
  resetAuth,
} from "../authSlice";
import { ApiError } from "../../utils/api";
import type { ICaller } from "../../types";
import { EStaffRole } from "@bee-epic/shared";

const OWNER: ICaller = {
  email: "owner@test",
  role: EStaffRole.OWNER,
  via: "cookie",
};

describe("authSlice status transitions", () => {
  it("starts in idle with no caller and no in-flight flags", () => {
    const state = authReducer(undefined, { type: "@@INIT" });
    expect(state.status).toBe("idle");
    expect(state.caller).toBeNull();
    expect(state.error).toBeNull();
    expect(state.bootstrapAvailable).toBeNull();
    expect(state.loginInFlight).toBe(false);
    expect(state.logoutInFlight).toBe(false);
    expect(state.refreshInFlight).toBe(false);
  });

  it("transitions idle → loading on pending", () => {
    const state = authReducer(undefined, fetchCaller.pending("", undefined));
    expect(state.status).toBe("loading");
  });

  it("transitions loading → succeeded when caller resolves (non-null)", () => {
    const loaded = authReducer(undefined, fetchCaller.pending("", undefined));
    const done = authReducer(
      loaded,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    expect(done.status).toBe("succeeded");
    expect(done.caller).toEqual(OWNER);
    // undefined → null in state (unknown)
    expect(done.bootstrapAvailable).toBeNull();
  });

  it("transitions loading → succeeded when caller is null (unauthenticated) and stays there", () => {
    // Critical case: previously the slice set status back to 'idle' on null,
    // which made useCaller's effect re-fire forever. With 'succeeded' as the
    // terminal state for "we asked and got an answer", the effect can settle.
    const loading = authReducer(undefined, fetchCaller.pending("", undefined));
    const done = authReducer(
      loading,
      fetchCaller.fulfilled(
        { caller: null, bootstrapAvailable: true },
        "",
        undefined,
      ),
    );
    expect(done.status).toBe("succeeded");
    expect(done.caller).toBeNull();
    expect(done.bootstrapAvailable).toBe(true);
  });

  it("transitions loading → error on rejection and exposes a message", () => {
    const loading = authReducer(undefined, fetchCaller.pending("", undefined));
    const rejected = authReducer(
      loading,
      fetchCaller.rejected(new Error("boom"), "", undefined),
    );
    expect(rejected.status).toBe("error");
    expect(rejected.error).toBe("boom");
  });

  it("resetAuth returns the slice to idle with caller, error, bootstrapAvailable and in-flight flags cleared", () => {
    const start = authReducer(undefined, fetchCaller.pending("", undefined));
    const errored = authReducer(
      start,
      fetchCaller.rejected(new Error("boom"), "", undefined),
    );
    // Simulate a mid-flight refresh so we can verify the flag clears too.
    const withFlags = authReducer(errored, refresh.pending("", undefined));
    const reset = authReducer(withFlags, resetAuth());
    expect(reset.status).toBe("idle");
    expect(reset.caller).toBeNull();
    expect(reset.error).toBeNull();
    expect(reset.bootstrapAvailable).toBeNull();
    expect(reset.loginInFlight).toBe(false);
    expect(reset.logoutInFlight).toBe(false);
    expect(reset.refreshInFlight).toBe(false);
  });
});

describe("authSlice login", () => {
  it("sets loginInFlight while pending", () => {
    const state = authReducer(
      undefined,
      login.pending("", { email: "", password: "" }),
    );
    expect(state.loginInFlight).toBe(true);
  });

  it("login.fulfilled sets caller, clears bootstrapAvailable to null, clears loginInFlight", () => {
    const priming = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: null, bootstrapAvailable: true },
        "",
        undefined,
      ),
    );
    expect(priming.bootstrapAvailable).toBe(true);

    const pending = authReducer(
      priming,
      login.pending("", { email: "owner@test", password: "pw" }),
    );
    const done = authReducer(
      pending,
      login.fulfilled(OWNER, "", { email: "owner@test", password: "pw" }),
    );
    expect(done.caller).toEqual(OWNER);
    expect(done.status).toBe("succeeded");
    expect(done.error).toBeNull();
    expect(done.bootstrapAvailable).toBeNull();
    expect(done.loginInFlight).toBe(false);
  });

  it("login.rejected with an ApiError payload stores the API code as the error message and clears loginInFlight", () => {
    // The thunk rejects with `rejectWithValue(err.apiError)` when it catches an
    // ApiError; the reducer derives a stable string from `code` (documented:
    // we store the code string so downstream tests / pages can match on it).
    const pending = authReducer(
      undefined,
      login.pending("", { email: "e", password: "p" }),
    );
    const rejected = authReducer(
      pending,
      login.rejected(
        new Error("Rejected"),
        "",
        { email: "e", password: "p" },
        { code: "UNAUTHORIZED" },
      ),
    );
    expect(rejected.status).toBe("error");
    expect(rejected.error).toBe("UNAUTHORIZED");
    expect(rejected.loginInFlight).toBe(false);
  });

  it("login.rejected with a string payload uses the string as the error message", () => {
    const pending = authReducer(
      undefined,
      login.pending("", { email: "e", password: "p" }),
    );
    const rejected = authReducer(
      pending,
      login.rejected(
        new Error("Rejected"),
        "",
        { email: "e", password: "p" },
        "Login failed",
      ),
    );
    expect(rejected.status).toBe("error");
    expect(rejected.error).toBe("Login failed");
    expect(rejected.loginInFlight).toBe(false);
  });
});

describe("authSlice logout", () => {
  it("logout.pending sets logoutInFlight", () => {
    const state = authReducer(undefined, logout.pending("", undefined));
    expect(state.logoutInFlight).toBe(true);
  });

  it("logout.fulfilled resets caller to null and clears logoutInFlight", () => {
    const start = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const pending = authReducer(start, logout.pending("", undefined));
    const done = authReducer(
      pending,
      logout.fulfilled(undefined, "", undefined),
    );
    expect(done.caller).toBeNull();
    expect(done.status).toBe("succeeded");
    expect(done.error).toBeNull();
    expect(done.logoutInFlight).toBe(false);
  });

  it("logout.rejected still resets caller to null (client forgets caller even if server unreachable)", () => {
    const start = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const pending = authReducer(start, logout.pending("", undefined));
    const done = authReducer(
      pending,
      logout.rejected(new Error("network"), "", undefined),
    );
    expect(done.caller).toBeNull();
    expect(done.status).toBe("succeeded");
    expect(done.error).toBeNull();
    expect(done.logoutInFlight).toBe(false);
  });
});

describe("authSlice refresh", () => {
  it("refresh.pending sets refreshInFlight (the interceptor mutex)", () => {
    const state = authReducer(undefined, refresh.pending("", undefined));
    expect(state.refreshInFlight).toBe(true);
  });

  it("refresh.fulfilled clears refreshInFlight and leaves caller/status untouched", () => {
    const primed = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const pending = authReducer(primed, refresh.pending("", undefined));
    expect(pending.refreshInFlight).toBe(true);
    const done = authReducer(
      pending,
      refresh.fulfilled(undefined, "", undefined),
    );
    expect(done.refreshInFlight).toBe(false);
    expect(done.caller).toEqual(OWNER);
    expect(done.status).toBe("succeeded");
  });

  it("refresh.rejected clears refreshInFlight AND resets caller to null", () => {
    const primed = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const pending = authReducer(primed, refresh.pending("", undefined));
    const done = authReducer(
      pending,
      refresh.rejected(new Error("expired"), "", undefined),
    );
    expect(done.refreshInFlight).toBe(false);
    expect(done.caller).toBeNull();
    expect(done.status).toBe("succeeded");
    expect(done.error).toBeNull();
  });
});

describe("authSlice changePassword", () => {
  it("changePassword.fulfilled leaves caller intact (session survives)", () => {
    const primed = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const done = authReducer(
      primed,
      changePassword.fulfilled(undefined, "", {
        currentPassword: "old",
        newPassword: "new",
      }),
    );
    expect(done.caller).toEqual(OWNER);
    // status untouched — still 'succeeded' from the fetchCaller that primed it
    expect(done.status).toBe("succeeded");
  });

  it("changePassword.rejected with ApiError payload stores the code in state.error", () => {
    const primed = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    const rejected = authReducer(
      primed,
      changePassword.rejected(
        new Error("Rejected"),
        "",
        { currentPassword: "old", newPassword: "new" },
        { code: "BAD_REQUEST", message: "Current password is wrong" },
      ),
    );
    // Caller stays put — server contract: current session survives failed change.
    expect(rejected.caller).toEqual(OWNER);
    expect(rejected.error).toBe("BAD_REQUEST");
  });
});

describe("authSlice fetchCaller (widened payload)", () => {
  it("stores caller and bootstrapAvailable=null when payload.bootstrapAvailable is undefined", () => {
    const done = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: OWNER, bootstrapAvailable: undefined },
        "",
        undefined,
      ),
    );
    expect(done.caller).toEqual(OWNER);
    expect(done.bootstrapAvailable).toBeNull();
  });

  it("stores caller=null and bootstrapAvailable=true when server signals bootstrap", () => {
    const done = authReducer(
      undefined,
      fetchCaller.fulfilled(
        { caller: null, bootstrapAvailable: true },
        "",
        undefined,
      ),
    );
    expect(done.caller).toBeNull();
    expect(done.bootstrapAvailable).toBe(true);
    expect(done.status).toBe("succeeded");
  });
});

// Guard against dead code: `ApiError` must still be exported so the thunk can
// narrow errors against it. (The thunk imports it directly.)
describe("authSlice module surface", () => {
  it("re-uses ApiError from utils/api", () => {
    expect(ApiError).toBeDefined();
  });
});
