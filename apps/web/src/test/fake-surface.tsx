import { act } from "@testing-library/react";
import { useEffect } from "react";
import { vi } from "vitest";
import type { Surface, SurfaceControls, SurfaceState } from "../features/reader/reader-surface";

/**
 * A stand-in for the engine surface: it records what the page asks of it and reports the states a
 * test chooses with `emit`, so the page logic is tested without the real engine.
 */
export function makeFakeSurface() {
  const controls: { [K in keyof SurfaceControls]: ReturnType<typeof vi.fn> } = {
    goToPage: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitWidth: vi.fn(),
  };
  const fake = {
    controls,
    mounts: 0,
    sourceBytes: null as Uint8Array | null,
    sourceError: null as unknown,
    emitState: undefined as unknown as (state: SurfaceState) => void,
    emit(state: SurfaceState) {
      act(() => fake.emitState(state));
    },
    Surface: null as unknown as Surface,
  };
  fake.Surface = function FakeSurface({ source, onState, controlsRef }) {
    useEffect(() => {
      fake.mounts++;
      controlsRef.current = controls as unknown as SurfaceControls;
      fake.emitState = onState;
      source().then(
        (bytes) => (fake.sourceBytes = bytes),
        (error) => (fake.sourceError = error),
      );
      onState({ status: "loading" });
    }, []);
    return <div data-testid="surface" tabIndex={0} />;
  };
  return fake;
}

export const ready = (
  overrides: Partial<Extract<SurfaceState, { status: "ready" }>> = {},
): SurfaceState => ({
  status: "ready",
  pageCount: 10,
  currentPage: 1,
  zoom: 1,
  canZoomIn: true,
  canZoomOut: true,
  ...overrides,
});
