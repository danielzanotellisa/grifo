import { act } from "@testing-library/react";
import { useEffect } from "react";
import { vi } from "vitest";
import type {
  SelectionInfo,
  Surface,
  SurfaceControls,
  SurfaceProps,
  SurfaceState,
} from "../features/reader/reader-surface";

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
    clearSelection: vi.fn(),
  };
  const fake = {
    controls,
    mounts: 0,
    sourceBytes: null as Uint8Array | null,
    sourceError: null as unknown,
    emitState: undefined as unknown as (state: SurfaceState) => void,
    emitSelection: undefined as unknown as (selection: SelectionInfo | null) => void,
    /** The props the page gave the surface last (`highlights` changes after every refresh). */
    lastProps: null as SurfaceProps | null,
    emit(state: SurfaceState) {
      act(() => fake.emitState(state));
    },
    select(selection: SelectionInfo | null) {
      act(() => fake.emitSelection(selection));
    },
    Surface: null as unknown as Surface,
  };
  fake.Surface = function FakeSurface(props) {
    const { source, onState, controlsRef, onSelection } = props;
    fake.lastProps = props;
    // Wired while rendering, not in an effect: a test that waits for the surface to appear may emit at once.
    fake.emitState = onState;
    fake.emitSelection = onSelection;
    useEffect(() => {
      fake.mounts++;
      controlsRef.current = controls as unknown as SurfaceControls;
      source().then(
        (bytes) => (fake.sourceBytes = bytes),
        (error) => (fake.sourceError = error),
      );
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
