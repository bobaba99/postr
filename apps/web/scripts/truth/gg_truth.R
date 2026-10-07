# gg_truth.R - what REAL ggplot2 draws for a pasted R plotting script: the
# point size of every text element in the plot the script saves with
# ggsave(), and the canvas ggsave() is given. The ground truth for the R half
# of the plot checker (scripts/checker-r-truth-check.mjs, plan item 13 part 2;
# record docs/fixes/13-checker-reads-its-own-fix.md section 10).
#
# CLAIM it supports: "this script draws its axis titles at X pt, its tick
# labels at Y pt ..." measured from the grobs ggplot2 builds to draw the plot
# (ggplotGrob: every text grob's fontsize, with the cex of every grob above
# it), never from the script's text. It shares no code and no rule with
# Postr's parser (apps/web/src/poster/readability.ts parseRCode): whatever
# theme_*(), theme(), text, title or positional base_size set the size, the
# drawn grob carries the result.
#
# HOW: Rscript gg_truth.R <script.R>
#   Sources the script in a fresh environment with ggsave() replaced by a
#   recorder (plot, width, height, units, dpi) inside a temporary working
#   directory. The recorder binds the arguments as ggsave() does (the same
#   formals, in the same order) and then calls the real ggplot2::ggsave()
#   with them, into that directory: an argument real ggsave() rejects (a
#   plot bound to `device`) is the script's error, as it is for the user
#   (fix 13b review round 1, P13B-R1-07: the recorder alone accepted it).
#   The LAST ggsave() call is measured. Its plot
#   is built (ggplotGrob) and every non-empty text grob is classed by the
#   gtable cell it is drawn in (fix 13b review round 2: the innermost cell
#   that names a class, so the plots inside a cowplot plot_grid() or a
#   gridExtra arrangeGrob() gtable are classed by their own cells, and a
#   gtable is measured as it is; a NULL plot, which `gtable + theme()` is,
#   draws nothing and is the script's error):
#     title -> plotTitle, caption -> caption, subtitle -> subtitle (no row),
#     xlab-*/ylab-* -> axisTitle, axis-* -> axisText, strip-* -> stripText,
#     guide-box-* -> legendTitle (the guide's "title" cell) or legendText,
#     panel-* -> inPanel (geom_text, geom_label, annotate: no row).
#   Per class, the SMALLEST size. The canvas is ggsave's width and height in
#   inches (cm, mm and px converted; px at the call's dpi).
#   Review round 2 (P13B-R2-09): png(), jpeg(), tiff(), bmp(), pdf(), svg()
#   and cairo_pdf() are recorders too (their size in inches, then the real
#   device into the temporary directory), and so is print(): a plot printed
#   while such a device is open is measured with the device's size. The last
#   ggsave() or print() is measured.
#   Review round 3 (P13B-R3-04): the script is evaluated expression by
#   expression and a visible value is printed, as Rscript does (autoprint: a
#   plot on a line of its own between png() and dev.off()); ragg's agg_png(),
#   agg_jpeg() and agg_tiff() are devices; grid.arrange(), which draws its
#   gtable on the open device, is recorded with the device's size; dev.off()
#   closes the device, so a plot printed after it is not measured with it.
#   A value print() is given that is not a plot is not printed (stdout holds
#   the JSON).
#
# Rscript gg_truth.R --selftest
#   A. known sizes read back: a plot whose every class is set with an
#      explicit element_text(size =) - each smallest size where a partial
#      reader would miss it (the y axis, not x; the legend title smaller than
#      its labels) - must read back exactly those sizes and that canvas;
#   B. inheritance: theme_grey(base_size = 20) alone must read back
#      ggplot2's own rel() multipliers (title 24, axis titles 20, ticks 16,
#      legend text 16, legend title 20, strips 16, caption 16);
#   C. geom_text(size = 5) is drawn at 5 mm = 14.23 pt;
#   D. a ggsave() whose plot lands on `device` (the filename named, a
#      second plot argument after plot =) is an error, as real ggsave() makes it;
#   E. (review round 2) gridExtra's arrangeGrob() of two plots is measured as
#      the gtable it is, each plot's text by its own cells (the smaller axis
#      title, 9, from the second plot); cowplot's plot_grid() the same (its
#      plots' tick labels, 7.2, are not in-panel text); `gtable + theme()`
#      (NULL) is an error; a png() device of 8 x 6 in with print(p) gives
#      that canvas and the plot's sizes. Needs cowplot and gridExtra.
#   F. (review round 3) png() then the plot on a line of its own (autoprint),
#      pdf() then a ggplot() chain, png() then grid.arrange(p1, p2), ragg's
#      agg_png() then print(p), each measured with its device's size; a
#      print() after dev.off() is not measured with the device. Needs ragg.
#
# OUTPUT: one JSON object on stdout.
#   {ok, error, ggplot2, w, h, sizes: {class: pt or null}, counts: {class: n}}
# EXIT: 0 measured (or every self-test check held); 1 the script raised (ok
#   false); 2 instrument failure (no ggsave() call, bad arguments, a failed
#   self-test check).
suppressPackageStartupMessages({ library(ggplot2); library(grid); library(jsonlite) })

