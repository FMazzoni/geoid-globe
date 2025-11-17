"""
Convert GeoTIFF raster to JSON format for Three.js visualization.
"""

import json
import logging
from pathlib import Path

import numpy as np
import rioxarray

logger = logging.getLogger(__name__)


def geotiff_to_json(input_path: str, output_path: str, downsample: int = 1):
    """
    Convert GeoTIFF to JSON format suitable for Three.js.

    Args:
        input_path: Path to input GeoTIFF file
        output_path: Path to output JSON file
        downsample: Downsample factor (1 = no downsampling, 2 = half resolution, etc.)
    """
    logger.info(f"Loading GeoTIFF: {input_path}")
    raster = rioxarray.open_rasterio(input_path)

    data = raster.isel(band=0).data[::downsample, ::downsample]
    lats = raster.y.values[::downsample]
    lons = raster.x.values[::downsample]
    min_val = float(np.nanmin(data))
    max_val = float(np.nanmax(data))
    logger.info(f"Data shape: {data.shape}")
    logger.info(f"Lat range: {lats.min():.2f} to {lats.max():.2f}")
    logger.info(f"Lon range: {lons.min():.2f} to {lons.max():.2f}")
    logger.info(f"Height range: {min_val:.2f} to {max_val:.2f} meters")

    output_data = {
        "heights": data.tolist(),
        "lats": lats.tolist(),
        "lons": lons.tolist(),
        "minHeight": min_val,
        "maxHeight": max_val,
        "shape": list(data.shape),
    }

    logger.info(f"Saving to: {output_path}")
    with open(output_path, "w") as f:
        json.dump(output_data, f)

    file_size_mb = Path(output_path).stat().st_size / 1024 / 1024
    logger.info(f"Done! File size: {file_size_mb:.2f} MB")
    return output_data
