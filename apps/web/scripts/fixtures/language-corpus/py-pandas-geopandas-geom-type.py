import geopandas as gpd
world = gpd.read_file(path)
world[world.geom_type == "Polygon"].plot(column="pop_est", legend=True)
