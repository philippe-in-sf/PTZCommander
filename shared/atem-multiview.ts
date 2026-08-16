export interface AtemMultiviewCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM = 3;
export const ATEM_MULTIVIEW_LAYOUT_PROGRAM_TOP = 12;

/**
 * Resolve one of the eight small windows in ATEM Mini Extreme layouts where
 * Preview and Program share either the top or bottom half of the Multiview.
 */
export function atemTwoPlusEightWindowCrop(layout: number, windowIndex: number): AtemMultiviewCrop | null {
  if (!Number.isInteger(windowIndex) || windowIndex < 0 || windowIndex > 7) {
    return null;
  }
  if (layout !== ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM && layout !== ATEM_MULTIVIEW_LAYOUT_PROGRAM_TOP) {
    return null;
  }

  const inputGridTop = layout === ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM ? 0 : 0.5;
  return {
    left: (windowIndex % 4) * 0.25,
    top: inputGridTop + Math.floor(windowIndex / 4) * 0.25,
    width: 0.25,
    height: 0.25,
  };
}

export function atemMultiviewVideoStyle(crop: AtemMultiviewCrop) {
  return {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-(crop.left / crop.width) * 100}%`,
    top: `${-(crop.top / crop.height) * 100}%`,
  };
}
