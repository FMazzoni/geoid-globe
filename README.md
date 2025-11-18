# Geoid Globe: Interactive 3D Visualization of Earth's Geoid

A 3D interactive visualization of Earth's geoid using Three.js, Python, and Pixi. The geoid represents the shape that the ocean surface would assume if it were at rest—an equipotential surface of Earth's gravity field.

The visualization will be available at: [https://fmazzoni.github.io/geoid-globe/](https://fmazzoni.github.io/geoid-globe/)

## Overview

This project visualizes the Earth's geoid undulation (deviation from a perfect ellipsoid) using:

- **Python** for data processing and geoid computation from the EGM2008 gravity model
- **Three.js** for interactive 3D web visualization
- **Pixi** for dependency management and reproducible environments

## High-Level Pipeline

1. **Generate Geoid Data**: Compute geoid undulation from the EGM2008 gravity model using spherical harmonics (pyshtools)
2. **Convert to Web Format**: Transform GeoTIFF raster data to JSON format optimized for web visualization
3. **Preprocess GeoJSON**: Clean and convert world boundary polygons to LineStrings for wireframe rendering
4. **Visualize**: Interactive 3D globe with color-mapped geoid heights and optional continent wireframes

## Quick Start

### Prerequisites

- [Pixi](https://pixi.sh/) installed

### Setup

```bash
# Install dependencies
pixi install

# Run the preprocessing pipeline
pixi run preprocess

# Open the visualization
# Open public/geoid_globe.html in a web browser
# Or use: pixi run serve
```

## Project Structure

```
├── data/              # Raw and processed geoid data (GeoTIFF files)
├── public/            # Web visualization files (served on GitHub Pages)
│   ├── geoid_globe.html    # Main visualization
│   ├── css/           # Stylesheets
│   ├── js/            # JavaScript files
│   └── data/          # Preprocessed data files (JSON)
├── src/
│   └── geoid_globe/        # Python processing scripts
│       ├── pipeline.py     # Main preprocessing pipeline
│       ├── generate_geoid.py
│       ├── convert_raster_to_json.py
│       └── clean_world_geojson.py
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions workflow for Pages deployment
└── pyproject.toml     # Pixi configuration
```

## Available Commands

- `pixi run preprocess` - Run the full preprocessing pipeline (generates geoid, converts to JSON, and cleans GeoJSON)
- `pixi run serve` - Start a local web server to view the visualization

## Technical Details

The geoid is computed using the EGM2008 (Earth Gravitational Model 2008) with configurable spherical harmonic degree (lmax). Higher lmax values provide more detail but require more computation and storage.

The visualization uses Three.js to render a sphere with vertex colors mapped to geoid undulation values, allowing interactive exploration of Earth's gravity field shape.
