import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuration
const EARTH_RADIUS = 6371000; // meters
const MIN_HEIGHT = -106; // meters
const MAX_HEIGHT = 85; // meters
const HEIGHT_RANGE = MAX_HEIGHT - MIN_HEIGHT;

// Default data file path
const DEFAULT_GEoid_DATA_URL = 'data/egm2008_geoid_heights.json';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('container').appendChild(renderer.domElement);

// Camera position
camera.position.set(0, 0, 5);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.5; // Allow much closer zooming
controls.maxDistance = 20;

// Lighting - reduced intensity to preserve color detail
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// Create sphere geometry with high resolution for better color detail
const segments = 512; // Very high resolution for maximum color sampling and detail preservation
const geometry = new THREE.SphereGeometry(1, segments, segments);

// Raster data storage
let rasterLats = null;
let rasterLons = null;
let rasterHeights = null;
let rasterMinHeight = null;
let rasterMaxHeight = null;

// Normalize longitude to [-180, 180] range
function normalizeLongitude(lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
}

// Calculate shortest angular distance between two longitudes
function angularDistance(lon1, lon2) {
    lon1 = normalizeLongitude(lon1);
    lon2 = normalizeLongitude(lon2);
    let diff = Math.abs(lon1 - lon2);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

// Function to bilinearly interpolate height from raster data
function getHeightFromRaster(lat, lon) {
    if (!rasterHeights || !rasterLats || !rasterLons) {
        // Fallback to demo pattern if no data loaded
        return Math.sin(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180) * 50;
    }

    // Normalize longitude to handle coordinates near ±180°
    lon = normalizeLongitude(lon);

    // Handle poles specially - at poles, use average of all longitudes at that latitude
    // This handles both North Pole (lat > 89.5) and South Pole (lat < -89.5)
    if (Math.abs(lat) > 89.5) {
        // Near pole, find closest latitude row
        let closestLatIdx = 0;
        let minLatDiff = Math.abs(lat - rasterLats[0]);
        for (let i = 1; i < rasterLats.length; i++) {
            const diff = Math.abs(lat - rasterLats[i]);
            if (diff < minLatDiff) {
                minLatDiff = diff;
                closestLatIdx = i;
            }
        }
        
        // Ensure we have a valid index
        if (closestLatIdx < 0 || closestLatIdx >= rasterHeights.length) {
            // Fallback: find any valid row
            for (let i = 0; i < rasterHeights.length; i++) {
                const row = rasterHeights[i];
                const validHeights = row.filter(h => isFinite(h) && Math.abs(h) < 10000);
                if (validHeights.length > 0) {
                    return validHeights.reduce((a, b) => a + b, 0) / validHeights.length;
                }
            }
            return 0;
        }
        
        // Average all longitudes at this latitude
        const row = rasterHeights[closestLatIdx];
        if (!row || row.length === 0) {
            return 0;
        }
        const validHeights = row.filter(h => isFinite(h) && Math.abs(h) < 10000);
        if (validHeights.length > 0) {
            return validHeights.reduce((a, b) => a + b, 0) / validHeights.length;
        }
        return 0;
    }

    // Find the grid cell containing this lat/lon
    // Raster lats are typically descending (90 to -90)
    // Raster lons are typically ascending (-180 to 180)
    
    // Find lat indices
    let latIdx0 = -1, latIdx1 = -1;
    for (let i = 0; i < rasterLats.length - 1; i++) {
        if (lat >= rasterLats[i + 1] && lat <= rasterLats[i]) {
            latIdx0 = i;
            latIdx1 = i + 1;
            break;
        }
    }
    if (latIdx0 === -1) {
        if (lat > rasterLats[0]) latIdx0 = latIdx1 = 0;
        else latIdx0 = latIdx1 = rasterLats.length - 1;
    }

    // Find lon indices - normalize all longitudes first for consistent comparison
    let lonIdx0 = -1, lonIdx1 = -1;
    
    for (let i = 0; i < rasterLons.length - 1; i++) {
        const lon0 = normalizeLongitude(rasterLons[i]);
        const lon1 = normalizeLongitude(rasterLons[i + 1]);
        
        // Normal case: lon between lon0 and lon1
        if (lon >= lon0 && lon <= lon1) {
            lonIdx0 = i;
            lonIdx1 = i + 1;
            break;
        }
        
        // Wrap-around case: dateline crossing (lon0 > lon1 means crossing ±180°)
        if (lon0 > lon1 && (lon >= lon0 || lon <= lon1)) {
            lonIdx0 = i;
            lonIdx1 = i + 1;
            break;
        }
    }
    
    // If not found, clamp to boundaries
    if (lonIdx0 === -1) {
        const firstLon = normalizeLongitude(rasterLons[0]);
        const lastLon = normalizeLongitude(rasterLons[rasterLons.length - 1]);
        
        // Use angular distance to find closest boundary
        if (angularDistance(lon, firstLon) < angularDistance(lon, lastLon)) {
            lonIdx0 = lonIdx1 = 0;
        } else {
            lonIdx0 = lonIdx1 = rasterLons.length - 1;
        }
    }

    // Get raster cell values and interpolate
    const lat0 = rasterLats[latIdx0];
    const lat1 = rasterLats[latIdx1];
    const lon0 = normalizeLongitude(rasterLons[lonIdx0]);
    const lon1 = normalizeLongitude(rasterLons[lonIdx1]);

    const h00 = rasterHeights[latIdx0][lonIdx0];
    const h01 = rasterHeights[latIdx0][lonIdx1];
    const h10 = rasterHeights[latIdx1][lonIdx0];
    const h11 = rasterHeights[latIdx1][lonIdx1];

    // Calculate interpolation weights
    const latT = latIdx0 === latIdx1 ? 0 : (lat - lat0) / (lat1 - lat0);
    let lonT = 0;
    
    if (lonIdx0 === lonIdx1) {
        lonT = 0;
    } else if (lon0 > lon1) {
        // Wrap-around: use angular distance
        const lonDiff = angularDistance(lon0, lon1);
        lonT = angularDistance(lon, lon0) / lonDiff;
    } else {
        // Normal case: linear interpolation
        lonT = (lon - lon0) / (lon1 - lon0);
    }
    
    lonT = Math.max(0, Math.min(1, lonT));

    // Bilinear interpolation
    const h0 = h00 * (1 - lonT) + h01 * lonT;
    const h1 = h10 * (1 - lonT) + h11 * lonT;
    let height = h0 * (1 - latT) + h1 * latT;
    
    // Handle invalid values (NaN, Infinity, or very large numbers)
    if (!isFinite(height) || Math.abs(height) > 10000) {
        // Use nearest valid neighbor or fallback
        const validHeights = [h00, h01, h10, h11].filter(h => isFinite(h) && Math.abs(h) < 10000);
        if (validHeights.length > 0) {
            height = validHeights.reduce((a, b) => a + b, 0) / validHeights.length;
        } else {
            if (DEBUG_WIREFRAMES) {
                debugStats.rasterLookupFailures++;
                if (debugStats.rasterLookupFailures <= 5) {
                    console.warn(`[DEBUG] Raster lookup failed at lat=${lat.toFixed(4)}, lon=${lon.toFixed(4)}: all neighbors invalid`);
                }
            }
            height = 0; // Fallback to zero if no valid data
        }
    }
    
    return height;
}

// Displace vertices based on height data
const positions = geometry.attributes.position;
const colors = new Float32Array(positions.count * 3);

// Store original sphere positions (before any deformation)
const originalPositions = new Float32Array(positions.array.length);
originalPositions.set(positions.array);

let deformationPercent = 20.0;
let currentColormap = 'viridis';
let colorMin = null;
let colorMax = null;
let useUnlit = true;
let rotationSpeed = 0.5;

// Scientific colormap implementations
// These are perceptually uniform colormaps suitable for scientific visualization

function viridis(t) {
    // More accurate viridis colormap implementation
    // Based on matplotlib's viridis colormap with higher precision
    t = Math.max(0, Math.min(1, t));
    
    // Use piecewise cubic interpolation for smoother transitions
    let r, g, b;
    
    if (t < 0.25) {
        const localT = t / 0.25;
        r = 0.26700401 + (0.4627451 - 0.26700401) * localT;
        g = 0.00487433 + (0.11481717 - 0.00487433) * localT;
        b = 0.32941519 + (0.56284153 - 0.32941519) * localT;
    } else if (t < 0.5) {
        const localT = (t - 0.25) / 0.25;
        r = 0.4627451 + (0.24705882 - 0.4627451) * localT;
        g = 0.11481717 + (0.42745098 - 0.11481717) * localT;
        b = 0.56284153 + (0.70567316 - 0.56284153) * localT;
    } else if (t < 0.75) {
        const localT = (t - 0.5) / 0.25;
        r = 0.24705882 + (0.05882353 - 0.24705882) * localT;
        g = 0.42745098 + (0.76078431 - 0.42745098) * localT;
        b = 0.70567316 + (0.83529412 - 0.70567316) * localT;
    } else {
        const localT = (t - 0.75) / 0.25;
        r = 0.05882353 + (0.60784314 - 0.05882353) * localT;
        g = 0.76078431 + (0.88235294 - 0.76078431) * localT;
        b = 0.83529412 + (0.56078431 - 0.83529412) * localT;
    }
    
    return [r, g, b];
}

function plasma(t) {
    // Plasma colormap - perceptually uniform
    t = Math.max(0, Math.min(1, t));
    const r = t < 0.25 ? 0.050 + (0.451 - 0.050) * (t / 0.25) :
              t < 0.5 ? 0.451 + (0.941 - 0.451) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.941 + (0.976 - 0.941) * ((t - 0.5) / 0.25) :
              0.976 + (0.940 - 0.976) * ((t - 0.75) / 0.25);
    const g = t < 0.25 ? 0.028 + (0.030 - 0.028) * (t / 0.25) :
              t < 0.5 ? 0.030 + (0.604 - 0.030) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.604 + (0.983 - 0.604) * ((t - 0.5) / 0.25) :
              0.983 + (0.977 - 0.983) * ((t - 0.75) / 0.25);
    const b = t < 0.25 ? 0.527 + (0.211 - 0.527) * (t / 0.25) :
              t < 0.5 ? 0.211 + (0.016 - 0.211) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.016 + (0.014 - 0.016) * ((t - 0.5) / 0.25) :
              0.014 + (0.131 - 0.014) * ((t - 0.75) / 0.25);
    return [r, g, b];
}

function turbo(t) {
    // More accurate turbo colormap implementation
    // Based on Google Research's turbo colormap with higher precision
    t = Math.max(0, Math.min(1, t));
    
    // Turbo uses a more complex curve - using more accurate key points
    let r, g, b;
    
    if (t < 0.25) {
        // Dark blue to cyan transition
        const localT = t / 0.25;
        r = 0.18995 + (0.00000 - 0.18995) * localT;
        g = 0.07176 + (0.69846 - 0.07176) * localT;
        b = 0.21381 + (1.00000 - 0.21381) * localT;
    } else if (t < 0.5) {
        // Cyan to green-yellow transition
        const localT = (t - 0.25) / 0.25;
        r = 0.00000;
        g = 0.69846 + (1.00000 - 0.69846) * localT;
        b = 1.00000 + (0.50000 - 1.00000) * localT;
    } else if (t < 0.75) {
        // Green-yellow to yellow transition
        const localT = (t - 0.5) / 0.25;
        r = 0.00000 + (1.00000 - 0.00000) * localT;
        g = 1.00000;
        b = 0.50000 + (0.00000 - 0.50000) * localT;
    } else {
        // Yellow to red transition
        const localT = (t - 0.75) / 0.25;
        r = 1.00000 + (0.50000 - 1.00000) * localT;
        g = 1.00000 + (0.00000 - 1.00000) * localT;
        b = 0.00000;
    }
    
    return [r, g, b];
}

function inferno(t) {
    // Inferno colormap - perceptually uniform
    t = Math.max(0, Math.min(1, t));
    const r = t < 0.25 ? 0.000 + (0.237 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.237 + (0.882 - 0.237) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.882 + (1.000 - 0.882) * ((t - 0.5) / 0.25) :
              1.000;
    const g = t < 0.25 ? 0.000 + (0.011 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.011 + (0.543 - 0.011) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.543 + (0.975 - 0.543) * ((t - 0.5) / 0.25) :
              0.975 + (0.988 - 0.975) * ((t - 0.75) / 0.25);
    const b = t < 0.25 ? 0.000 + (0.360 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.360 + (0.316 - 0.360) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.316 + (0.131 - 0.316) * ((t - 0.5) / 0.25) :
              0.131 + (0.000 - 0.131) * ((t - 0.75) / 0.25);
    return [r, g, b];
}

function magma(t) {
    // Magma colormap - perceptually uniform
    t = Math.max(0, Math.min(1, t));
    const r = t < 0.25 ? 0.000 + (0.287 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.287 + (0.765 - 0.287) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.765 + (0.992 - 0.765) * ((t - 0.5) / 0.25) :
              0.992 + (0.988 - 0.992) * ((t - 0.75) / 0.25);
    const g = t < 0.25 ? 0.000 + (0.001 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.001 + (0.217 - 0.001) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.217 + (0.753 - 0.217) * ((t - 0.5) / 0.25) :
              0.753 + (0.992 - 0.753) * ((t - 0.75) / 0.25);
    const b = t < 0.25 ? 0.000 + (0.331 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.331 + (0.576 - 0.331) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.576 + (0.525 - 0.576) * ((t - 0.5) / 0.25) :
              0.525 + (0.000 - 0.525) * ((t - 0.75) / 0.25);
    return [r, g, b];
}

function cividis(t) {
    // Cividis colormap - perceptually uniform, colorblind-friendly
    t = Math.max(0, Math.min(1, t));
    const r = t < 0.25 ? 0.000 + (0.060 - 0.000) * (t / 0.25) :
              t < 0.5 ? 0.060 + (0.240 - 0.060) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.240 + (0.327 - 0.240) * ((t - 0.5) / 0.25) :
              0.327 + (0.993 - 0.327) * ((t - 0.75) / 0.25);
    const g = t < 0.25 ? 0.135 + (0.204 - 0.135) * (t / 0.25) :
              t < 0.5 ? 0.204 + (0.408 - 0.204) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.408 + (0.546 - 0.408) * ((t - 0.5) / 0.25) :
              0.546 + (0.906 - 0.546) * ((t - 0.75) / 0.25);
    const b = t < 0.25 ? 0.315 + (0.384 - 0.315) * (t / 0.25) :
              t < 0.5 ? 0.384 + (0.543 - 0.384) * ((t - 0.25) / 0.25) :
              t < 0.75 ? 0.543 + (0.765 - 0.543) * ((t - 0.5) / 0.25) :
              0.765 + (0.144 - 0.765) * ((t - 0.75) / 0.25);
    return [r, g, b];
}

function rdbu(t) {
    // Red-Blue diverging colormap (good for showing deviations from zero)
    t = Math.max(0, Math.min(1, t));
    let r, g, b;
    if (t < 0.5) {
        // Blue to white
        const localT = t / 0.5;
        r = localT;
        g = localT;
        b = 1.0;
    } else {
        // White to red
        const localT = (t - 0.5) / 0.5;
        r = 1.0;
        g = 1.0 - localT;
        b = 1.0 - localT;
    }
    return [r, g, b];
}

function coolwarm(t) {
    // Cool-Warm diverging colormap
    t = Math.max(0, Math.min(1, t));
    let r, g, b;
    if (t < 0.5) {
        // Blue to cyan to white
        const localT = t / 0.5;
        r = 0.0 + localT * 0.5;
        g = 0.0 + localT;
        b = 0.5 + localT * 0.5;
    } else {
        // White to yellow to red
        const localT = (t - 0.5) / 0.5;
        r = 0.5 + localT * 0.5;
        g = 1.0 - localT * 0.5;
        b = 1.0 - localT;
    }
    return [r, g, b];
}

// Colormap selector function
function getColor(t, colormap) {
    switch(colormap) {
        case 'viridis': return viridis(t);
        case 'plasma': return plasma(t);
        case 'turbo': return turbo(t);
        case 'inferno': return inferno(t);
        case 'magma': return magma(t);
        case 'cividis': return cividis(t);
        case 'rdbu': return rdbu(t);
        case 'coolwarm': return coolwarm(t);
        default: return viridis(t);
    }
}

function getColorRange() {
    const dataMin = rasterMinHeight ?? MIN_HEIGHT;
    const dataMax = rasterMaxHeight ?? MAX_HEIGHT;
    return {
        min: colorMin ?? dataMin,
        max: colorMax ?? dataMax,
        dataMin,
        dataMax
    };
}

// Function to update the colorbar
function updateColorbar() {
    const canvas = document.getElementById('colorbarCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Get effective color range
    const { min: minH, max: maxH } = getColorRange();
    
    // Use high-resolution sampling for smooth gradient
    // Sample many more colors than pixels for smooth interpolation
    const numSamples = Math.max(height * 4, 1000); // At least 4x pixel resolution or 1000 samples
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    
    // Build gradient with many color stops for smooth transitions
    for (let i = 0; i <= numSamples; i++) {
        const t = 1 - (i / numSamples); // Reverse: top is max (1.0), bottom is min (0.0)
        const [r, g, b] = getColor(t, currentColormap);
        const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        const offset = i / numSamples;
        gradient.addColorStop(offset, color);
    }
    
    // Fill the entire canvas with the gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Update labels
    document.getElementById('colorbar-max').textContent = maxH.toFixed(1) + ' m';
    document.getElementById('colorbar-min').textContent = minH.toFixed(1) + ' m';
}

function updateGeometry() {
    const dataMin = rasterMinHeight ?? MIN_HEIGHT;
    const dataMax = rasterMaxHeight ?? MAX_HEIGHT;
    const dataRange = dataMax - dataMin;
    const { min: colorMinH, max: colorMaxH } = getColorRange();
    const colorRange = colorMaxH - colorMinH;
    
    for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3(
            originalPositions[i * 3],
            originalPositions[i * 3 + 1],
            originalPositions[i * 3 + 2]
        );
        
        const lat = Math.asin(vertex.y) * 180 / Math.PI;
        const lon = Math.atan2(vertex.x, vertex.z) * 180 / Math.PI;
        const height = getHeightFromRaster(lat, lon);
        
        // Deformation uses full data range
        const normalizedHeightForDisplacement = dataRange > 0 ? (height - dataMin) / dataRange : 0.5;
        const heightOffset = (normalizedHeightForDisplacement - 0.5) * 2;
        const scaleFactor = Math.max(0.5, Math.min(1.5, 1 + heightOffset * (deformationPercent / 100)));
        vertex.multiplyScalar(scaleFactor);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        
        // Color uses custom range if set
        const normalizedHeightForColor = colorRange > 0 ? Math.max(0, Math.min(1, (height - colorMinH) / colorRange)) : 0.5;
        let [r, g, b] = getColor(normalizedHeightForColor, currentColormap);
        
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    
    // Update color attribute
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Create materials - BasicMaterial shows true colors without lighting effects
const unlitMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
});

// LambertMaterial for lit rendering (less washed out than Phong)
const litMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: false,
});

let currentMaterial = unlitMaterial;

// Create a group to hold globe and wireframes so they rotate together
const globeGroup = new THREE.Group();
scene.add(globeGroup);

// Create mesh
const globe = new THREE.Mesh(geometry, currentMaterial);
globeGroup.add(globe);

// Continent wireframes
let continentLines = null;
let showWireframes = false;
const wireframeCoords = new Map(); // Store lat/lon for each wireframe line

// Function to convert lat/lon to 3D position on sphere
// Matches Three.js SphereGeometry coordinate system
function latLonToPosition(lat, lon, radius = 1) {
    // Convert to radians
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    
    // Three.js SphereGeometry: y is up, x/z are horizontal
    // lat: -90 (south) to 90 (north) -> y: -1 to 1
    // lon: -180 (west) to 180 (east) -> x/z rotation
    const x = radius * Math.cos(latRad) * Math.sin(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lonRad);
    
    return new THREE.Vector3(x, y, z);
}

// Function to find nearest valid raster cell height
function getNearestRasterCellHeight(lat, lon) {
    if (!rasterHeights?.length || !rasterLats?.length || !rasterLons?.length) {
        return 0;
    }

    lon = normalizeLongitude(lon);

    // Find closest indices using angular distance for longitude
    let closestLatIdx = 0;
    let closestLonIdx = 0;
    let minLatDiff = Math.abs(lat - rasterLats[0]);
    let minLonDiff = angularDistance(lon, rasterLons[0]);

    for (let i = 1; i < rasterLats.length; i++) {
        const diff = Math.abs(lat - rasterLats[i]);
        if (diff < minLatDiff) {
            minLatDiff = diff;
            closestLatIdx = i;
        }
    }

    for (let i = 1; i < rasterLons.length; i++) {
        const diff = angularDistance(lon, rasterLons[i]);
        if (diff < minLonDiff) {
            minLonDiff = diff;
            closestLonIdx = i;
        }
    }

    // Try nearest cell first
    const height = rasterHeights[closestLatIdx]?.[closestLonIdx];
    if (isFinite(height) && Math.abs(height) < 10000) {
        return height;
    }

    // Search nearby cells if nearest is invalid
    for (let latOffset = -2; latOffset <= 2; latOffset++) {
        for (let lonOffset = -2; lonOffset <= 2; lonOffset++) {
            const latIdx = closestLatIdx + latOffset;
            const lonIdx = (closestLonIdx + lonOffset + rasterLons.length) % rasterLons.length;
            const h = rasterHeights[latIdx]?.[lonIdx];
            if (isFinite(h) && Math.abs(h) < 10000) {
                return h;
            }
        }
    }

    return 0;
}

// Debug flag - set to true to enable debug logging
let DEBUG_WIREFRAMES = true;
const debugStats = {
    totalPoints: 0,
    invalidHeights: 0,
    extremeHeights: 0,
    invalidScaleFactors: 0,
    problematicCoords: [],
    rasterLookupFailures: 0
};

// Function to apply deformation to a position
function applyDeformationToPosition(position, lat, lon) {
    lon = normalizeLongitude(lon);
    
    if (!rasterHeights || !rasterLats || !rasterLons) {
        if (DEBUG_WIREFRAMES) {
            console.warn(`[DEBUG] No raster data for lat=${lat}, lon=${lon}`);
        }
        return position.clone();
    }

    let height = getHeightFromRaster(lat, lon);
    
    // Fallback if height is invalid
    if (!isFinite(height) || Math.abs(height) > 10000) {
        if (DEBUG_WIREFRAMES) {
            debugStats.invalidHeights++;
            console.warn(`[DEBUG] Invalid height at lat=${lat.toFixed(4)}, lon=${lon.toFixed(4)}: ${height}`);
        }
        height = getNearestRasterCellHeight(lat, lon);
        if (!isFinite(height) || Math.abs(height) > 10000) {
            height = 0;
        }
    }
    
    const dataMin = rasterMinHeight ?? MIN_HEIGHT;
    const dataMax = rasterMaxHeight ?? MAX_HEIGHT;
    const dataRange = dataMax - dataMin;
    
    if (dataRange <= 0 || !isFinite(dataRange)) {
        if (DEBUG_WIREFRAMES) {
            console.warn(`[DEBUG] Invalid data range: min=${dataMin}, max=${dataMax}`);
        }
        return position.clone();
    }
    
    // Track extreme heights
    if (DEBUG_WIREFRAMES && Math.abs(height) > 1000) {
        debugStats.extremeHeights++;
        if (debugStats.extremeHeights <= 5) {
            console.warn(`[DEBUG] Extreme height at lat=${lat.toFixed(4)}, lon=${lon.toFixed(4)}: ${height}m`);
        }
    }
    
    const normalizedHeight = Math.max(0, Math.min(1, (Math.max(dataMin, Math.min(dataMax, height)) - dataMin) / dataRange));
    const heightOffset = (normalizedHeight - 0.5) * 2;
    const scaleFactor = Math.max(0.5, Math.min(1.5, 1 + heightOffset * (deformationPercent / 100)));
    
    if (!isFinite(scaleFactor)) {
        if (DEBUG_WIREFRAMES) {
            debugStats.invalidScaleFactors++;
            console.error(`[DEBUG] Invalid scaleFactor at lat=${lat.toFixed(4)}, lon=${lon.toFixed(4)}: ${scaleFactor}`);
        }
        return position.clone();
    }
    
    // Track extreme scale factors
    if (DEBUG_WIREFRAMES && Math.abs(scaleFactor - 1.0) > 0.3 && debugStats.problematicCoords.length < 10) {
        debugStats.problematicCoords.push({lat, lon, height, scaleFactor});
    }
    
    if (DEBUG_WIREFRAMES) {
        debugStats.totalPoints++;
    }
    
    const deformedPos = position.clone().multiplyScalar(scaleFactor);
    
    // Sanity check - return original if deformed position is invalid
    if (!isFinite(deformedPos.x) || !isFinite(deformedPos.y) || !isFinite(deformedPos.z) ||
        Math.abs(deformedPos.x) > 10 || Math.abs(deformedPos.y) > 10 || Math.abs(deformedPos.z) > 10) {
        if (DEBUG_WIREFRAMES) {
            console.error(`[DEBUG] Extreme deformed position at lat=${lat.toFixed(4)}, lon=${lon.toFixed(4)}:`, deformedPos);
        }
        return position.clone();
    }
    
    return deformedPos;
}

// Helper function to create a line from coordinates
function createLineFromCoordinates(coordinates, lineGroup, lineIndex) {
    const points = [];
    const coords = [];
    
    coordinates.forEach(([lon, lat]) => {
        lon = normalizeLongitude(lon);
        coords.push([lat, lon]);
        const pos = latLonToPosition(lat, lon, 1);
        const deformedPos = applyDeformationToPosition(pos, lat, lon);
        points.push(deformedPos);
    });
    
    if (points.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create thick white line using multiple overlapping lines
        const whiteMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            opacity: 0.8,
            transparent: true
        });
        
        // Use 2 overlapping lines for thickness effect
        for (let i = 0; i < 2; i++) {
            const line = new THREE.Line(geometry.clone(), whiteMaterial);
            lineGroup.add(line);
        }
        
        wireframeCoords.set(lineIndex, coords);
        return lineIndex + 1;
    }
    return lineIndex;
}

// Function to load and render continent boundaries
async function loadContinentWireframes(geojsonUrl = null) {
    // Default to world boundaries (LineStrings) for wireframes
    const url = geojsonUrl || 'data/world_boundaries.json';
    try {
        console.log(`Loading wireframes from: ${url}`);
        const response = await fetch(url);
        const geojson = await response.json();

        const lineGroup = new THREE.Group();
        
        // Process each feature - now expecting LineString features from cleaned GeoJSON
        let lineIndex = 0;
        geojson.features.forEach(feature => {
            if (feature.geometry.type === 'LineString') {
                // Direct LineString handling - gaps should already be split during preprocessing
                lineIndex = createLineFromCoordinates(feature.geometry.coordinates, lineGroup, lineIndex);
            } else if (feature.geometry.type === 'Polygon') {
                // Fallback: handle Polygon if using original file
                lineIndex = createLineFromCoordinates(feature.geometry.coordinates[0], lineGroup, lineIndex);
            } else if (feature.geometry.type === 'MultiPolygon') {
                // Fallback: handle MultiPolygon if using original file
                feature.geometry.coordinates.forEach(polygon => {
                    lineIndex = createLineFromCoordinates(polygon[0], lineGroup, lineIndex);
                });
            }
        });

        continentLines = lineGroup;
        continentLines.visible = showWireframes;
        globeGroup.add(continentLines);
        console.log(`Loaded ${lineIndex} wireframe lines from ${geojson.features.length} features`);
        
        // Log debug statistics
        if (DEBUG_WIREFRAMES) {
            console.log(`[DEBUG] Wireframe Statistics:`);
            console.log(`  Total points processed: ${debugStats.totalPoints}`);
            console.log(`  Invalid heights: ${debugStats.invalidHeights}`);
            console.log(`  Extreme heights (>1000m): ${debugStats.extremeHeights}`);
            console.log(`  Invalid scale factors: ${debugStats.invalidScaleFactors}`);
            console.log(`  Raster lookup failures: ${debugStats.rasterLookupFailures}`);
            console.log(`  Problematic coordinates: ${debugStats.problematicCoords.length}`);
            if (debugStats.problematicCoords.length > 0) {
                console.log(`[DEBUG] Problematic coordinates:`, debugStats.problematicCoords.slice(0, 5));
            }
        }
    } catch (error) {
        console.error('Error loading continent wireframes:', error);
        // Fallback: create simple continent outlines using a basic pattern
        createSimpleContinentWireframes();
    }
}

// Fallback function for simple continent wireframes
function createSimpleContinentWireframes() {
    const lineGroup = new THREE.Group();
    
    // Create a simple grid pattern as fallback
    const segments = 36;
    const whiteMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.8,
        transparent: true
    });
    
    for (let i = 0; i <= segments; i++) {
        const lat = -90 + (i / segments) * 180;
        const points = [];
        for (let j = 0; j <= segments; j++) {
            const lon = -180 + (j / segments) * 360;
            const pos = latLonToPosition(lat, lon, 1);
            points.push(pos);
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Use 2 overlapping lines for thickness
        for (let k = 0; k < 2; k++) {
            lineGroup.add(new THREE.Line(geometry.clone(), whiteMaterial));
        }
    }

    continentLines = lineGroup;
    continentLines.visible = showWireframes;
    globeGroup.add(continentLines); // Add to globe group so it rotates with globe
}

// Function to update wireframe positions when deformation changes
function updateWireframePositions() {
    if (!continentLines) return;

    // Reset debug stats for update
    if (DEBUG_WIREFRAMES) {
        debugStats.totalPoints = 0;
        debugStats.invalidHeights = 0;
        debugStats.extremeHeights = 0;
        debugStats.invalidScaleFactors = 0;
        debugStats.problematicCoords = [];
    }

    // Each lineIndex has 2 overlapping white lines for thickness
    const linesPerSegment = 2;
    let actualLineIndex = 0;

    continentLines.children.forEach((line) => {
        const coordIndex = Math.floor(actualLineIndex / linesPerSegment);
        
        // Only process the first line of each segment (others share the same geometry)
        if (actualLineIndex % linesPerSegment === 0) {
            if (!wireframeCoords.has(coordIndex)) {
                actualLineIndex++;
                return;
            }
            
            const coords = wireframeCoords.get(coordIndex);
            const newPositions = [];
            
            coords.forEach(([lat, lon]) => {
                const originalPos = latLonToPosition(lat, lon, 1);
                const deformedPos = applyDeformationToPosition(originalPos, lat, lon);
                
                // Use original position as fallback if deformed position is invalid
                if (!isFinite(deformedPos.x) || !isFinite(deformedPos.y) || !isFinite(deformedPos.z)) {
                    if (DEBUG_WIREFRAMES) {
                        console.error(`[DEBUG] Invalid position at lat=${lat}, lon=${lon}`);
                    }
                    newPositions.push(originalPos.x, originalPos.y, originalPos.z);
                } else {
                    newPositions.push(deformedPos.x, deformedPos.y, deformedPos.z);
                }
            });
            
            // Update all lines in this segment (they share the same geometry)
            for (let i = 0; i < linesPerSegment; i++) {
                const segmentLine = continentLines.children[actualLineIndex + i];
                if (segmentLine && segmentLine.geometry) {
                    segmentLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
                    segmentLine.geometry.attributes.position.needsUpdate = true;
                }
            }
        }
        
        actualLineIndex++;
    });
    
    if (DEBUG_WIREFRAMES) {
        console.log(`[DEBUG] Updated wireframe positions - Stats:`, {
            totalPoints: debugStats.totalPoints,
            invalidHeights: debugStats.invalidHeights,
            extremeHeights: debugStats.extremeHeights,
            problematicCoords: debugStats.problematicCoords.length
        });
    }
}

// Function to update material
function updateMaterial() {
    currentMaterial = useUnlit ? unlitMaterial : litMaterial;
    globe.material = currentMaterial;
}

// URL parameter management
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        deformation: params.get('deformation') ? parseFloat(params.get('deformation')) : null,
        rotationSpeed: params.get('rotationSpeed') ? parseFloat(params.get('rotationSpeed')) : null,
        colormap: params.get('colormap') || null,
        unlit: params.get('unlit') !== null ? params.get('unlit') === 'true' : null,
        wireframes: params.get('wireframes') !== null ? params.get('wireframes') === 'true' : null,
        wireframesData: params.get('wireframesData') || null,
        colorMin: params.get('colorMin') ? parseFloat(params.get('colorMin')) : null,
        colorMax: params.get('colorMax') ? parseFloat(params.get('colorMax')) : null,
        data: params.get('data') || null
    };
}

