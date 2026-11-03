type View = {x: number; y: number; width: number};
export function attachPlanCamera(svg: SVGSVGElement, previous?: View): {
  reset(): void;
  zoom(direction: number): void;
  snapshot(): View;
  dispose(): void;
};
