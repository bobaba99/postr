#' Plot the dose-response curve for the poster
#'
#' @param df A data frame with columns dose and response
#' @return A ggplot object
#' @examples
#' plot_dose(sample_df)
plot_dose <- function(df) {
  ggplot(df, aes(dose, response)) +
    geom_point() +
    geom_smooth(method = "lm") +
    theme_bw(base_size = 11)
}
