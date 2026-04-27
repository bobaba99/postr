# Postr import benchmark — vision-model comparison

Generated: 2026-04-27T09:15:42.355Z

## Test corpus

- **Class A** — text-layer PDF (`EW_INS.pdf`, `VocUM_poster.pdf`). Ground truth from pdfjs/pdftotext.
- **Class B** — flattened-content PDF (`PresenterGeng.pdf`). Ground truth hand-transcribed.
- **Class C** — pure raster JPG (`POSTER_DRAFT_page-0001.jpg`). Ground truth hand-transcribed.

## EW_INS

| Model | Class | Text accuracy | Blocks | Figures | p50 (ms) | p95 (ms) | $/run |
|---|---|---|---|---|---|---|---|
| claude | A | 0.0% | 0 | 0 | 70175 | 70175 | $0.0693 |

## VocUM

| Model | Class | Text accuracy | Blocks | Figures | p50 (ms) | p95 (ms) | $/run |
|---|---|---|---|---|---|---|---|
| claude | A | 58.1% | 42 | 2 | 63882 | 63882 | $0.0667 |

Warnings:
- claude: Multiple small scatter plots with dense data points in correlation regression section - may be difficult to read individual values
- claude: Some table cells contain very small text
- claude: Complex multi-column layout with multiple sections

## PresenterGeng

| Model | Class | Text accuracy | Blocks | Figures | p50 (ms) | p95 (ms) | $/run |
|---|---|---|---|---|---|---|---|
| claude | B | 0.0% | 26 | 3 | 57009 | 57009 | $0.0646 |

Warnings:
- claude: Multiple columns layout with complex regression tables
- claude: Small font size in tables may affect readability
- claude: Color-coded heatmap AUC visualization present

## POSTER_DRAFT

| Model | Class | Text accuracy | Blocks | Figures | p50 (ms) | p95 (ms) | $/run |
|---|---|---|---|---|---|---|---|
| claude | C | 0.0% | 29 | 4 | 35654 | 35654 | $0.0428 |

Warnings:
- claude: Some text in the Methods section contains small font size that is difficult to read clearly
- claude: The Conclusion section appears to have placeholder text or incomplete content
- claude: Multiple small charts with potentially overlapping data points

## Aggregate ranking

| Model | Avg text accuracy | Avg blocks | Avg latency p50 | Total $ |
|---|---|---|---|---|
| claude | 14.5% | 24.3 | 56680 ms | $0.2433 |

**Recommended production model:** `claude` (composite score 0.249).