function updateURL() {
    const params = new URLSearchParams();
    if (deformationPercent !== 20) params.set('deformation', deformationPercent.toString());
    if (rotationSpeed !== 0.5) params.set('rotationSpeed', rotationSpeed.toString());
    if (currentColormap !== 'viridis') params.set('colormap', currentColormap);
    if (!useUnlit) params.set('unlit', 'false');
    if (showWireframes) params.set('wireframes', 'true');
    if (colorMin !== null) params.set('colorMin', colorMin.toString());
    if (colorMax !== null) params.set('colorMax', colorMax.toString());
    
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get('data')) params.set('data', currentParams.get('data'));
    
    const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', newURL);
}

// Controls UI - get elements first
const deformationPercentInput = document.getElementById('deformationPercent');
const rotationSpeedSlider = document.getElementById('rotationSpeed');
const rotationSpeedValue = document.getElementById('rotationSpeedValue');
const colormapSelect = document.getElementById('colormapSelect');
const unlitColorsCheckbox = document.getElementById('unlitColors');
const showWireframesCheckbox = document.getElementById('showWireframes');
const colorMinInput = document.getElementById('colorMin');
const colorMaxInput = document.getElementById('colorMax');
const resetColorRangeBtn = document.getElementById('resetColorRange');
const resetCameraBtn = document.getElementById('resetCamera');

