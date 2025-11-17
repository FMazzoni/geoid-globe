"""
Main preprocessing pipeline for geoid globe visualization.

This script orchestrates the full data preprocessing workflow:
1. Generate geoid GeoTIFF from EGM2008 model
2. Convert GeoTIFF to JSON for web visualization
3. Clean world GeoJSON boundaries for wireframe rendering (auto-downloads if missing)

World GeoJSON source:
https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson

Run with: pixi run preprocess
"""

import logging
from pathlib import Path

from pydantic import BaseModel, Field

from geoid_globe.clean_world_geojson import clean_world_geojson
from geoid_globe.convert_raster_to_json import geotiff_to_json
from geoid_globe.generate_geoid import generate_geoid

logger = logging.getLogger(__name__)


class PipelineConfig(BaseModel):
    """Configuration for the preprocessing pipeline."""

    lmax: int = Field(
        default=800,
        description="Maximum spherical harmonic degree for geoid computation (max: 2160)",
        ge=1,
        le=2160,
    )

    downsample: int = Field(
        default=1,
        description="Downsample factor for JSON conversion (1=full res, 2=half res, etc.)",
        ge=1,
    )

    geotiff_path: Path = Field(
        default=Path("data/egm2008_geoid_heights.tif"),
        description="Path to geoid GeoTIFF file",
    )
    json_path: Path = Field(
        default=Path("public/data/egm2008_geoid_heights.json"),
        description="Path to output JSON file with geoid height data",
    )
    world_geojson_url: str = Field(
        default="https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
        description="URL to world GeoJSON file",
    )
    world_boundaries_path: Path = Field(
        default=Path("public/data/world_boundaries.json"),
        description="Path to output world boundaries GeoJSON (LineStrings for wireframes)",
    )


def run_pipeline(config: PipelineConfig) -> None:
    """Run the full preprocessing pipeline."""
    logger.info("=" * 60)
    logger.info("Starting Geoid Globe Preprocessing Pipeline")
    logger.info("=" * 60)
    logger.info(f"Configuration: lmax={config.lmax}, downsample={config.downsample}")

    geotiff_path = config.geotiff_path
    json_path = config.json_path

    # Ensure directories exist
    geotiff_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    config.world_boundaries_path.parent.mkdir(parents=True, exist_ok=True)

    # Step 1: Generate geoid GeoTIFF
    logger.info("\n[Step 1/3] Generating geoid from EGM2008 model...")
    generate_geoid(lmax=config.lmax, output_path=geotiff_path)
    if not geotiff_path.exists():
        raise FileNotFoundError(f"Geoid GeoTIFF not found at {geotiff_path}")
    logger.info(f"✓ Geoid saved to: {geotiff_path}")

    # Step 2: Convert GeoTIFF to JSON
    logger.info("\n[Step 2/3] Converting GeoTIFF to JSON...")
    geotiff_to_json(
        input_path=str(geotiff_path),
        output_path=str(json_path),
        downsample=config.downsample,
    )
    if not json_path.exists():
        raise FileNotFoundError(f"JSON not found at {json_path}")
    logger.info(f"✓ JSON saved to: {json_path}")

    # Step 3: Convert world GeoJSON polygons to LineStrings for wireframes
    logger.info("\n[Step 3/3] Converting world GeoJSON to boundaries (LineStrings)...")
    clean_world_geojson(
        source_url=config.world_geojson_url,
        output_path=config.world_boundaries_path,
    )
    if not config.world_boundaries_path.exists():
        raise FileNotFoundError(
            f"World boundaries GeoJSON not found at {config.world_boundaries_path}"
        )
    logger.info(f"✓ World boundaries saved to: {config.world_boundaries_path}")

    logger.info("\n" + "=" * 60)
    logger.info("Pipeline completed successfully!")
    logger.info("=" * 60)


def main() -> None:
    """Main entry point for the pipeline."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    config = PipelineConfig()

    try:
        run_pipeline(config)
    except Exception as e:
        logger.exception(f"Pipeline failed: {e}")
        raise


if __name__ == "__main__":
    main()
