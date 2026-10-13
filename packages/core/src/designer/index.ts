export {
  DesignerController,
  type DesignerControllerOptions,
  type DesignerSettings,
  type DesignerState,
  type KeyInput,
  type PageBandSlot,
  type Selection,
} from './controller';
export {
  alignRects,
  distributeRects,
  intersects,
  rectFromPoints,
  RESIZE_HANDLES,
  resizeRect,
  snapEdges,
  snapMove,
  snapToGrid,
  type Alignment,
  type Guide,
  type Rect,
  type ResizeHandle,
  type SnapOptions,
} from './geometry';
export { fieldExpression, inferFields, isIdentifier } from './infer';
export { DROP_TARGET_CLASS, marqueeTargets, snapshotBands, type BandHit } from './dom';
export { allRegions, convertTemplateUnit, designSections, findGroup, findRegion, type DesignSection, type SectionLabels } from './sections';