CLASSES <- c("plotTitle", "axisTitle", "axisText", "legendText", "legendTitle", "stripText", "caption", "subtitle", "inPanel")

# The class a plot gtable's cell gives what is drawn in it; inside a legend
# (guide-box) its "title" cell is the legend title and the rest legend text.
# Any other cell keeps the class of the cell around it, so the plots inside a
# cowplot panel or a gridExtra gtable are classed by their own cells.
cell_class <- function(nm, cls) {
  if (is.na(nm)) return(cls)
  if (identical(cls, "legendText")) return(if (nm == "title") "legendTitle" else cls)
  if (identical(cls, "legendTitle")) return(cls)
  if (nm == "title") return("plotTitle")
  if (nm == "caption") return("caption")
  if (nm == "subtitle") return("subtitle")
  if (grepl("^(xlab|ylab)-", nm)) return("axisTitle")
  if (grepl("^axis-", nm)) return("axisText")
  if (grepl("^strip-", nm)) return("stripText")
  if (grepl("^guide-box", nm)) return("legendText")
  if (grepl("^panel", nm)) return("inPanel")
  cls
}

measure_plot <- function(p) {
  if (is.null(p)) stop("the plot is NULL: nothing is drawn")
  g <- if (inherits(p, "gtable") || inherits(p, "grob")) p else ggplotGrob(p)
  found <- list()
  walk <- function(gr, cls, fs, cex) {
    gp <- gr$gp
    if (!is.null(gp$fontsize)) fs <- gp$fontsize[1]
    if (!is.null(gp$cex)) cex <- cex * gp$cex[1]
    if (inherits(gr, "text") && length(gr$label) && any(nzchar(as.character(gr$label)))) {
      if (!is.na(cls)) {
        # A grob's own fontsize vector can hold one size per label (geom_text
        # with a mapped size): take its smallest.
        own <- gr$gp$fontsize
        pt <- if (!is.null(own) && length(own) > 1) min(own) * cex else fs * cex
        found[[length(found) + 1]] <<- list(cls = cls, pt = pt)
      }
    }
    if (inherits(gr, "gtable")) {
      for (i in seq_along(gr$grobs)) walk(gr$grobs[[i]], cell_class(gr$layout$name[i], cls), fs, cex)
    } else if (inherits(gr, "gTree")) {
      for (k in gr$children) walk(k, cls, fs, cex)
    }
  }
  walk(g, NA_character_, NA_real_, 1)
  sizes <- list(); counts <- list()
  for (k in CLASSES) {
    v <- unlist(lapply(found, function(f) if (f$cls == k) f$pt else NULL))
    sizes[[k]] <- if (length(v)) round(min(v), 4) else NULL
    counts[[k]] <- length(v)
  }
  list(sizes = sizes, counts = counts)
}

