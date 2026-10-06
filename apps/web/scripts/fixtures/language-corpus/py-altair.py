import altair as alt
chart = alt.Chart(df).mark_point().encode(x="dose", y="response", color="group")
chart = chart.configure_axis(labelFontSize=10, titleFontSize=12)
chart.save("chart.html")
