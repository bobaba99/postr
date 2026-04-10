# Figure Readability — Phase 2: OCR-Based Analysis

## Motivation

Not all users have their plotting code handy. Phase 2 adds an image-only
path: when the user uploads a figure without pasting code, Postr runs OCR
on the image to detect text regions, measures their pixel heights, and
computes effective print sizes using the same formula as Phase 1.

## Approach

Two options, user-configurable:

1. **Local Ollama** — `llava` or `moondream` model via localhost:11434.
   Free, private, no API key. Ask the model to return bounding boxes +
   text content for all text in the image. Parse the JSON response to
   get pixel heights.

2. **Claude Vision** — send the base64 image to Claude with a structured
   prompt asking for text region detection. Higher accuracy, requires
   API key.

## Formula (same as Phase 1)

```
text_height_inches = (text_height_px / image_height_px) × block_height_inches
effective_pt = text_height_inches × 72
```

## UI Flow

1. User uploads an image to an image block (existing flow).
2. If no code is pasted in the Figure tab, show a "Scan Image" button.
3. On click, send the base64 image to the selected OCR backend.
4. Parse the response for text bounding boxes.
5. Compute effective pt for each detected text region.
6. Show the same diagnostic table as Phase 1, but with detected regions
   instead of ggplot element names.

## Architecture

- New file: `apps/web/src/poster/ocrReadability.ts`
- Ollama client: POST to `http://localhost:11434/api/generate` with
  model=llava, prompt="List all text in this image with bounding boxes
  as JSON: [{text, x, y, width, height}]", image as base64.
- Claude client: use Anthropic SDK with vision, structured output.
- User preference stored in localStorage: `postr.ocr-backend`.

## Out of Scope for Phase 2

- Real-time OCR (too slow for live editing)
- Font identification (which font family is used in the figure)
- Color contrast analysis
