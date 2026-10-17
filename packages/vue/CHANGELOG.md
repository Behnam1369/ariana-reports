# @ariana-reports/vue

## 0.2.0

### Minor Changes

- 04c05ed: Right-to-left text and font fallback in PDFs.
  
  - New `direction` style (`auto`, `ltr`, `rtl`) for text, editable in the designer as "Direction". `auto` (the default) follows the first strong letter; right-to-left text is right-aligned unless `textAlign` is set. The viewer, PDF and Excel export follow it.
  - PDF lines are reordered with the Unicode bidirectional algorithm: Persian and Arabic words, numbers and embedded Latin text appear in the right order, and brackets are mirrored.
  - Characters the requested font lacks are drawn with another registered font that has them (the measurer makes the same choice). Several files of one family (script subsets) can be registered. Characters no font has are reported through `onWarning`, or the console.
  - Fixed text placed too high in PDFs with registered fonts, which clipped the top of the letters in tight boxes.
  - WOFF2 fonts are rejected with a clear error instead of failing during export.

### Patch Changes

- Updated dependencies [04c05ed]
  - @ariana-reports/core@0.2.0