// Initialize from URL parameters
const urlParams = getURLParams();
if (urlParams.deformation !== null) {
    deformationPercent = Math.max(0, Math.min(50, urlParams.deformation));
    deformationPercentInput.value = deformationPercent;
}
if (urlParams.rotationSpeed !== null) {
    rotationSpeed = Math.max(0, Math.min(2, urlParams.rotationSpeed));
    rotationSpeedSlider.value = rotationSpeed;
    rotationSpeedValue.textContent = rotationSpeed;
}
if (urlParams.colormap !== null) {
    currentColormap = urlParams.colormap;
    colormapSelect.value = currentColormap;
}
if (urlParams.unlit !== null) {
    useUnlit = urlParams.unlit;
    unlitColorsCheckbox.checked = useUnlit;
}
if (urlParams.wireframes !== null) {
    showWireframes = urlParams.wireframes;
    showWireframesCheckbox.checked = showWireframes;
}
if (urlParams.colorMin !== null) {
    colorMin = urlParams.colorMin;
    colorMinInput.value = colorMin;
}
if (urlParams.colorMax !== null) {
    colorMax = urlParams.colorMax;
    colorMaxInput.value = colorMax;
}

// Function to update color range input values and limits
function updateColorRangeInputs() {
    const { dataMin, dataMax } = getColorRange();
    if (colorMinInput && colorMaxInput) {
        // Set min/max attributes for validation
        colorMinInput.min = (dataMin - 10).toFixed(1);
        colorMinInput.max = (dataMax + 10).toFixed(1);
        colorMaxInput.min = (dataMin - 10).toFixed(1);
        colorMaxInput.max = (dataMax + 10).toFixed(1);
        
        // Update values if using full range (null)
        if (colorMin === null) {
            colorMinInput.value = dataMin.toFixed(1);
        } else {
            colorMinInput.value = colorMin.toFixed(1);
        }
        
        if (colorMax === null) {
            colorMaxInput.value = dataMax.toFixed(1);
        } else {
            colorMaxInput.value = colorMax.toFixed(1);
        }
    }
}