to_in <- function(x, units, dpi) {
  switch(units, "in" = x, "cm" = x / 2.54, "mm" = x / 25.4, "px" = x / dpi, x)
}

run_script <- function(path) {
  cap <- NULL
  env <- new.env(parent = globalenv())
  env$ggsave <- function(filename, plot = last_plot(), device = NULL, path = NULL, scale = 1,
                         width = NA, height = NA, units = c("in", "cm", "mm", "px"), dpi = 300, ...) {
    units <- match.arg(units)
    cap <<- list(plot = plot, width = width * scale, height = height * scale, units = units, dpi = dpi)
    # The real ggsave(), with the arguments bound as above: it rejects what the user's R would.
    ggplot2::ggsave(filename = basename(filename), plot = plot, device = device, path = NULL, scale = scale,
                    width = width, height = height, units = units, dpi = dpi, ...)
    invisible(filename)
  }
  # Review round 2: a device's size, then the real device; print() of a plot
  # while one is open is what the script draws there.
  dev <- NULL
  raster <- function(real) function(filename = "Rplot%03d", width = 480, height = 480, units = "px", pointsize = 12, ..., res = NA) {
    per <- switch(units, "in" = 1, "cm" = 2.54, "mm" = 25.4, "px" = if (is.na(res)) 72 else res)
    dev <<- list(w = width / per, h = height / per)
    real(filename = basename(filename), width = width, height = height, units = units, pointsize = pointsize, ..., res = res)
  }
  env$png <- raster(grDevices::png); env$jpeg <- raster(grDevices::jpeg)
  env$tiff <- raster(grDevices::tiff); env$bmp <- raster(grDevices::bmp)
  vector <- function(real, first) function(f = "Rplot%03d", width = 7, height = 7, ...) {
    dev <<- list(w = width, h = height)
    args <- list(basename(f), width = width, height = height, ...)
    names(args)[1] <- first
    do.call(real, args)
  }
  env$pdf <- vector(grDevices::pdf, "file"); env$svg <- vector(grDevices::svg, "filename")
  env$cairo_pdf <- vector(grDevices::cairo_pdf, "filename")
  agg <- function(real) function(filename = "Rplot%03d", width = 480, height = 480, units = "px", pointsize = 12, ..., res = 72) {
    per <- switch(units, "in" = 1, "cm" = 2.54, "mm" = 25.4, "px" = res)
    dev <<- list(w = width / per, h = height / per)
    real(filename = basename(filename), width = width, height = height, units = units, pointsize = pointsize, ..., res = res)
  }
  if (requireNamespace("ragg", quietly = TRUE)) {
    env$agg_png <- agg(ragg::agg_png); env$agg_jpeg <- agg(ragg::agg_jpeg); env$agg_tiff <- agg(ragg::agg_tiff)
  }
  env$print <- function(x, ...) {
    plot <- inherits(x, "ggplot") || inherits(x, "gtable")
    if (!is.null(dev) && plot) cap <<- list(plot = x, width = dev$w, height = dev$h, units = "in", dpi = 300)
    if (plot) base::print(x, ...)
    invisible(x)
  }
  # Review round 3: grid.arrange() draws its gtable on the open device; dev.off() closes it.
  env$grid.arrange <- function(...) {
    g <- gridExtra::arrangeGrob(...)
    if (!is.null(dev)) cap <<- list(plot = g, width = dev$w, height = dev$h, units = "in", dpi = 300)
    grid::grid.newpage(); grid::grid.draw(g)
    invisible(g)
  }
  env$dev.off <- function(...) { r <- grDevices::dev.off(...); dev <<- NULL; invisible(r) }
  src <- normalizePath(path)
  tmp <- tempfile("gg_truth_"); dir.create(tmp); old <- setwd(tmp)
  on.exit({ setwd(old); unlink(tmp, recursive = TRUE) })
  # As Rscript runs a script: each top-level expression, a visible value printed (autoprint).
  err <- tryCatch({
    for (e in parse(src, keep.source = FALSE)) {
      v <- withVisible(eval(e, env))
      if (v$visible) env$print(v$value)
    }
    NULL
  }, error = function(e) conditionMessage(e))
  if (!is.null(err)) return(list(ok = FALSE, error = err))
  if (is.null(cap)) return(list(ok = NA, error = "no ggsave() call and no plot printed to a device"))
  m <- tryCatch(measure_plot(cap$plot), error = function(e) conditionMessage(e))
  if (is.character(m)) return(list(ok = FALSE, error = paste("drawing failed:", m)))
  list(ok = TRUE, error = NULL, ggplot2 = as.character(packageVersion("ggplot2")),
       w = to_in(cap$width, cap$units, cap$dpi), h = to_in(cap$height, cap$units, cap$dpi),
       sizes = m$sizes, counts = m$counts)
}

