"""
Convert world GeoJSON polygons to LineStrings for wireframe rendering.

This module:
1. Reads world GeoJSON from a URL (Polygon/MultiPolygon features)
2. Explodes MultiPolygons into individual polygons
3. Converts polygon boundaries to LineString features
4. Writes out a GeoJSON file optimized for wireframe visualization

Source: World GeoJSON data from D3.js Graph Gallery
URL: https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson
"""

import logging
from pathlib import Path

import geopandas as gpd

logger = logging.getLogger(__name__)


def clean_world_geojson(
    source_url: str,
    output_path: str | Path,
) -> gpd.GeoDataFrame | None:
    """
    Convert world GeoJSON polygons to LineStrings for wireframe rendering.

    Reads world GeoJSON from a URL and converts Polygon/MultiPolygon features
    to LineString features suitable for wireframe visualization.

    Args:
        source_url: URL to world GeoJSON file (Polygon/MultiPolygon features)
        output_path: Path to output GeoJSON file (LineString features)

    Returns:
        GeoDataFrame with LineString geometries
    """
    output_path = Path(output_path)

    logger.info(f"Loading GeoJSON from url {source_url}")
    gdf = gpd.read_file(source_url)

    logger.info(f"Loaded {len(gdf)} features")
    logger.debug(f"Geometry types: {gdf.geometry.type.value_counts().to_dict()}")

    # Explode MultiPolygons into individual polygons
    logger.info("Exploding MultiPolygons...")
    gdf_exploded = gdf.explode(index_parts=True).reset_index(drop=True)
    gdf_exploded["geometry"] = gdf_exploded.boundary
    assert isinstance(gdf_exploded, gpd.GeoDataFrame)

    gdf_linestrings = gdf_exploded.explode(index_parts=True).reset_index(
        drop=True
    )  # it was checked that thes geometries are valid and non empty
    logger.info(f"After explode: {len(gdf_linestrings)} features")
    assert isinstance(gdf_linestrings, gpd.GeoDataFrame)

    logger.info(f"Final count: {len(gdf_linestrings)} linestring features")
    logger.info(f"Writing cleaned GeoJSON to: {output_path}")
    gdf_linestrings.to_file(output_path, driver="GeoJSON")
    file_size_mb = output_path.stat().st_size / 1024 / 1024
    logger.info(f"Done! Output file size: {file_size_mb:.2f} MB")

    return gdf_linestrings