// Initial geometry update and colorbar
updateGeometry();
updateColorbar();
updateColorRangeInputs(); // Initialize color range inputs

deformationPercentInput.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
        deformationPercent = Math.max(0, Math.min(50, value));
        e.target.value = deformationPercent;
        updateGeometry();
        updateWireframePositions();
        updateURL();
    }
});

rotationSpeedSlider.addEventListener('input', (e) => {
    rotationSpeed = parseFloat(e.target.value);
    rotationSpeedValue.textContent = rotationSpeed;
    globe.userData.rotationSpeed = rotationSpeed;
    updateURL();
});

colormapSelect.addEventListener('change', (e) => {
    currentColormap = e.target.value;
    updateGeometry();
    updateColorbar();
    updateURL();
});

unlitColorsCheckbox.addEventListener('change', (e) => {
    useUnlit = e.target.checked;
    updateMaterial();
    updateGeometry();
    updateURL();
});

showWireframesCheckbox.addEventListener('change', (e) => {
    showWireframes = e.target.checked;
    if (continentLines) {
        continentLines.visible = showWireframes;
    } else if (showWireframes) {
        loadContinentWireframes();
    }
    updateURL();
});

// Handle color range input changes
function handleColorRangeChange() {
    updateGeometry();
    updateColorbar();
}