selftest <- function() {
  checks <- list()
  chk <- function(name, script, expect) {
    f <- tempfile(fileext = ".R"); writeLines(script, f)
    r <- run_script(f)
    ok <- isTRUE(r$ok)
    got <- list()
    for (k in names(expect)) {
      g <- if (k %in% c("w", "h")) r[[k]] else r$sizes[[k]]
      got[[k]] <- g
      if (is.null(g) || abs(g - expect[[k]]) > 1e-3) ok <- FALSE  # sizes are rounded to 4 decimals
    }
    checks[[length(checks) + 1]] <<- list(name = name, ok = ok, expected = expect, got = got)
  }
  base <- 'library(ggplot2)
df <- data.frame(x = rep(1:6, 2), y = c(1:6, (1:6)^1.3), g = rep(c("Control", "Treated"), each = 6), f = rep(c("A", "B"), 6))
p <- ggplot(df, aes(x, y, colour = g)) + geom_line() + facet_wrap(~f) +
  labs(title = "Known", x = "Dose", y = "Effect", colour = "Group", caption = "Note")'
  chk("known sizes", paste0(base, '
p <- p + theme(plot.title = element_text(size = 21), axis.title.x = element_text(size = 19),
  axis.title.y = element_text(size = 17.5), axis.text.x = element_text(size = 14.5),
  axis.text.y = element_text(size = 13.25), legend.text = element_text(size = 11.5),
  legend.title = element_text(size = 10.5), strip.text = element_text(size = 15),
  plot.caption = element_text(size = 9.75))
ggsave("k.png", p, width = 7.3, height = 5.1)'),
    list(w = 7.3, h = 5.1, plotTitle = 21, axisTitle = 17.5, axisText = 13.25, legendText = 11.5,
         legendTitle = 10.5, stripText = 15, caption = 9.75))
  chk("inherited sizes, theme_grey(20)", paste0(base, '
ggsave("g.png", p + theme_grey(base_size = 20), width = 20, height = 15, units = "cm")'),
    list(w = 20 / 2.54, h = 15 / 2.54, plotTitle = 24, axisTitle = 20, axisText = 16, legendText = 16,
         legendTitle = 20, stripText = 16, caption = 16))
  chk("geom_text size 5 mm", 'library(ggplot2)
p <- ggplot(data.frame(x = 1:3, y = 1:3, n = c("a", "b", "c")), aes(x, y, label = n)) + geom_text(size = 5)
ggsave("t.png", p, width = 4, height = 3)', list(inPanel = 5 * 72.27 / 25.4))
  bad <- function(name, script) {
    f <- tempfile(fileext = ".R"); writeLines(script, f)
    r <- run_script(f)
    checks[[length(checks) + 1]] <<- list(name = name, ok = identical(r$ok, FALSE), expected = "the script errors", got = r$error)
  }
  bad("a plot bound to device errors", 'library(ggplot2)
p <- ggplot(data.frame(x = 1:3, y = 1:3), aes(x, y)) + geom_point()
ggsave(filename = "d.png", plot = last_plot() + theme(text = element_text(size = 9)), p, width = 4, height = 3)')
  # E (review round 2): combined figures and devices.
  two <- 'library(ggplot2)
p1 <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + labs(x = "Weight", y = "MPG") + theme_bw(base_size = 11)
p2 <- ggplot(mtcars, aes(hp, mpg)) + geom_point() + labs(x = "Power", y = "MPG") + theme_bw(base_size = 9)'
  chk("gridExtra arrangeGrob: a gtable, each plot by its own cells", paste0(two, '
library(gridExtra)
g <- arrangeGrob(p1, p2, ncol = 2)
ggsave("g.png", g, width = 8, height = 4)'), list(w = 8, h = 4, axisTitle = 9, axisText = 7.2))
  chk("cowplot plot_grid: the plots\' text is not in-panel text", paste0(two, '
library(cowplot)
cg <- plot_grid(p1, p2, labels = c("A", "B"), ncol = 2)
ggsave("c.png", cg, width = 8, height = 4)'), list(w = 8, h = 4, axisTitle = 9, axisText = 7.2))
  bad("a gtable + theme() is NULL: nothing is drawn", paste0(two, '
library(gridExtra)
g <- arrangeGrob(p1, p2, ncol = 2)
ggsave("n.png", g + theme(axis.title = element_text(size = 18)), width = 8, height = 4)'))
  chk("png() device and print(): the device\'s canvas", paste0(two, '
png("d.png", width = 8, height = 6, units = "in", res = 300)
print(p1)
dev.off()'), list(w = 8, h = 6, axisTitle = 11, axisText = 8.8))
  # F (review round 3): what Rscript draws on a device, however it is drawn.
  dev3 <- paste0(two, '
p1 <- p1 + labs(title = "Weight")')
  chk("png() then the plot on a line of its own (autoprint)", paste0(dev3, '
png("a.png", width = 8, height = 6, units = "in", res = 300)
p1
dev.off()'), list(w = 8, h = 6, plotTitle = 13.2, axisTitle = 11, axisText = 8.8))
  chk("pdf() then a ggplot() chain on its own", 'library(ggplot2)
pdf("b.pdf", width = 7, height = 5)
ggplot(mtcars, aes(wt, mpg)) + geom_point() + labs(x = "Weight", y = "MPG") +
  theme_bw(base_size = 9)
dev.off()', list(w = 7, h = 5, axisTitle = 9, axisText = 7.2))
  chk("png() then grid.arrange(p1, p2): the gtable it draws", paste0(two, '
library(gridExtra)
png("c.png", width = 10, height = 4, units = "in", res = 300)
grid.arrange(p1, p2, ncol = 2)
dev.off()'), list(w = 10, h = 4, axisTitle = 9, axisText = 7.2))
  chk("ragg agg_png() then print(p)", paste0(two, '
library(ragg)
agg_png("d.png", width = 8, height = 6, units = "in", res = 300)
print(p1)
dev.off()'), list(w = 8, h = 6, axisTitle = 11, axisText = 8.8))
  chk("a print() after dev.off() is not measured with the device", paste0(two, '
png("e.png", width = 8, height = 6, units = "in", res = 300)
print(p1)
dev.off()
print(p2)'), list(w = 8, h = 6, axisTitle = 11, axisText = 8.8))
  list(ok = all(vapply(checks, function(c) isTRUE(c$ok), TRUE)), ggplot2 = as.character(packageVersion("ggplot2")), checks = checks)
}

args <- commandArgs(TRUE)
if (length(args) == 1 && args[1] == "--selftest") {
  r <- selftest()
  cat(toJSON(r, auto_unbox = TRUE, null = "null", digits = NA))
  quit(status = if (isTRUE(r$ok)) 0 else 2)
}
if (length(args) != 1) { cat('{"ok":false,"error":"usage: gg_truth.R <script.R> | --selftest"}'); quit(status = 2) }
r <- suppressWarnings(suppressMessages(run_script(args[1])))
cat(toJSON(r, auto_unbox = TRUE, null = "null", digits = NA))
quit(status = if (isTRUE(r$ok)) 0 else if (identical(r$ok, FALSE)) 1 else 2)
