import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store";
import { fetchCaller, resetAuth } from "../store/authSlice";
import type { ICaller } from "../types";

export interface IUseCallerResult {
  caller: ICaller | null;
  status: "idle" | "loading" | "succeeded" | "error";
  error: string | null;
  /** Force a re-probe (resets auth then dispatches fetchCaller). */
  refetch: () => void;
}

/**
 * Resolves the caller identity once on mount and exposes the lifecycle to
 * components. Returns `caller: null, status: 'succeeded'` for confirmed
 * unauthenticated users — distinct from `status: 'idle'` (never asked) and
 * `status: 'error'` (network/JWT failure). The effect only fires on `idle`,
 * so an unauthenticated answer no longer triggers a fetch loop.
 */
export function useCaller(): IUseCallerResult {
  const dispatch = useDispatch<AppDispatch>();
  const caller = useSelector((s: RootState) => s.auth.caller);
  const status = useSelector((s: RootState) => s.auth.status);
  const error = useSelector((s: RootState) => s.auth.error);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchCaller());
    }
  }, [dispatch, status]);

  const refetch = useCallback(() => {
    dispatch(resetAuth());
    dispatch(fetchCaller());
  }, [dispatch]);

  return { caller, status, error, refetch };
}
