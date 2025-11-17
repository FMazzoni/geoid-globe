"""
Generate geoid undulation from EGM2008 gravity model.

This module provides functions to compute and save geoid data using spherical harmonics.
"""

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pyshtools as pysh
import rioxarray  # noqa: F401 - needed to register .rio accessor
from pyshtools import constants
from pyshtools.shclasses import SHGravRealCoeffs
from xarray.core.dataarray import DataArray

logger = logging.getLogger(__name__)


def save_geoid_as_geotiff(array: DataArray, output_path: str | Path) -> None:
    """
    Save a geoid DataArray as a GeoTIFF file with proper spatial reference.

    Args:
        array: xarray DataArray with geoid data (from pyshtools)
        output_path: Path where the GeoTIFF will be saved
    """
    # Ensure the array has rioxarray accessor
    geoid_raster = array.rio

    # Set the CRS to WGS84 (EPSG:4326) since geoid data is in lat/lon
    geoid_raster.write_crs("EPSG:4326", inplace=True)
    geoid_raster.set_spatial_dims(x_dim="longitude", y_dim="latitude", inplace=True)

    # Save as GeoTIFF
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    geoid_raster.to_raster(output_path)


def generate_geoid(
    lmax: int = 800, output_path: str | Path = "geoid_egm2008_lmax800.tif"
) -> None:
    """
    Generate geoid undulation from EGM2008 gravity model and save as GeoTIFF.

    Args:
        lmax: Maximum spherical harmonic degree (default: 800, max: 2160 for EGM2008)
        output_path: Path where the GeoTIFF will be saved
    """
    logger.info(f"Loading EGM2008 gravity model (lmax={lmax})")
    clm: SHGravRealCoeffs = pysh.datasets.Earth.EGM2008(lmax=lmax)

    logger.info("Computing geoid undulation")
    a = constants.Earth.wgs84.a.value
    f = constants.Earth.wgs84.f.value
    u0 = constants.Earth.wgs84.u0.value
    omega = constants.Earth.wgs84.omega.value

    earth_geoid = clm.geoid(potref=u0, a=a, f=f, omega=omega)

    array: DataArray | Any = earth_geoid.to_xarray()

    logger.info("Reordering longitude to go from -180° to +180° (starting at -180°)")
    lon_values = array.coords["longitude"]
    new_lon_values = np.where(lon_values > 180, lon_values - 360, lon_values)
    new_array = array.copy()  # type: ignore
    new_array.coords["longitude"] = new_lon_values
    new_array: DataArray = new_array.sortby("longitude")

    logger.info(f"Saving geoid as GeoTIFF to: {output_path}")
    save_geoid_as_geotiff(new_array, output_path)
