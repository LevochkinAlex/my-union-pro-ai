/**
 * Дублирует computeCroppedArea из react-easy-crop (rotation=0), чтобы при сохранении
 * можно было получить croppedAreaPixels, если колбэк ещё не успел отработать.
 * @see https://github.com/ValentinH/react-easy-crop (MIT)
 */
import type { Area, MediaSize, Point, Size } from "react-easy-crop";

function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number): Size {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

function limitArea(max: number, value: number): number {
  return Math.min(max, Math.max(0, value));
}

function noOp(_max: number, value: number): number {
  return value;
}

export function computePartnerLogoCroppedPixels(
  crop: Point,
  mediaSize: MediaSize,
  cropSize: Size,
  aspect: number,
  zoom: number,
  rotation = 0,
  restrictPosition = true
): Area {
  const limitAreaFn = restrictPosition ? limitArea : noOp;
  const mediaBBoxSize = rotateSize(mediaSize.width, mediaSize.height, rotation);
  const mediaNaturalBBoxSize = rotateSize(mediaSize.naturalWidth, mediaSize.naturalHeight, rotation);

  const croppedAreaPercentages = {
    x: limitAreaFn(
      100,
      ((mediaBBoxSize.width - cropSize.width / zoom) / 2 - crop.x / zoom) / mediaBBoxSize.width * 100
    ),
    y: limitAreaFn(
      100,
      ((mediaBBoxSize.height - cropSize.height / zoom) / 2 - crop.y / zoom) / mediaBBoxSize.height * 100
    ),
    width: limitAreaFn(100, (cropSize.width / mediaBBoxSize.width) * 100 / zoom),
    height: limitAreaFn(100, (cropSize.height / mediaBBoxSize.height) * 100 / zoom),
  };

  const widthInPixels = Math.round(
    limitAreaFn(mediaNaturalBBoxSize.width, (croppedAreaPercentages.width * mediaNaturalBBoxSize.width) / 100)
  );
  const heightInPixels = Math.round(
    limitAreaFn(mediaNaturalBBoxSize.height, (croppedAreaPercentages.height * mediaNaturalBBoxSize.height) / 100)
  );
  const isImgWiderThanHigh = mediaNaturalBBoxSize.width >= mediaNaturalBBoxSize.height * aspect;
  const sizePixels = isImgWiderThanHigh
    ? { width: Math.round(heightInPixels * aspect), height: heightInPixels }
    : { width: widthInPixels, height: Math.round(widthInPixels / aspect) };

  return {
    ...sizePixels,
    x: Math.round(
      limitAreaFn(
        mediaNaturalBBoxSize.width - sizePixels.width,
        (croppedAreaPercentages.x * mediaNaturalBBoxSize.width) / 100
      )
    ),
    y: Math.round(
      limitAreaFn(
        mediaNaturalBBoxSize.height - sizePixels.height,
        (croppedAreaPercentages.y * mediaNaturalBBoxSize.height) / 100
      )
    ),
  };
}
