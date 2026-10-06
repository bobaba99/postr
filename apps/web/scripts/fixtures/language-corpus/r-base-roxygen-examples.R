#' Draw the dose-response panel
#'
#' @param df A data frame with dose and response
#' @examples
#' fig <- draw_panel(sample_df)
draw_panel = function(df) {
  plot(df$dose, df$response, xlab = "Dose (mg)", ylab = "Response")
}