colorMinInput.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
        colorMin = value;
        if (colorMax !== null && value >= colorMax) {
            colorMin = colorMax - 0.1;
            colorMinInput.value = colorMin.toFixed(1);
        }
        handleColorRangeChange();
        updateURL();
    }
});

colorMaxInput.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
        colorMax = value;
        if (colorMin !== null && value <= colorMin) {
            colorMax = colorMin + 0.1;
            colorMaxInput.value = colorMax.toFixed(1);
        }
        handleColorRangeChange();
        updateURL();
    }
});

resetColorRangeBtn.addEventListener('click', () => {
    colorMin = null;
    colorMax = null;
    updateColorRangeInputs();
    handleColorRangeChange();
    updateURL();
});

resetCameraBtn.addEventListener('click', () => {
    camera.position.set(0, 0, 5);
    controls.reset();
});

globe.userData.rotationSpeed = rotationSpeed;

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Auto-rotate (rotate the group so globe and wireframes rotate together)
    if (globe.userData.rotationSpeed > 0) {
        globeGroup.rotation.y += 0.01 * globe.userData.rotationSpeed;
    }
    
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Function to load raster data from JSON file
async function loadRasterData(url) {
    try {
        console.log(`Loading raster data from: ${url}`);
        const response = await fetch(url);
        const data = await response.json();
        
        rasterHeights = data.heights;
        rasterLats = data.lats;
        rasterLons = data.lons;
        rasterMinHeight = data.minHeight || MIN_HEIGHT;
        rasterMaxHeight = data.maxHeight || MAX_HEIGHT;
        
        console.log(`Loaded raster: ${data.shape[0]}x${data.shape[1]}`);
        console.log(`Height range: ${rasterMinHeight} to ${rasterMaxHeight} meters`);
        
        // Update geometry with real data
        updateGeometry();
        // Update colorbar with new data range
        updateColorbar();
        // Update color range inputs to match new data
        updateColorRangeInputs();
        
        return data;
    } catch (error) {
        console.error('Error loading raster data:', error);
        console.log('Using fallback pattern');
        return null;
    }
}

// Initialize: load raster data first, then wireframes if needed
(async () => {
    // Load raster data (use URL parameter if provided, otherwise use default)
    const dataUrl = urlParams.data || DEFAULT_GEoid_DATA_URL;
    await loadRasterData(dataUrl);
    
    // Load wireframes after raster data is ready
    if (showWireframes) {
        const wireframesUrl = urlParams.wireframesData || null;
        await loadContinentWireframes(wireframesUrl);
    }
})();

// Export function for external use
window.updateDeformationPercent = (percent) => {
    deformationPercent = Math.max(0, Math.min(50, percent));
    if (deformationPercentInput) {
        deformationPercentInput.value = deformationPercent;
    }
    updateGeometry();
    updateURL();
};

window.loadRasterData = loadRasterData;

// Debug helper functions
window.getWireframeDebugStats = () => {
    console.log('Current Wireframe Debug Statistics:', debugStats);
    return debugStats;
};

window.toggleWireframeDebug = () => {
    DEBUG_WIREFRAMES = !DEBUG_WIREFRAMES;
    console.log(`Wireframe debug logging: ${DEBUG_WIREFRAMES ? 'ENABLED' : 'DISABLED'}`);
    return DEBUG_WIREFRAMES;
};
