export interface AtemMultiviewCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Standard ATEM Mini Extreme 2+8 multiview layout: preview/program occupy the
 * top half and inputs 1-8 occupy a four-by-two grid in the bottom half.
 */
export function atemTwoPlusEightInputCrop(inputNumber: number): AtemMultiviewCrop {
  if (!Number.isInteger(inputNumber) || inputNumber < 1 || inputNumber > 8) {
    throw new RangeError("ATEM multiview input number must be between 1 and 8");
  }

  const index = inputNumber - 1;
  return {
    left: (index % 4) * 0.25,
    top: 0.5 + Math.floor(index / 4) * 0.25,
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
