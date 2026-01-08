import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Debug mode
const debugMode = false;

// Detect if device is mobile/touch-enabled
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Game state
const gameState = {
    started: false, // Game hasn't started yet
    paused: false, // Game is paused
    freeFlying: false, // Free-flying camera mode
    lavaType: 'boulder', // 'boulder', 'spray', or 'liquid' (liquid is stub for now)
    lavaAmount: 100,
    lavaMax: 100,
    lavaRegenRate: 10, // per second
    isPointerLocked: false,
    rotation: 0, // Player rotation around volcano
    rotationSpeed: 1.5, // radians per second
    cutiePatootieMode: false, // Sprite mode disabled by default
    villagerKillCount: 0,
    gameOver: false,
    highestVillagerElevation: 0, // Percentage from village to win condition
    invertMouseY: false, // Invert vertical mouse controls (set based on device type later)
};

// Load saved Cutie Patootie preference
const savedCutieMode = localStorage.getItem('volcano-god-cutie-mode');
if (savedCutieMode !== null) {
    gameState.cutiePatootieMode = savedCutieMode === 'true';
}

// Sync checkbox with loaded value
window.addEventListener('DOMContentLoaded', () => {
    const startToggle = document.getElementById('start-cutie-patootie-toggle');
    if (startToggle) {
        startToggle.checked = gameState.cutiePatootieMode;
    }
});

// Load sprite textures for Cutie Patootie Mode
const textureLoader = new THREE.TextureLoader();
const spriteTextures = {
    princess: [
        textureLoader.load('./assets/sprites/princess-1.png',
            undefined,
            undefined,
            (err) => console.error('Error loading princess-1.png:', err)),
        textureLoader.load('./assets/sprites/princess-2.png',
            undefined,
            undefined,
            (err) => console.error('Error loading princess-2.png:', err))
    ],
    normal: [
        textureLoader.load('./assets/sprites/normal-1.png',
            undefined,
            undefined,
            (err) => console.error('Error loading normal-1.png:', err)),
        textureLoader.load('./assets/sprites/normal-2.png',
            undefined,
            undefined,
            (err) => console.error('Error loading normal-2.png:', err)),
        textureLoader.load('./assets/sprites/normal-3.png',
            undefined,
            undefined,
            (err) => console.error('Error loading normal-3.png:', err))
    ],
    brute: [
        textureLoader.load('./assets/sprites/brute-1.png',
            undefined,
            undefined,
            (err) => console.error('Error loading brute-1.png:', err)),
        textureLoader.load('./assets/sprites/brute-2.png',
            undefined,
            undefined,
            (err) => console.error('Error loading brute-2.png:', err)),
        textureLoader.load('./assets/sprites/brute-3.png',
            undefined,
            undefined,
            (err) => console.error('Error loading brute-3.png:', err))
    ]
};

// Input state
const input = {
    rotateLeft: false,
    rotateRight: false,
    fire: false,
    changeTypeLeft: false,
    changeTypeRight: false,
    // Free-flying controls
    forward: false,
    backward: false,
    left: false,
    right: false,
};

// Initialize Three.js
const scene = new THREE.Scene();

// Create gradient background (white to dark blue)
const canvas = document.createElement('canvas');
canvas.width = 2;
canvas.height = 256;
const ctx = canvas.getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, '#ffffff'); // White at top
gradient.addColorStop(1, '#1e3a8a'); // Dark blue at bottom
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 2, 256);
const gradientTexture = new THREE.CanvasTexture(canvas);
scene.background = gradientTexture;

scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Initialize Cannon.js physics
const world = new CANNON.World();
world.gravity.set(0, -30, 0); // Even stronger gravity for faster lava drop-off

// Set up collision detection
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;
world.allowSleep = true;

// Create physics materials
const volcanoMat = new CANNON.Material('volcano');
const lavaMat = new CANNON.Material('lava');
const groundMat = new CANNON.Material('ground');

// Define contact behavior between materials
const lavaVolcanoContact = new CANNON.ContactMaterial(lavaMat, volcanoMat, {
    friction: 50.0, // Extremely high friction to stick immediately
    restitution: 0.0, // No bounce at all
});

const lavaGroundContact = new CANNON.ContactMaterial(lavaMat, groundMat, {
    friction: 50.0,
    restitution: 0.0,
});

world.addContactMaterial(lavaVolcanoContact);
world.addContactMaterial(lavaGroundContact);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(50, 100, 50);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// We'll create the visual volcano AFTER the physics bodies to match them exactly
const volcanoRadius = 60; // Much wider
const volcanoHeight = 30; // Shorter for flatter profile

// Create volcano physics body AND visual mesh together so they match perfectly
const volcanoSegments = 10;

// Create a material for the volcano
const volcanoMaterial = new THREE.MeshStandardMaterial({
    color: 0x654321,
    roughness: 1.0,
    metalness: 0,
    flatShading: true,
    vertexColors: true
});

for (let i = 0; i < volcanoSegments; i++) {
    const segmentHeight = volcanoHeight / volcanoSegments;

    // Calculate radius at the TOP and BOTTOM of this segment for a tapered cylinder
    const topHeightRatio = (i + 1) / volcanoSegments;
    const bottomHeightRatio = i / volcanoSegments;

    const calderaRadius = volcanoRadius * 0.1; // Small radius at top (caldera)
    const topSegmentRadius = volcanoRadius - (volcanoRadius - calderaRadius) * topHeightRatio;
    const bottomSegmentRadius = volcanoRadius - (volcanoRadius - calderaRadius) * bottomHeightRatio;

    // Make physics cylinders slightly larger to ensure coverage, but not too much
    const radiusInflation = 1.1; // Just 10% larger for good collision
    const topRadius = topSegmentRadius * radiusInflation;
    const bottomRadius = bottomSegmentRadius * radiusInflation;

    const yPosPhysics = i * segmentHeight + segmentHeight / 2; // Center of each segment

    // Create a TAPERED cylinder that better matches the cone
    const shape = new CANNON.Cylinder(topRadius, bottomRadius, segmentHeight, 16);
    const body = new CANNON.Body({
        mass: 0,
        material: volcanoMat
    });
    body.addShape(shape);
    body.position.set(0, yPosPhysics, 0);
    world.addBody(body);

    // Visualize the PHYSICS mesh directly (same size as collision)
    const visualGeometry = new THREE.CylinderGeometry(topRadius, bottomRadius, segmentHeight, 32, 1);

    // Add color variation for terrain effect with biomes
    const colors = [];
    const positions = visualGeometry.attributes.position;
    for (let j = 0; j < positions.count; j++) {
        const x = positions.getX(j);
        const y = positions.getY(j);
        const z = positions.getZ(j);

        // Calculate global position
        const globalY = yPosPhysics - segmentHeight/2 + y;
        const globalHeightRatio = globalY / volcanoHeight;

        // Calculate distance from center axis (horizontal distance)
        const horizontalDist = Math.sqrt(x * x + z * z);
        const radiusAtThisHeight = topRadius + (bottomRadius - topRadius) * ((segmentHeight/2 - y) / segmentHeight);
        const normalizedDist = horizontalDist / radiusAtThisHeight; // 0 at center, 1 at edge

        // Check if inside caldera (top section, near center)
        const calderaRadius = volcanoRadius * 0.15;
        const isInsideCaldera = globalHeightRatio > 0.85 && horizontalDist < calderaRadius * 1.2;

        let r, g, b;

        if (isInsideCaldera) {
            // Inside caldera: gray around rim -> red -> yellow toward center
            const calderaDepth = 1.0 - globalHeightRatio; // 0 at rim, higher going down
            const centeredness = 1.0 - (horizontalDist / (calderaRadius * 1.2)); // 1 at center, 0 at edge

            // Blend from gray (rim) to red to yellow (center)
            const heatLevel = centeredness * 0.7 + calderaDepth * 0.3;

            if (heatLevel < 0.3) {
                // Gray rock
                const grayValue = 0.4 + Math.random() * 0.2;
                r = grayValue;
                g = grayValue;
                b = grayValue;
            } else if (heatLevel < 0.6) {
                // Red lava
                r = 0.5 + Math.random() * 0.3;
                g = 0.1 + Math.random() * 0.1;
                b = 0.0;
            } else {
                // Yellow-orange hot lava
                r = 0.9 + Math.random() * 0.1;
                g = 0.7 + Math.random() * 0.2;
                b = 0.1 + Math.random() * 0.1;
            }
        } else {
            // Outside caldera: biomes based on height and distance
            const beachEnd = 0.15; // Beach up to 15% height
            const greenStart = 0.1;
            const greenEnd = 0.6;
            const rockyStart = 0.5;

            // Add random variation for specks/splotches
            const randValue = Math.random();

            if (globalHeightRatio < beachEnd) {
                // Beach biome: tan with dark brown specks
                if (randValue < 0.15) {
                    // Dark brown specks (15% chance)
                    r = 0.2 + Math.random() * 0.1;
                    g = 0.15 + Math.random() * 0.1;
                    b = 0.05 + Math.random() * 0.05;
                } else {
                    // Tan/sand color
                    r = 0.76 + Math.random() * 0.1;
                    g = 0.70 + Math.random() * 0.1;
                    b = 0.50 + Math.random() * 0.1;
                }
            } else if (globalHeightRatio < greenEnd) {
                // Green vegetation zone with brown splotches
                const greenIntensity = Math.min(1.0, (globalHeightRatio - greenStart) / (greenEnd - greenStart));

                if (randValue < 0.2) {
                    // Brown splotches (20% chance)
                    r = 0.4 + Math.random() * 0.2;
                    g = 0.3 + Math.random() * 0.15;
                    b = 0.2 + Math.random() * 0.1;
                } else {
                    // Green vegetation
                    r = 0.2 + Math.random() * 0.15;
                    g = 0.4 + greenIntensity * 0.3 + Math.random() * 0.2;
                    b = 0.15 + Math.random() * 0.1;
                }
            } else {
                // Rocky zone: gray with streaks
                const rockyIntensity = (globalHeightRatio - rockyStart) / (1.0 - rockyStart);

                // Create vertical streaks using x position
                const streakValue = Math.sin(Math.atan2(z, x) * 5 + Math.random() * 0.5);
                const isStreak = streakValue > 0.3;

                if (isStreak || randValue < 0.3) {
                    // Dark gray streaks
                    const grayValue = 0.25 + Math.random() * 0.15;
                    r = grayValue;
                    g = grayValue;
                    b = grayValue;
                } else {
                    // Lighter gray rock
                    const grayValue = 0.45 + Math.random() * 0.2;
                    r = grayValue;
                    g = grayValue * 0.95;
                    b = grayValue * 0.9;
                }
            }
        }

        colors.push(r, g, b);
    }
    visualGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const visualMesh = new THREE.Mesh(visualGeometry, volcanoMaterial);
    visualMesh.position.set(0, yPosPhysics, 0);
    visualMesh.receiveShadow = true;
    visualMesh.castShadow = true;
    scene.add(visualMesh);
}

// Create villages near the shoreline
const villageRadius = 8; // Much larger
const villageHeight = 2; // Taller

// Position villages on the slope near the shoreline
const villageDistanceFromCenter = volcanoRadius * 0.6; // Mid-slope, more visible

// Village 1 - 45 degrees
const village1Angle = Math.PI / 4; // 45 degrees around
const village1X = Math.cos(village1Angle) * villageDistanceFromCenter;
const village1Z = Math.sin(village1Angle) * villageDistanceFromCenter;
const distanceRatio = villageDistanceFromCenter / volcanoRadius;
const villageHeightOnSlope = volcanoHeight * (1 - distanceRatio);

// Create village 1 geometry with island biome colors
const village1Geometry = new THREE.CylinderGeometry(villageRadius, villageRadius, villageHeight, 32);
const village1Colors = [];
const village1Positions = village1Geometry.attributes.position;
for (let j = 0; j < village1Positions.count; j++) {
    const x = village1Positions.getX(j);
    const y = village1Positions.getY(j);
    const z = village1Positions.getZ(j);

    // Calculate global position
    const globalX = village1X + x;
    const globalZ = village1Z + z;
    const globalY = villageHeightOnSlope + villageHeight / 2 + y;
    const globalHeightRatio = globalY / volcanoHeight;

    // Apply same biome logic as island (green zone with brown splotches)
    const greenEnd = 0.6;
    const greenStart = 0.1;
    const randValue = Math.random();

    let r, g, b;
    if (globalHeightRatio < greenEnd) {
        const greenIntensity = Math.min(1.0, (globalHeightRatio - greenStart) / (greenEnd - greenStart));

        if (randValue < 0.2) {
            // Brown splotches (20% chance)
            r = 0.4 + Math.random() * 0.2;
            g = 0.3 + Math.random() * 0.15;
            b = 0.2 + Math.random() * 0.1;
        } else {
            // Green vegetation
            r = 0.2 + Math.random() * 0.15;
            g = 0.4 + greenIntensity * 0.3 + Math.random() * 0.2;
            b = 0.15 + Math.random() * 0.1;
        }
    } else {
        // Fallback green
        r = 0.2;
        g = 0.5;
        b = 0.15;
    }

    village1Colors.push(r, g, b);
}
village1Geometry.setAttribute('color', new THREE.Float32BufferAttribute(village1Colors, 3));

const village1 = new THREE.Mesh(village1Geometry, volcanoMaterial);
village1.position.set(village1X, villageHeightOnSlope + villageHeight / 2, village1Z);
village1.receiveShadow = true;
village1.castShadow = true;
scene.add(village1);

// Add roof cones to village 1
const roofCount1 = 8 + Math.floor(Math.random() * 5); // 8-12 roofs
for (let i = 0; i < roofCount1; i++) {
    const roofSize = (0.8 + Math.random() * 0.6) * 1.25; // Vary size, 25% larger
    const roofHeight = (1.5 + Math.random() * 1.0) * 1.25; // 25% larger
    const roofGeometry = new THREE.ConeGeometry(roofSize, roofHeight, 6);

    // Darker pink for roofs (original color)
    const tintVariation = 0.7 + Math.random() * 0.2; // 0.7-0.9 multiplier
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xff69b4).multiplyScalar(tintVariation),
        roughness: 0.9,
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);

    // Random position within village radius
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (villageRadius * 0.8);
    const roofX = village1X + Math.cos(angle) * dist;
    const roofZ = village1Z + Math.sin(angle) * dist;
    const roofY = village1.position.y + villageHeight / 2 + roofHeight / 2;

    roof.position.set(roofX, roofY, roofZ);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
}

// Village 2 - opposite side (225 degrees)
const village2Angle = Math.PI / 4 + Math.PI; // 225 degrees (opposite side)
const village2X = Math.cos(village2Angle) * villageDistanceFromCenter;
const village2Z = Math.sin(village2Angle) * villageDistanceFromCenter;

// Create village 2 geometry with island biome colors
const village2Geometry = new THREE.CylinderGeometry(villageRadius, villageRadius, villageHeight, 32);
const village2Colors = [];
const village2Positions = village2Geometry.attributes.position;
for (let j = 0; j < village2Positions.count; j++) {
    const x = village2Positions.getX(j);
    const y = village2Positions.getY(j);
    const z = village2Positions.getZ(j);

    // Calculate global position
    const globalX = village2X + x;
    const globalZ = village2Z + z;
    const globalY = villageHeightOnSlope + villageHeight / 2 + y;
    const globalHeightRatio = globalY / volcanoHeight;

    // Apply same biome logic as island (green zone with brown splotches)
    const greenEnd = 0.6;
    const greenStart = 0.1;
    const randValue = Math.random();

    let r, g, b;
    if (globalHeightRatio < greenEnd) {
        const greenIntensity = Math.min(1.0, (globalHeightRatio - greenStart) / (greenEnd - greenStart));

        if (randValue < 0.2) {
            // Brown splotches (20% chance)
            r = 0.4 + Math.random() * 0.2;
            g = 0.3 + Math.random() * 0.15;
            b = 0.2 + Math.random() * 0.1;
        } else {
            // Green vegetation
            r = 0.2 + Math.random() * 0.15;
            g = 0.4 + greenIntensity * 0.3 + Math.random() * 0.2;
            b = 0.15 + Math.random() * 0.1;
        }
    } else {
        // Fallback green
        r = 0.2;
        g = 0.5;
        b = 0.15;
    }

    village2Colors.push(r, g, b);
}
village2Geometry.setAttribute('color', new THREE.Float32BufferAttribute(village2Colors, 3));

const village2 = new THREE.Mesh(village2Geometry, volcanoMaterial);
village2.position.set(village2X, villageHeightOnSlope + villageHeight / 2, village2Z);
village2.receiveShadow = true;
village2.castShadow = true;
scene.add(village2);

// Add roof cones to village 2
const roofCount2 = 8 + Math.floor(Math.random() * 5); // 8-12 roofs
for (let i = 0; i < roofCount2; i++) {
    const roofSize = (0.8 + Math.random() * 0.6) * 1.25; // Vary size, 25% larger
    const roofHeight = (1.5 + Math.random() * 1.0) * 1.25; // 25% larger
    const roofGeometry = new THREE.ConeGeometry(roofSize, roofHeight, 6);

    // Darker green for roofs (original color)
    const tintVariation = 0.7 + Math.random() * 0.2; // 0.7-0.9 multiplier
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x00ff00).multiplyScalar(tintVariation),
        roughness: 0.9,
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);

    // Random position within village radius
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (villageRadius * 0.8);
    const roofX = village2X + Math.cos(angle) * dist;
    const roofZ = village2Z + Math.sin(angle) * dist;
    const roofY = village2.position.y + villageHeight / 2 + roofHeight / 2;

    roof.position.set(roofX, roofY, roofZ);
    roof.castShadow = true;
    roof.receiveShadow = true;
    scene.add(roof);
}

// Keep reference for backward compatibility
const village = village1;
const villageAngle = village1Angle;
const villageX = village1X;
const villageZ = village1Z;

// Helper function to get island surface height at any X,Z position
function getIslandSurfaceHeight(x, z) {
    const distanceFromCenter = Math.sqrt(x * x + z * z);
    const heightRatio = Math.max(0, Math.min(1, 1 - (distanceFromCenter / volcanoRadius)));
    return volcanoHeight * heightRatio;
}

// Test if object is above the island surface
function isAboveIsland(x, y, z) {
    const surfaceHeight = getIslandSurfaceHeight(x, z);
    return y > surfaceHeight;
}

// Create waypoints for Village 1 (Yellow)
const waypoint1v1Angle = village1Angle - Math.PI / 6; // To the left of village
const waypoint1v1Distance = volcanoRadius * 0.45; // Closer to center (higher up)
const waypoint1v1X = Math.cos(waypoint1v1Angle) * waypoint1v1Distance;
const waypoint1v1Z = Math.sin(waypoint1v1Angle) * waypoint1v1Distance;
const waypoint1v1Height = getIslandSurfaceHeight(waypoint1v1X, waypoint1v1Z); // Exactly at surface

const waypoint2v1Angle = village1Angle + Math.PI / 6; // To the right of village
const waypoint2v1Distance = volcanoRadius * 0.3; // Even closer to center (higher)
const waypoint2v1X = Math.cos(waypoint2v1Angle) * waypoint2v1Distance;
const waypoint2v1Z = Math.sin(waypoint2v1Angle) * waypoint2v1Distance;
const waypoint2v1Height = getIslandSurfaceHeight(waypoint2v1X, waypoint2v1Z); // Exactly at surface

const waypoint1v1 = new THREE.Vector3(waypoint1v1X, waypoint1v1Height, waypoint1v1Z);
const waypoint2v1 = new THREE.Vector3(waypoint2v1X, waypoint2v1Height, waypoint2v1Z);

// Create waypoints for Village 2 (Purple)
const waypoint1v2Angle = village2Angle - Math.PI / 6; // To the left of village 2
const waypoint1v2Distance = volcanoRadius * 0.45; // Closer to center (higher up)
const waypoint1v2X = Math.cos(waypoint1v2Angle) * waypoint1v2Distance;
const waypoint1v2Z = Math.sin(waypoint1v2Angle) * waypoint1v2Distance;
const waypoint1v2Height = getIslandSurfaceHeight(waypoint1v2X, waypoint1v2Z); // Exactly at surface

const waypoint2v2Angle = village2Angle + Math.PI / 6; // To the right of village 2
const waypoint2v2Distance = volcanoRadius * 0.3; // Even closer to center (higher)
const waypoint2v2X = Math.cos(waypoint2v2Angle) * waypoint2v2Distance;
const waypoint2v2Z = Math.sin(waypoint2v2Angle) * waypoint2v2Distance;
const waypoint2v2Height = getIslandSurfaceHeight(waypoint2v2X, waypoint2v2Z); // Exactly at surface

const waypoint1v2 = new THREE.Vector3(waypoint1v2X, waypoint1v2Height, waypoint1v2Z);
const waypoint2v2 = new THREE.Vector3(waypoint2v2X, waypoint2v2Height, waypoint2v2Z);

// Debug visualization for waypoints
if (debugMode) {
    const waypointGeometry = new THREE.CylinderGeometry(0.3, 0.3, 10, 8);

    // Village 1 waypoints (Yellow)
    const waypointMaterialV1 = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5,
    });

    const waypoint1v1Mesh = new THREE.Mesh(waypointGeometry, waypointMaterialV1);
    waypoint1v1Mesh.position.copy(waypoint1v1);
    waypoint1v1Mesh.position.y += 5; // Raise by half height
    scene.add(waypoint1v1Mesh);

    const waypoint2v1Mesh = new THREE.Mesh(waypointGeometry, waypointMaterialV1);
    waypoint2v1Mesh.position.copy(waypoint2v1);
    waypoint2v1Mesh.position.y += 5; // Raise by half height
    scene.add(waypoint2v1Mesh);

    // Village 2 waypoints (Purple)
    const waypointMaterialV2 = new THREE.MeshStandardMaterial({
        color: 0x9900ff,
        emissive: 0x9900ff,
        emissiveIntensity: 0.5,
    });

    const waypoint1v2Mesh = new THREE.Mesh(waypointGeometry, waypointMaterialV2);
    waypoint1v2Mesh.position.copy(waypoint1v2);
    waypoint1v2Mesh.position.y += 5; // Raise by half height
    scene.add(waypoint1v2Mesh);

    const waypoint2v2Mesh = new THREE.Mesh(waypointGeometry, waypointMaterialV2);
    waypoint2v2Mesh.position.copy(waypoint2v2);
    waypoint2v2Mesh.position.y += 5; // Raise by half height
    scene.add(waypoint2v2Mesh);
}

// Keep backward compatibility
const waypoint1 = waypoint1v1;
const waypoint2 = waypoint2v1;

// Store trees (needed before spawning)
const trees = [];

// Physics material for trees (needed before spawning)
const treeMat = new CANNON.Material('tree');
const treeLavaContact = new CANNON.ContactMaterial(treeMat, lavaMat, {
    friction: 50.0,
    restitution: 0.0,
});
world.addContactMaterial(treeLavaContact);

// Spawn trees randomly around the island
// Trees placed in a band from 25% to 60% of volcano radius
const treeCount = 30;
for (let i = 0; i < treeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const minDistance = volcanoRadius * 0.25;
    const maxDistance = volcanoRadius * 0.60;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);

    const treeX = Math.cos(angle) * distance;
    const treeZ = Math.sin(angle) * distance;
    const treeY = getIslandSurfaceHeight(treeX, treeZ);

    createTree(new THREE.Vector3(treeX, treeY, treeZ));
}

// Create ground/water around volcano
const groundGeometry = new THREE.CircleGeometry(150, 32);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x4169e1, // Royal blue (water)
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Ground physics
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({
    mass: 0,
    material: groundMat
});
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Position camera inside the caldera, higher up for better view
const calderaRadius = volcanoRadius * 0.15; // Top of cone radius (15% of base)
const cameraHeight = volcanoHeight + 8; // Higher above the rim for better view down
const cameraRadius = calderaRadius * 0.5; // Inside the caldera
camera.position.set(0, cameraHeight, cameraRadius);
// Look down and out so we can see the island below
camera.lookAt(0, cameraHeight - 20, -40);

// Store objects that need physics sync
const physicsObjects = [];

// Store solidified lava objects (no longer need physics sync)
const solidifiedLava = [];

// Store villagers
const villagers = [];

// Store embers (remains of destroyed villagers)
const embers = [];

// Store particle effects
const particles = [];

// Lava types array for cycling
const lavaTypes = ['bomb', 'boulder', 'spray'];

// Physics material for villagers
const villagerMat = new CANNON.Material('villager');
const villagerLavaContact = new CANNON.ContactMaterial(villagerMat, lavaMat, {
    friction: 0.3,
    restitution: 0.0, // No bounce
});
const villagerVolcanoContact = new CANNON.ContactMaterial(villagerMat, volcanoMat, {
    friction: 0.5,
    restitution: 0.0, // No bounce on volcano
});
const villagerGroundContact = new CANNON.ContactMaterial(villagerMat, groundMat, {
    friction: 0.5,
    restitution: 0.0, // No bounce on ground
});
world.addContactMaterial(villagerLavaContact);
world.addContactMaterial(villagerVolcanoContact);
world.addContactMaterial(villagerGroundContact);

// Create a palm tree
function createTree(position) {
    const trunkHeight = 4.5; // Same as princess height
    const trunkRadius = 0.3;
    const frondLength = trunkHeight / 2; // 2.25 units

    // Create trunk
    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b4513, // Brown
        roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.copy(position);
    trunk.position.y += trunkHeight / 2; // Center at surface
    trunk.position.y += trunkHeight * 0.5; // Move up 50% more
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    scene.add(trunk);

    // Create three palm fronds (flattened pyramids) radiating outward
    const frondGroup = new THREE.Group();
    const frondAngles = [0, Math.PI * 2 / 3, Math.PI * 4 / 3]; // 120 degrees apart

    for (let i = 0; i < 3; i++) {
        // Flattened cone for palm frond
        const frondGeometry = new THREE.ConeGeometry(frondLength * 0.3, frondLength, 4);
        // Scale it to flatten
        frondGeometry.scale(1, 1, 0.3); // Flatten on Z axis

        const frondMaterial = new THREE.MeshStandardMaterial({
            color: 0x228b22, // Forest green
            roughness: 0.8,
        });
        const frond = new THREE.Mesh(frondGeometry, frondMaterial);

        const angle = frondAngles[i];

        // Position outward from center (half the frond length since point is at center)
        const offsetDistance = frondLength / 2;
        frond.position.set(
            Math.cos(angle) * offsetDistance,
            trunkHeight, // At top of trunk
            Math.sin(angle) * offsetDistance
        );

        // Rotate 90 degrees onto side, then rotate around to point outward
        frond.rotation.z = Math.PI / 2; // Tip onto side (horizontal)
        frond.rotation.y = angle; // Rotate to point outward

        frond.castShadow = true;
        frondGroup.add(frond);
    }

    frondGroup.position.copy(position);
    frondGroup.position.y += trunkHeight * 0.5; // Move up 50% to match trunk
    scene.add(frondGroup);

    // Physics - cylinder for trunk collision
    const shape = new CANNON.Cylinder(trunkRadius * 1.5, trunkRadius * 1.5, trunkHeight, 8);
    const body = new CANNON.Body({
        mass: 0, // Static object
        material: treeMat,
    });
    body.addShape(shape);
    body.position.copy(position);
    body.position.y += trunkHeight / 2; // Center at surface
    body.position.y += trunkHeight * 0.5; // Move up 50% more
    world.addBody(body);

    trees.push({ trunk, frondGroup, body, position: position.clone() });
}

// Create a villager (cone shape)
function createVillager(position, isPrincess = false, villageId = 1, isBrute = false) {
    const villagerHeight = 1.5;
    const villagerRadius = 0.4;

    // Determine scale and type
    const scale = (isPrincess || isBrute) ? 3.0 : 1.0; // Princess and Brute are 3x bigger!
    const villagerType = isPrincess ? 'princess' : (isBrute ? 'brute' : 'normal');

    // Set health based on type
    const maxHealth = villagerType === 'brute' ? 4 : 2; // Brute: 4 HP, others: 2 HP

    // Calculate head radius for health bar positioning
    const headRadius = (isPrincess || isBrute)
        ? villagerRadius * scale * 0.36
        : villagerRadius * scale * 0.72;

    let mesh, headMesh;

    if (gameState.cutiePatootieMode) {
        // CUTIE PATOOTIE MODE: Use sprite
        // Select texture based on type
        let texture;
        if (isPrincess) {
            texture = spriteTextures.princess[villageId - 1]; // Princess 1 or 2 based on village
        } else if (isBrute) {
            const randomIndex = Math.floor(Math.random() * spriteTextures.brute.length);
            texture = spriteTextures.brute[randomIndex];
        } else {
            const randomIndex = Math.floor(Math.random() * spriteTextures.normal.length);
            texture = spriteTextures.normal[randomIndex];
        }

        // Create sprite material with transparency
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.05, // Discard pixels below 5% opacity (was 10%)
            sizeAttenuation: true, // Sprite scales with distance
        });
        mesh = new THREE.Sprite(spriteMaterial);

        // Adjust sprite size: normal villagers +25%, brutes/princesses -40%
        const sizeAdjust = (isPrincess || isBrute) ? 0.6 : 1.25;
        const spriteWidth = villagerHeight * scale * 0.8 * sizeAdjust;
        const spriteHeight = villagerHeight * scale * sizeAdjust;
        mesh.scale.set(spriteWidth, spriteHeight, 1);

        mesh.position.copy(position);
        // Position sprites lower for large villagers (princess/brute) so they glide over surface
        if (isPrincess || isBrute) {
            mesh.position.y += spriteHeight * 0.3; // Lower positioning for large sprites
        } else {
            mesh.position.y += villagerHeight * scale / 2; // Center for normal villagers
        }
        scene.add(mesh);

        // No separate head mesh for sprites
        headMesh = null;
    } else {
        // NORMAL MODE: Use 3D cone and sphere
        const color = isPrincess ? 0xff0000 : (isBrute ? 0x8b0000 : 0xadd8e6);
        const emissive = isPrincess ? 0xff0000 : (isBrute ? 0xff4500 : 0x4682b4);
        const emissiveIntensity = isPrincess ? 3.0 : (isBrute ? 1.5 : 0.1);

        const geometry = new THREE.ConeGeometry(villagerRadius * scale, villagerHeight * scale, 8);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            flatShading: true,
            emissive: emissive,
            emissiveIntensity: emissiveIntensity,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.position.y += villagerHeight * scale / 2;
        mesh.castShadow = true;
        scene.add(mesh);

        // Create head (pink sphere at tip of cone)
        const headGeometry = new THREE.SphereGeometry(headRadius, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffc0cb,
            roughness: 0.7,
        });
        headMesh = new THREE.Mesh(headGeometry, headMaterial);
        headMesh.position.copy(position);
        headMesh.position.y += villagerHeight / 2;
        headMesh.castShadow = true;
        scene.add(headMesh);
    }

    // Create health bar above villager - height (thickness) based on max health
    const healthBarWidth = scale * 1.2; // Consistent width
    const healthBarBaseHeight = 0.1; // Base height per HP
    const healthBarHeight = healthBarBaseHeight * (maxHealth / 2); // Height scales with HP (normalized to 2 HP baseline)
    const healthBarDepth = 0.05;

    // Background bar (dark gray)
    const bgBarGeometry = new THREE.BoxGeometry(healthBarWidth, healthBarHeight, healthBarDepth);
    const bgBarMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const bgBarMesh = new THREE.Mesh(bgBarGeometry, bgBarMaterial);
    bgBarMesh.position.copy(position);
    bgBarMesh.position.y += villagerHeight * scale + headRadius + 0.5; // Above head
    scene.add(bgBarMesh);

    // Health bar (green to red based on health)
    const healthBarGeometry = new THREE.BoxGeometry(healthBarWidth, healthBarHeight, healthBarDepth + 0.01);
    const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const healthBarMesh = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    healthBarMesh.position.copy(bgBarMesh.position);
    healthBarMesh.position.z += 0.01; // Slightly in front of background
    scene.add(healthBarMesh);

    // Physics - use cylinder for simpler collision with no bounce
    const shape = new CANNON.Cylinder(villagerRadius, villagerRadius, villagerHeight, 8);
    const body = new CANNON.Body({
        mass: 1,
        material: villagerMat,
        linearDamping: 0.5, // Moderate damping
        angularDamping: 0.99,
    });
    body.addShape(shape);
    body.position.copy(position);
    body.position.y += villagerHeight / 2;

    // Prevent tipping over and reduce bounce
    body.fixedRotation = true;
    body.updateMassProperties();

    world.addBody(body);

    // Set waypoints based on village
    const firstWaypoint = villageId === 1 ? waypoint1v1.clone() : waypoint1v2.clone();

    const villager = {
        mesh,
        headMesh,
        body,
        healthBarMesh,
        bgBarMesh,
        healthBarWidth,
        height: villagerHeight * scale,
        currentWaypoint: 0, // 0 = waypoint1, 1 = waypoint2, 2 = summit
        target: firstWaypoint, // Start heading to first waypoint
        speed: 1.5, // Same speed for everyone
        alive: true,
        isPrincess: isPrincess,
        isBrute: isBrute,
        villagerType: villagerType,
        health: maxHealth,
        maxHealth: maxHealth,
        villageId: villageId, // Track which village this villager belongs to
        performingRitual: false,
        ritualTime: 0,
        ritualDuration: 3.0, // 3 seconds
        ritualStartY: 0
    };

    villagers.push(villager);
    return villager;
}

// Create an ember (destroyed villager remains)
function createEmber(position) {
    const size = 0.3;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffaa00,
        emissiveIntensity: 2.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.set(Math.PI / 4, Math.PI / 4, 0); // Rotate 45 degrees
    mesh.castShadow = true;
    scene.add(mesh);

    embers.push({ mesh, age: 0 });
}

// Create particle effect
function createParticles(position, count, color, speed, lifetime, spreadAngle = Math.PI) {
    for (let i = 0; i < count; i++) {
        const size = 0.2 + Math.random() * 0.3;
        const geometry = new THREE.SphereGeometry(size, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        scene.add(mesh);

        // Random velocity within spread angle
        const angle = Math.random() * Math.PI * 2;
        const elevation = Math.random() * spreadAngle;
        const velocityMagnitude = speed * (0.5 + Math.random() * 0.5);

        const velocity = new THREE.Vector3(
            Math.cos(angle) * Math.sin(elevation) * velocityMagnitude,
            Math.cos(elevation) * velocityMagnitude,
            Math.sin(angle) * Math.sin(elevation) * velocityMagnitude
        );

        particles.push({
            mesh,
            velocity,
            age: 0,
            lifetime: lifetime,
            initialOpacity: 1.0
        });
    }
}

// Create steam particles (white, upward)
function createSteam(position) {
    createParticles(position, 15, 0xffffff, 3, 1.5, Math.PI / 4); // White, upward spray
}

// Create black smoke (dark gray/black with lighter highlights, upward)
function createBlackSmoke(position) {
    // Mix of dark and lighter gray particles for visual interest
    createParticles(position, 12, 0x222222, 2, 2.0, Math.PI / 3); // Dark gray
    createParticles(position, 8, 0x666666, 2.5, 1.8, Math.PI / 3); // Medium gray highlights
    createParticles(position, 5, 0x999999, 3, 1.5, Math.PI / 4); // Light gray highlights
}

// Create impact particles (orange/red, all directions)
function createImpactParticles(position) {
    createParticles(position, 10, 0xff6600, 5, 1.0, Math.PI); // Orange, explosive
}

// Create red explosion (princess ritual completion)
function createRedExplosion(position) {
    // Bright red spray in all directions
    createParticles(position, 30, 0xff0000, 8, 2.0, Math.PI); // Bright red, fast
    createParticles(position, 20, 0xff6666, 6, 1.8, Math.PI); // Light red
    createParticles(position, 15, 0xaa0000, 10, 1.5, Math.PI); // Dark red, very fast
}

// Create lava smoke trail (small black particles)
function createLavaSmoke(position) {
    // Small puffs of dark smoke
    const size = 0.1 + Math.random() * 0.2;
    const geometry = new THREE.SphereGeometry(size, 4, 4);
    const material = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    // Add slight random offset
    mesh.position.x += (Math.random() - 0.5) * 0.3;
    mesh.position.y += (Math.random() - 0.5) * 0.3;
    mesh.position.z += (Math.random() - 0.5) * 0.3;
    scene.add(mesh);

    // Very slow upward drift
    const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0.5, // Slowly rise
        (Math.random() - 0.5) * 0.2
    );

    particles.push({
        mesh,
        velocity,
        age: 0,
        lifetime: 1.0, // Fade out in 1 second
        initialOpacity: 0.8
    });
}

// Create wood splinters (tree destruction)
function createWoodSplinters(position) {
    const splinterCount = 20;
    for (let i = 0; i < splinterCount; i++) {
        // Thin rectangular splinters
        const length = 0.3 + Math.random() * 0.5;
        const width = 0.05 + Math.random() * 0.05;
        const geometry = new THREE.BoxGeometry(width, length, width);
        const material = new THREE.MeshBasicMaterial({
            color: 0x8b4513, // Brown
            transparent: true,
            opacity: 1.0,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);

        // Random rotation for variety
        mesh.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        scene.add(mesh);

        // Explosive outward velocity
        const angle = Math.random() * Math.PI * 2;
        const elevation = Math.random() * Math.PI / 3; // Up to 60 degrees up
        const speed = 5 + Math.random() * 5;

        const velocity = new THREE.Vector3(
            Math.cos(angle) * Math.sin(elevation) * speed,
            Math.cos(elevation) * speed,
            Math.sin(angle) * Math.sin(elevation) * speed
        );

        particles.push({
            mesh,
            velocity,
            age: 0,
            lifetime: 1.5, // Splinters last 1.5 seconds
            initialOpacity: 1.0
        });
    }
}

// Explode a bomb with blast radius
function explodeBomb(obj) {
    const blastRadius = 10.0; // Large blast area
    const explosionPos = obj.body.position;

    // Create massive explosion particles (red/orange/yellow)
    createParticles(explosionPos, 40, 0xff6600, 12, 1.5, Math.PI); // Orange
    createParticles(explosionPos, 30, 0xff0000, 10, 1.3, Math.PI); // Red
    createParticles(explosionPos, 20, 0xffff00, 15, 1.2, Math.PI); // Yellow

    // Remove the bomb itself
    scene.remove(obj.mesh);
    world.removeBody(obj.body);
    const bombIndex = physicsObjects.indexOf(obj);
    if (bombIndex > -1) physicsObjects.splice(bombIndex, 1);

    // Destroy trees within blast radius
    for (let i = trees.length - 1; i >= 0; i--) {
        const tree = trees[i];
        const distance = Math.sqrt(
            Math.pow(explosionPos.x - tree.position.x, 2) +
            Math.pow(explosionPos.y - tree.position.y, 2) +
            Math.pow(explosionPos.z - tree.position.z, 2)
        );

        if (distance < blastRadius) {
            // Create wood splinters at tree position
            createWoodSplinters(tree.position);

            // Remove tree visual elements
            scene.remove(tree.trunk);
            scene.remove(tree.frondGroup);

            // Remove tree physics body
            world.removeBody(tree.body);

            // Remove from trees array
            trees.splice(i, 1);
        }
    }

    // Damage villagers within blast radius (2 damage from bomb)
    for (let i = villagers.length - 1; i >= 0; i--) {
        const villager = villagers[i];
        if (!villager.alive) continue;

        const distance = Math.sqrt(
            Math.pow(explosionPos.x - villager.body.position.x, 2) +
            Math.pow(explosionPos.y - villager.body.position.y, 2) +
            Math.pow(explosionPos.z - villager.body.position.z, 2)
        );

        if (distance < blastRadius) {
            // Deal 2 damage from bomb explosion
            const died = damageVillager(villager, 2);

            // Remove from array if dead
            if (died) {
                villagers.splice(i, 1);
            }
        }
    }
}

// Damage a villager and handle death if health reaches 0
function damageVillager(villager, damage = 1) {
    villager.health -= damage;

    // Visual feedback - flash the villager brighter when hit
    const originalEmissiveIntensity = villager.mesh.material.emissiveIntensity;
    villager.mesh.material.emissiveIntensity = 5.0; // Flash bright

    setTimeout(() => {
        if (villager.mesh && villager.mesh.material) {
            villager.mesh.material.emissiveIntensity = originalEmissiveIntensity;
        }
    }, 100);

    // Update health bar
    if (villager.health > 0) {
        const healthPercent = villager.health / villager.maxHealth;

        // Scale the health bar (scales from center)
        villager.healthBarMesh.scale.set(healthPercent, 1, 1);

        // Change color from green to yellow to red based on health
        if (healthPercent > 0.6) {
            villager.healthBarMesh.material.color.setHex(0x00ff00); // Green
        } else if (healthPercent > 0.3) {
            villager.healthBarMesh.material.color.setHex(0xffff00); // Yellow
        } else {
            villager.healthBarMesh.material.color.setHex(0xff0000); // Red
        }
    }

    // Check if villager is dead
    if (villager.health <= 0) {
        villager.alive = false;

        // Increment kill count
        gameState.villagerKillCount++;

        // Create black smoke at villager position
        createBlackSmoke(villager.body.position);

        // Remove villager
        scene.remove(villager.mesh);
        if (villager.headMesh) scene.remove(villager.headMesh);
        scene.remove(villager.healthBarMesh);
        scene.remove(villager.bgBarMesh);
        world.removeBody(villager.body);

        // Create ember at villager position
        createEmber(villager.body.position);

        return true; // Villager died
    }

    return false; // Villager still alive
}

// Spawn a group of villagers from a specific village
function spawnVillagerGroup(villageId = 1) {
    if (gameState.gameOver || !gameState.started) {
        return;
    }

    const villagePos = villageId === 1 ? village1.position : village2.position;
    const groupSize = 3 + Math.floor(Math.random() * 3); // 3-5 villagers

    for (let i = 0; i < groupSize; i++) {
        // Princess spawns at center (i = middle index), normal villagers around her
        const middleIndex = Math.floor(groupSize / 2);
        const isPrincess = (i === middleIndex);

        // 30% chance for a non-princess villager to be a brute
        const isBrute = !isPrincess && Math.random() < 0.3;

        // Calculate offset - princess at center (0), others spread around
        let offset;
        if (isPrincess) {
            offset = 0; // Princess at center
        } else if (i < middleIndex) {
            offset = (i - middleIndex) * 0.8; // Left side
        } else {
            offset = (i - middleIndex) * 0.8; // Right side
        }

        // Calculate proper height on volcano surface at this X,Z position
        const spawnX = villagePos.x + offset;
        const spawnZ = villagePos.z;
        const distanceFromCenter = Math.sqrt(spawnX * spawnX + spawnZ * spawnZ);
        const heightRatio = Math.max(0, Math.min(1, 1 - (distanceFromCenter / volcanoRadius)));
        const surfaceHeight = volcanoHeight * heightRatio;

        const spawnPos = new THREE.Vector3(
            spawnX,
            surfaceHeight + 3, // Spawn 3 units ABOVE the surface
            spawnZ
        );

        const winHeight = volcanoHeight * 0.9;

        // Safety check - don't spawn above win height!
        if (spawnPos.y >= winHeight) {
            spawnPos.y = winHeight - 5;
        }

        createVillager(spawnPos, isPrincess, villageId, isBrute);
    }
}

// Create a boulder
function createBoulder(position, velocity) {
    const radius = 0.5;
    const geometry = new THREE.SphereGeometry(radius, 16, 16);

    // Add vertex colors for flecks
    const colors = [];
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const rand = Math.random();
        if (rand < 0.15) {
            // Black flecks (15% chance)
            colors.push(0.1, 0.05, 0.0);
        } else if (rand < 0.3) {
            // Yellow flecks (15% chance)
            colors.push(1.0, 0.9, 0.2);
        } else {
            // Orange-red base (70%)
            colors.push(1.0, 0.5 + Math.random() * 0.2, 0.0);
        }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, // White base to let vertex colors show through
        emissive: 0xff4400,
        emissiveIntensity: 1.5,
        vertexColors: true,
        roughness: 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    // Physics
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
        mass: 5,
        material: lavaMat,
        linearDamping: 0.5, // Slow down quickly
        angularDamping: 0.5,
    });
    body.addShape(shape);
    body.position.copy(position);
    body.velocity.copy(velocity);
    world.addBody(body);

    const obj = { mesh, body, type: 'boulder', age: 0, hasCollided: false, isHot: true };

    // Track collisions for this object
    body.addEventListener('collide', (e) => {
        obj.hasCollided = true;
    });

    physicsObjects.push(obj);
}

// Create spray particles
function createSpray(position, velocity) {
    const particleCount = 20;
    const spread = 0.3;

    for (let i = 0; i < particleCount; i++) {
        const radius = 0.15;
        const geometry = new THREE.SphereGeometry(radius, 8, 8);

        // Add vertex colors for flecks
        const colors = [];
        const positions = geometry.attributes.position;
        for (let j = 0; j < positions.count; j++) {
            const rand = Math.random();
            if (rand < 0.15) {
                // Black flecks (15% chance)
                colors.push(0.1, 0.05, 0.0);
            } else if (rand < 0.3) {
                // Yellow flecks (15% chance)
                colors.push(1.0, 0.9, 0.2);
            } else {
                // Orange-red base (70%)
                colors.push(1.0, 0.6 + Math.random() * 0.2, 0.0);
            }
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff, // White base to let vertex colors show through
            emissive: 0xff6600,
            emissiveIntensity: 1.2,
            vertexColors: true,
            roughness: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.castShadow = true;
        scene.add(mesh);

        // Add random spread to velocity
        const particleVelocity = new CANNON.Vec3(
            velocity.x + (Math.random() - 0.5) * spread * 20,
            velocity.y + (Math.random() - 0.5) * spread * 10,
            velocity.z + (Math.random() - 0.5) * spread * 20
        );

        // Physics
        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({
            mass: 0.2,
            material: lavaMat,
            linearDamping: 0.6, // Spray slows down faster
            angularDamping: 0.6,
        });
        body.addShape(shape);
        body.position.copy(position);
        body.velocity.copy(particleVelocity);
        world.addBody(body);

        const obj = { mesh, body, type: 'spray', age: 0, hasCollided: false, isHot: true };

        // Track collisions for this object
        body.addEventListener('collide', (e) => {
            obj.hasCollided = true;
        });

        physicsObjects.push(obj);
    }
}

// Create a bomb (large explosive projectile)
function createBomb(position, velocity) {
    const radius = 0.8; // Larger than boulder
    const geometry = new THREE.SphereGeometry(radius, 16, 16);

    // Dark gray/black with some lighter spots
    const material = new THREE.MeshStandardMaterial({
        color: 0x333333, // Dark gray
        emissive: 0xff0000, // Red glow (danger)
        emissiveIntensity: 0.8,
        roughness: 0.6,
        metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    // Physics
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
        mass: 10, // Heavier than boulder
        material: lavaMat,
        linearDamping: 0.3,
        angularDamping: 0.3,
    });
    body.addShape(shape);
    body.position.copy(position);
    body.velocity.copy(velocity);
    world.addBody(body);

    const obj = { mesh, body, type: 'bomb', age: 0, hasCollided: false, isHot: true };

    // Track collisions for this object
    body.addEventListener('collide', (e) => {
        obj.hasCollided = true;
    });

    physicsObjects.push(obj);
}

// Fire lava based on current type
function fireLava() {
    // Check if we have enough lava
    const cost = gameState.lavaType === 'bomb' ? gameState.lavaMax * 0.5 : // 50% of total reserves
                 gameState.lavaType === 'boulder' ? 10 :
                 gameState.lavaType === 'spray' ? 5 : 20;

    if (gameState.lavaAmount < cost) return;

    gameState.lavaAmount -= cost;

    // Calculate firing position and velocity from camera
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const spawnDistance = 2;
    const position = new CANNON.Vec3(
        camera.position.x + direction.x * spawnDistance,
        camera.position.y + direction.y * spawnDistance,
        camera.position.z + direction.z * spawnDistance
    );

    const power = 30; // Increased power to reach farther targets
    const velocity = new CANNON.Vec3(
        direction.x * power,
        direction.y * power * 0.7, // Reduce upward component for faster drop
        direction.z * power
    );

    // Fire based on type
    if (gameState.lavaType === 'bomb') {
        createBomb(position, velocity);
    } else if (gameState.lavaType === 'boulder') {
        createBoulder(position, velocity);
    } else if (gameState.lavaType === 'spray') {
        createSpray(position, velocity);
    }
}

// Change lava type
function changeLavaType(direction) {
    const currentIndex = lavaTypes.indexOf(gameState.lavaType);
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = lavaTypes.length - 1;
    if (newIndex >= lavaTypes.length) newIndex = 0;
    gameState.lavaType = lavaTypes[newIndex];
    updateUI();
}

// Update UI
function updateUI() {
    document.getElementById('lava-type').textContent =
        gameState.lavaType.charAt(0).toUpperCase() + gameState.lavaType.slice(1);
    document.getElementById('lava-amount').textContent =
        Math.floor(gameState.lavaAmount);
    document.getElementById('villager-count').textContent = villagers.length;
    document.getElementById('kill-count').textContent = gameState.villagerKillCount;
    document.getElementById('highest-elevation').textContent =
        Math.floor(gameState.highestVillagerElevation * 100);

    // Update lava resource bar
    const lavaPercentage = (gameState.lavaAmount / gameState.lavaMax) * 100;
    const lavaBarFill = document.getElementById('lava-bar-fill');
    if (lavaBarFill) {
        lavaBarFill.style.width = lavaPercentage + '%';
    }

    // Update cost indicator
    const cost = gameState.lavaType === 'bomb' ? gameState.lavaMax * 0.5 :
                 gameState.lavaType === 'boulder' ? 10 :
                 gameState.lavaType === 'spray' ? 5 : 20;
    const afterFireAmount = Math.max(0, gameState.lavaAmount - cost);
    const afterFirePercentage = (afterFireAmount / gameState.lavaMax) * 100;
    const costIndicator = document.getElementById('lava-bar-cost-indicator');
    if (costIndicator) {
        costIndicator.style.left = afterFirePercentage + '%';
    }

    // Update weapon icon
    const weaponIcon = document.getElementById('weapon-icon');
    if (weaponIcon) {
        const iconMap = {
            'boulder': '🪨',
            'bomb': '💣',
            'spray': '💦'
        };
        weaponIcon.textContent = iconMap[gameState.lavaType] || '🪨';
    }

    // Update switch button on mobile
    if (isMobile) {
        const switchButton = document.getElementById('switch-button');
        if (switchButton) {
            const typeShort = gameState.lavaType.charAt(0).toUpperCase() + gameState.lavaType.slice(1, 4).toUpperCase();
            switchButton.textContent = typeShort;
        }
    }
}

// Game over function
function triggerGameOver() {
    gameState.gameOver = true;

    // Release pointer lock so user can click buttons
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    gameState.isPointerLocked = false;

    // Show game over screen
    const gameOverDiv = document.createElement('div');
    gameOverDiv.id = 'game-over';
    gameOverDiv.style.position = 'absolute';
    gameOverDiv.style.top = '50%';
    gameOverDiv.style.left = '50%';
    gameOverDiv.style.transform = 'translate(-50%, -50%)';
    gameOverDiv.style.background = 'rgba(0, 0, 0, 0.9)';
    gameOverDiv.style.color = 'white';
    gameOverDiv.style.padding = '40px';
    gameOverDiv.style.borderRadius = '10px';
    gameOverDiv.style.textAlign = 'center';
    gameOverDiv.style.fontSize = '24px';
    gameOverDiv.style.zIndex = '2000'; // Higher than everything else

    gameOverDiv.innerHTML = `
        <h1 style="color: #ff1493; margin-bottom: 20px;">GAME OVER</h1>
        <p style="margin-bottom: 10px;">The Princess reached the top!</p>
        <p style="margin-bottom: 30px; font-size: 32px; color: #ffaa00;">Villagers Killed: ${gameState.villagerKillCount}</p>
        <button id="restart-btn" style="
            padding: 15px 30px;
            font-size: 20px;
            background: #ff1493;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        ">Play Again</button>
        <button id="gameover-settings-btn" style="
            padding: 15px 30px;
            font-size: 20px;
            background: #666666;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-left: 20px;
        ">Settings</button>
    `;

    document.body.appendChild(gameOverDiv);

    const restartBtn = document.getElementById('restart-btn');

    // Add both click and touch event listeners
    const restartGame = () => {
        location.reload(); // Simple restart - reload the page
    };

    restartBtn.addEventListener('click', restartGame);
    restartBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        restartGame();
    });

    // Make sure buttons are clickable
    restartBtn.style.pointerEvents = 'auto';
    restartBtn.style.cursor = 'pointer';
    restartBtn.focus();

    // Settings button on game over screen
    const gameoverSettingsBtn = document.getElementById('gameover-settings-btn');
    const openGameOverSettings = () => {
        gameOverDiv.style.display = 'none';
        document.getElementById('settings-screen').style.display = 'block';
        settingsReturnScreen = 'game-over';
        // Sync checkbox states with current settings
        document.getElementById('invert-y-toggle').checked = gameState.invertMouseY;
        document.getElementById('cutie-patootie-toggle').checked = gameState.cutiePatootieMode;
    };
    if (gameoverSettingsBtn) {
        gameoverSettingsBtn.addEventListener('click', openGameOverSettings);
        gameoverSettingsBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            openGameOverSettings();
        });
        gameoverSettingsBtn.style.pointerEvents = 'auto';
        gameoverSettingsBtn.style.cursor = 'pointer';
    }
}

// Function to start the game
function startGame() {
    gameState.started = true;
    document.getElementById('start-screen').style.display = 'none';

    // Start spawning villagers from both villages
    const currentTime = clock.getElapsedTime();
    lastSpawnTimeV1 = currentTime;
    lastSpawnTimeV2 = currentTime;
    spawnVillagerGroup(1);
    spawnVillagerGroup(2);

    // On desktop, show controls for first 10 seconds on first game
    if (!isMobile) {
        const hasPlayedBefore = localStorage.getItem('volcano-god-played');

        if (!hasPlayedBefore) {
            // First time playing - show controls for 10 seconds
            const controlsDiv = document.getElementById('controls');
            controlsDiv.style.display = 'block';

            // Trigger fade-in after a tiny delay to ensure display:block takes effect
            setTimeout(() => {
                controlsDiv.style.opacity = '1';
            }, 50);

            setTimeout(() => {
                controlsDiv.style.opacity = '0';
                setTimeout(() => {
                    controlsDiv.style.display = 'none';
                }, 1000); // Wait for fade to complete
            }, 10000); // Show for 10 seconds

            // Mark as played
            localStorage.setItem('volcano-god-played', 'true');
        }
    }
}

// Keyboard input
document.addEventListener('keydown', (e) => {
    // Start game with spacebar if not started
    if (e.code === 'Space' && !gameState.started && !gameState.gameOver) {
        startGame();
        e.preventDefault();
        return;
    }

    // Pause/Resume with Enter key
    if (e.code === 'Enter' && gameState.started && !gameState.gameOver) {
        gameState.paused = !gameState.paused;
        const pauseScreen = document.getElementById('pause-screen');
        if (gameState.paused) {
            pauseScreen.style.display = 'block';
            // Release pointer lock when pausing
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        } else {
            pauseScreen.style.display = 'none';

            // Reset camera to spawn point when exiting pause
            if (gameState.freeFlying) {
                // Exit free flying mode
                gameState.freeFlying = false;
                const btn = document.getElementById('free-flying-btn');
                btn.style.background = '#4169e1'; // Blue when inactive
                btn.textContent = 'Toggle Free Flying Mode';
            }

            // Reset camera to original spawn position
            camera.position.set(0, cameraHeight, cameraRadius);

            // Reset mouse look
            mouseX = 0;
            mouseY = 0;

            // Reset rotation
            gameState.rotation = 0;
        }
        e.preventDefault();
        return;
    }

    // Handle keys differently based on mode
    if (gameState.freeFlying) {
        // Free-flying mode: WASD for movement
        if (e.code === 'KeyW') input.forward = true;
        if (e.code === 'KeyS') input.backward = true;
        if (e.code === 'KeyA') input.left = true;
        if (e.code === 'KeyD') input.right = true;
    } else {
        // Normal mode: A/D for rotation
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.rotateLeft = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') input.rotateRight = true;
        if (e.code === 'Space') {
            input.fire = true;
            e.preventDefault();
        }
        if (e.code === 'KeyQ') changeLavaType(-1);
        if (e.code === 'KeyE') changeLavaType(1);
    }
});

document.addEventListener('keyup', (e) => {
    if (gameState.freeFlying) {
        // Free-flying mode
        if (e.code === 'KeyW') input.forward = false;
        if (e.code === 'KeyS') input.backward = false;
        if (e.code === 'KeyA') input.left = false;
        if (e.code === 'KeyD') input.right = false;
    } else {
        // Normal mode
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.rotateLeft = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') input.rotateRight = false;
        if (e.code === 'Space') input.fire = false;
    }
});

// Mouse input for firing
document.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.fire = true;
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
});

// Pointer lock for mouse look (desktop only)
if (!isMobile) {
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        gameState.isPointerLocked = document.pointerLockElement === renderer.domElement;
    });
}

// Mouse look
let mouseX = 0;
let mouseY = 0;
const lookSensitivity = 0.002;

document.addEventListener('mousemove', (e) => {
    // On desktop, require pointer lock. On mobile, this won't be used anyway.
    if (isMobile || gameState.isPointerLocked) {
        mouseX += e.movementX * lookSensitivity;
        const yMultiplier = gameState.invertMouseY ? -1 : 1;
        mouseY += e.movementY * lookSensitivity * yMultiplier;

        // Clamp vertical look
        mouseY = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, mouseY));
    }
});

// Touch controls for camera aiming (multi-touch support)
let cameraTrackingTouchId = null;
let lastTouchX = 0;
let lastTouchY = 0;

document.addEventListener('touchstart', (e) => {
    // Find a touch that's not on a UI button
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // Skip if this touch is on a button
        if (target && target.classList.contains('mobile-button')) {
            continue;
        }

        // Use this touch for camera tracking if we don't have one yet
        if (cameraTrackingTouchId === null) {
            cameraTrackingTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            e.preventDefault();
            break;
        }
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (cameraTrackingTouchId === null) return;

    // Find our tracking touch
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === cameraTrackingTouchId) {
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;

            // Apply touch movement to camera
            const touchSensitivity = 0.005;
            mouseX += deltaX * touchSensitivity;
            const yMultiplier = gameState.invertMouseY ? -1 : 1;
            mouseY += deltaY * touchSensitivity * yMultiplier;

            // Clamp vertical look
            mouseY = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, mouseY));

            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            e.preventDefault();
            break;
        }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    // Check if our tracking touch ended
    if (cameraTrackingTouchId !== null) {
        let stillTouching = false;
        for (let i = 0; i < e.touches.length; i++) {
            if (e.touches[i].identifier === cameraTrackingTouchId) {
                stillTouching = true;
                break;
            }
        }
        if (!stillTouching) {
            cameraTrackingTouchId = null;
        }
    }
});

document.addEventListener('touchcancel', (e) => {
    cameraTrackingTouchId = null;
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handle orientation change on mobile
if (isMobile) {
    window.addEventListener('orientationchange', () => {
        // Wait for orientation change to complete
        setTimeout(() => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, 100);
    });

    // Also listen to screen orientation API if available
    if (screen.orientation) {
        screen.orientation.addEventListener('change', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
}

// Free-flying mode button
const freeFlyingBtn = document.getElementById('free-flying-btn');
const toggleFreeFlying = () => {
    gameState.freeFlying = !gameState.freeFlying;
    const btn = document.getElementById('free-flying-btn');
    if (gameState.freeFlying) {
        btn.style.background = '#00cc00'; // Green when active
        btn.textContent = 'Exit Free Flying Mode';
    } else {
        btn.style.background = '#4169e1'; // Blue when inactive
        btn.textContent = 'Toggle Free Flying Mode';
        // Reset camera rotation when exiting free-flying
        mouseX = 0;
        mouseY = 0;
    }
};
freeFlyingBtn.addEventListener('click', toggleFreeFlying);
freeFlyingBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleFreeFlying();
});

// Track where settings was opened from
let settingsReturnScreen = 'pause-screen';

// Settings button
const settingsBtn = document.getElementById('settings-btn');
const openSettings = () => {
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('settings-screen').style.display = 'block';
    settingsReturnScreen = 'pause-screen';
    // Sync checkbox states with current settings
    document.getElementById('invert-y-toggle').checked = gameState.invertMouseY;
    document.getElementById('cutie-patootie-toggle').checked = gameState.cutiePatootieMode;
};
settingsBtn.addEventListener('click', openSettings);
settingsBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    openSettings();
});

// Settings back button
const settingsBackBtn = document.getElementById('settings-back-btn');
const closeSettings = () => {
    document.getElementById('settings-screen').style.display = 'none';
    // Return to whichever screen opened settings (pause or game over)
    if (settingsReturnScreen === 'game-over') {
        const gameOverDiv = document.getElementById('game-over');
        if (gameOverDiv) {
            gameOverDiv.style.display = 'block';
        }
    } else {
        document.getElementById('pause-screen').style.display = 'block';
    }
};
settingsBackBtn.addEventListener('click', closeSettings);
settingsBackBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    closeSettings();
});

// Invert Y-axis toggle
document.getElementById('invert-y-toggle').addEventListener('change', (e) => {
    gameState.invertMouseY = e.target.checked;
});

// Cutie Patootie Mode toggle (settings screen)
document.getElementById('cutie-patootie-toggle').addEventListener('change', (e) => {
    gameState.cutiePatootieMode = e.target.checked;
    localStorage.setItem('volcano-god-cutie-mode', e.target.checked);

    // Also sync the start screen checkbox
    const startToggle = document.getElementById('start-cutie-patootie-toggle');
    if (startToggle) {
        startToggle.checked = e.target.checked;
    }
});

// Start screen Cutie Patootie Mode toggle
document.getElementById('start-cutie-patootie-toggle').addEventListener('change', (e) => {
    gameState.cutiePatootieMode = e.target.checked;
    localStorage.setItem('volcano-god-cutie-mode', e.target.checked);

    // Also sync the settings screen checkbox if user opens it later
    document.getElementById('cutie-patootie-toggle').checked = e.target.checked;
});

// Show Controls button
const showControlsBtn = document.getElementById('show-controls-btn');
const showControls = () => {
    const controlsDiv = document.getElementById('controls');
    controlsDiv.style.display = 'block';

    // Trigger fade-in after a tiny delay to ensure display:block takes effect
    setTimeout(() => {
        controlsDiv.style.opacity = '1';
    }, 50);

    // Auto-hide after 10 seconds
    setTimeout(() => {
        controlsDiv.style.opacity = '0';
        setTimeout(() => {
            controlsDiv.style.display = 'none';
        }, 1000); // Wait for fade to complete
    }, 10000);
};
showControlsBtn.addEventListener('click', showControls);
showControlsBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    showControls();
});

// Show/hide UI elements based on device type
if (isMobile) {
    // Mobile: don't invert vertical controls
    gameState.invertMouseY = false;

    // Show mobile controls
    document.getElementById('fire-button').style.display = 'flex';
    document.getElementById('switch-button').style.display = 'flex';
    document.getElementById('pause-button').style.display = 'flex';

    // Hide desktop controls
    document.getElementById('controls').style.display = 'none';

    // Hide free flying button in pause menu
    document.getElementById('free-flying-btn').style.display = 'none';

    // Hide Show Controls button on mobile (controls are for desktop only)
    document.getElementById('show-controls-btn').style.display = 'none';

    // Mobile button event handlers
    const fireButton = document.getElementById('fire-button');
    const switchButton = document.getElementById('switch-button');
    const pauseButton = document.getElementById('pause-button');

    // Fire button - hold to fire
    fireButton.addEventListener('touchstart', (e) => {
        input.fire = true;
        e.preventDefault();
    });
    fireButton.addEventListener('touchend', (e) => {
        input.fire = false;
        e.preventDefault();
    });

    // Switch button - tap to cycle lava type
    switchButton.addEventListener('touchstart', (e) => {
        changeLavaType(1);
        e.preventDefault();
    });

    // Pause button - tap to toggle pause
    pauseButton.addEventListener('touchstart', (e) => {
        if (gameState.started && !gameState.gameOver) {
            gameState.paused = !gameState.paused;
            const pauseScreen = document.getElementById('pause-screen');
            if (gameState.paused) {
                pauseScreen.style.display = 'block';
                // Release pointer lock when pausing
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            } else {
                pauseScreen.style.display = 'none';
            }
        }
        e.preventDefault();
    });

    // Start game with touch on start screen
    document.getElementById('start-screen').addEventListener('touchstart', (e) => {
        if (!gameState.started && !gameState.gameOver) {
            startGame();
        }
        e.preventDefault();
    });

    // Update start screen text for mobile
    const startScreen = document.getElementById('start-screen');
    const startText = startScreen.querySelector('p:last-child');
    startText.textContent = 'Tap to Start';
    startText.style.fontSize = '32px';

    // Update pause screen text for mobile
    const pauseScreen = document.getElementById('pause-screen');
    const pauseText = pauseScreen.querySelector('p');
    pauseText.textContent = 'Tap || to Resume';
    pauseText.style.fontSize = '24px';
} else {
    // Desktop: invert vertical controls by default
    gameState.invertMouseY = true;

    // Hide mobile controls on desktop
    document.getElementById('fire-button').style.display = 'none';
    document.getElementById('switch-button').style.display = 'none';
    document.getElementById('pause-button').style.display = 'none';
}

// Fire rate limiting
let lastFireTime = 0;
const fireRate = 200; // milliseconds between shots

// Solidify lava when it stops moving or hits something collidable
function solidifyLava(obj, hitCollidable = false) {
    // If hit something collidable, sink into ground and turn black
    if (hitCollidable) {
        const surfaceHeight = getIslandSurfaceHeight(obj.body.position.x, obj.body.position.z);
        const lavaRadius = obj.type === 'boulder' ? 0.5 : 0.15; // Radius of lava sphere

        // Set center to surface level, then move up by 100% (one full radius)
        obj.body.position.y = surfaceHeight + lavaRadius;
        obj.mesh.position.copy(obj.body.position);

        // Turn completely black (cooled)
        obj.mesh.material = obj.mesh.material.clone(); // Clone material to avoid affecting other objects
        obj.mesh.material.color.setHex(0x1a1a1a); // Very dark gray (not pure black, so it's still visible)
        obj.mesh.material.emissive.setHex(0x000000); // No glow
        obj.mesh.material.emissiveIntensity = 0;
        obj.mesh.material.needsUpdate = true;
    } else {
        // Normal solidification - impact particles and dark gray
        createImpactParticles(obj.body.position);

        // Change to dark gray
        obj.mesh.material = obj.mesh.material.clone(); // Clone material
        obj.mesh.material.color.setHex(0x3a3a3a); // Dark gray
        obj.mesh.material.emissive.setHex(0x000000); // No glow
        obj.mesh.material.emissiveIntensity = 0;
        obj.mesh.material.needsUpdate = true;
    }

    obj.isHot = false; // No longer dangerous to villagers

    // Remove from physics world and active lava
    world.removeBody(obj.body);
    const index = physicsObjects.indexOf(obj);
    if (index > -1) physicsObjects.splice(index, 1);

    // Re-add as static collidable body
    const staticBody = new CANNON.Body({
        mass: 0,
        material: lavaMat, // Use lava material so other lava can collide with it
    });
    staticBody.addShape(obj.body.shapes[0]);
    staticBody.position.copy(obj.body.position);
    world.addBody(staticBody);

    // Keep in scene as solidified terrain
    solidifiedLava.push({ mesh: obj.mesh, body: staticBody });
}

// Remove lava that falls too far or goes out of bounds
function cleanupOutOfBoundsLava(obj, hitWater = false) {
    // Create steam particles if hit water
    if (hitWater) {
        createSteam(obj.body.position);
    }

    scene.remove(obj.mesh);
    world.removeBody(obj.body);
    const index = physicsObjects.indexOf(obj);
    if (index > -1) physicsObjects.splice(index, 1);
}

// Villager spawning
let lastSpawnTimeV1 = 0;
let lastSpawnTimeV2 = 0;
const spawnInterval = 10; // seconds

// Caldera smoke
let lastCalderaSmokeTime = 0;
const calderaSmokeInterval = 0.3; // Spawn smoke every 0.3 seconds

// Animation loop
const clock = new THREE.Clock();
let lastTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const currentTime = clock.getElapsedTime();
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // Update physics and game logic only if not paused
    if (!gameState.paused) {
        // Update physics
        world.step(1 / 60, deltaTime, 3);

    // Sync physics objects with Three.js and check for solidification
    for (let i = physicsObjects.length - 1; i >= 0; i--) {
        const obj = physicsObjects[i];
        obj.mesh.position.copy(obj.body.position);
        obj.mesh.quaternion.copy(obj.body.quaternion);

        // Track age
        obj.age += deltaTime;

        // Emit smoke trail for hot lava (but not too frequently)
        if (obj.isHot && Math.random() < 0.15) { // 15% chance each frame
            createLavaSmoke(obj.body.position);
        }

        // Check for collision with trees
        let hitCollidable = false;
        for (let j = 0; j < trees.length; j++) {
            const tree = trees[j];
            const distance = obj.body.position.distanceTo(tree.body.position);
            if (distance < 2.0) { // Within collision range
                hitCollidable = true;
                break;
            }
        }

        // Check for collision with solidified lava
        if (!hitCollidable) {
            for (let j = 0; j < solidifiedLava.length; j++) {
                const solidLava = solidifiedLava[j];
                const dx = obj.body.position.x - solidLava.body.position.x;
                const dy = obj.body.position.y - solidLava.body.position.y;
                const dz = obj.body.position.z - solidLava.body.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance < 1.5) { // Within collision range
                    hitCollidable = true;
                    break;
                }
            }
        }

        // Check if bomb should explode
        if (obj.type === 'bomb' && (obj.hasCollided || hitCollidable)) {
            explodeBomb(obj);
            continue; // Skip the rest of the loop for this object
        }

        // Check if lava should solidify
        const velocity = obj.body.velocity.length();
        const shouldSolidify = (velocity < 0.3 && obj.hasCollided && obj.age > 0.3) || obj.age > 10 || hitCollidable;

        // Check if lava has fallen too far or is out of bounds
        const yPos = obj.body.position.y;
        const xPos = obj.body.position.x;
        const zPos = obj.body.position.z;
        const distanceFromCenter = Math.sqrt(xPos * xPos + zPos * zPos);

        // Hit water if outside volcano radius and near/below water level
        const outsideVolcano = distanceFromCenter > volcanoRadius;
        const hitWater = outsideVolcano && yPos <= 2; // Near or below water
        const isOutOfBounds = yPos < -50 || yPos > 100; // Remove if too far down or too far up

        if (hitWater) {
            cleanupOutOfBoundsLava(obj, true); // Hit water - create steam
        } else if (isOutOfBounds) {
            cleanupOutOfBoundsLava(obj, false); // Out of bounds - no steam
        } else if (shouldSolidify) {
            solidifyLava(obj, hitCollidable);
        }
    }

    // Update and remove old embers
    for (let i = embers.length - 1; i >= 0; i--) {
        const ember = embers[i];
        ember.age += deltaTime;

        // Remove embers after 5 seconds
        if (ember.age > 5.0) {
            scene.remove(ember.mesh);
            embers.splice(i, 1);
        }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.age += deltaTime;

        // Update position
        particle.mesh.position.x += particle.velocity.x * deltaTime;
        particle.mesh.position.y += particle.velocity.y * deltaTime;
        particle.mesh.position.z += particle.velocity.z * deltaTime;

        // Special handling for caldera smoke
        if (particle.isCalderaSmoke) {
            // Cap the height so smoke doesn't obscure camera
            if (particle.mesh.position.y > particle.maxHeight) {
                particle.mesh.position.y = particle.maxHeight;
                particle.velocity.y = 0; // Stop rising
            }
            // No gravity for smoke - it just drifts
        } else {
            // Apply gravity to other particles (impact effects, etc.)
            particle.velocity.y -= 9.8 * deltaTime;
        }

        // Fade out over lifetime
        const lifeRatio = particle.age / particle.lifetime;
        particle.mesh.material.opacity = particle.initialOpacity * (1 - lifeRatio);

        // Remove old particles
        if (particle.age > particle.lifetime) {
            scene.remove(particle.mesh);
            particles.splice(i, 1);
        }
    }

    // Update villagers (only if game started)
    if (gameState.started) {
        for (let i = villagers.length - 1; i >= 0; i--) {
            const villager = villagers[i];
            if (!villager.alive) continue;

        // Sync visual with physics
        villager.mesh.position.copy(villager.body.position);

        if (gameState.cutiePatootieMode && villager.mesh.isSprite) {
            // SPRITE MODE: Handle sprite flipping based on movement direction relative to camera
            // Position sprites based on their type
            if (villager.isPrincess || villager.isBrute) {
                // Position large sprites to glide over surface (not too low)
                const spriteHeight = villager.height * 0.6; // Matches the sizeAdjust
                villager.mesh.position.y = villager.body.position.y - villager.height / 2 + spriteHeight * 0.5;
            } else {
                // Center for normal villagers
                villager.mesh.position.y = villager.body.position.y;
            }

            // Calculate movement direction
            const velocity = villager.body.velocity;
            if (velocity.x !== 0 || velocity.z !== 0) {
                // Get camera's right vector (local X axis)
                const cameraRight = new THREE.Vector3();
                camera.getWorldDirection(cameraRight);
                cameraRight.cross(new THREE.Vector3(0, 1, 0)); // Cross with up to get right
                cameraRight.normalize();

                // Project velocity onto camera's right vector
                const movementVector = new THREE.Vector2(velocity.x, velocity.z);
                const cameraRightVector = new THREE.Vector2(cameraRight.x, cameraRight.z);
                const dotProduct = movementVector.dot(cameraRightVector);

                // Flip sprite if moving right relative to camera
                if (dotProduct > 0) {
                    villager.mesh.material.map.repeat.x = -1; // Mirror horizontally
                    villager.mesh.material.map.offset.x = 1; // Adjust offset for mirroring
                } else {
                    villager.mesh.material.map.repeat.x = 1; // Normal orientation
                    villager.mesh.material.map.offset.x = 0;
                }
            }
        } else {
            // 3D MODEL MODE
            villager.mesh.position.y -= villager.height / 2; // Adjust for cone base

            // Sync head position (center of sphere at tip of cone)
            if (villager.headMesh) {
                villager.headMesh.position.copy(villager.body.position);
            }
        }

        // Sync health bar positions to follow villager
        const headRadius = villager.isPrincess || villager.isBrute
            ? 0.4 * 3.0 * 0.36
            : 0.4 * 3.0 * 0.72;
        const healthBarY = villager.body.position.y + villager.height / 2 + headRadius + 0.5;

        villager.bgBarMesh.position.set(
            villager.body.position.x,
            healthBarY,
            villager.body.position.z
        );
        villager.healthBarMesh.position.set(
            villager.body.position.x,
            healthBarY,
            villager.body.position.z
        );

        // Make health bars always face the camera (billboard effect)
        villager.bgBarMesh.lookAt(camera.position);
        villager.healthBarMesh.lookAt(camera.position);

        // Only sync quaternion if not performing ritual (ritual sets rotation manually)
        // And only for 3D meshes, not sprites
        if (!villager.performingRitual && !villager.mesh.isSprite) {
            villager.mesh.quaternion.copy(villager.body.quaternion);
        }

        // Check if near a princess (for escorts)
        let nearPrincess = villager.isPrincess;
        if (!villager.isPrincess) {
            // Check if any princess is nearby
            for (let j = 0; j < villagers.length; j++) {
                const other = villagers[j];
                if (other.isPrincess && other.alive) {
                    const distance = villager.body.position.distanceTo(other.body.position);
                    if (distance < 5.0) { // Within 5 units of princess
                        nearPrincess = true;
                        break;
                    }
                }
            }
        }

        // Move toward current target (waypoint or summit)
        // Use only XZ distance for waypoint checking
        const targetXZ = new THREE.Vector2(villager.target.x, villager.target.z);
        const positionXZ = new THREE.Vector2(villager.body.position.x, villager.body.position.z);
        const distanceToTargetXZ = targetXZ.distanceTo(positionXZ);

        // Check if reached current waypoint (horizontal distance only)
        if (!villager.performingRitual && distanceToTargetXZ < 1.5) {
            if (villager.currentWaypoint === 0) {
                // Reached waypoint 1, head to waypoint 2
                villager.currentWaypoint = 1;
                villager.target = villager.villageId === 1 ? waypoint2v1.clone() : waypoint2v2.clone();
            } else if (villager.currentWaypoint === 1) {
                // Reached waypoint 2, head to caldera edge
                villager.currentWaypoint = 2;
                const calderaRadius = volcanoRadius * 0.15;
                villager.target = new THREE.Vector3(0, volcanoHeight, 0);
            }
        }

        // Check if reached the caldera and start ritual
        if (!villager.performingRitual && villager.currentWaypoint === 2) {
            const distanceFromCenter = Math.sqrt(
                villager.body.position.x * villager.body.position.x +
                villager.body.position.z * villager.body.position.z
            );
            const calderaRadius = volcanoRadius * 0.15;

            // If at caldera edge and near the top
            if (distanceFromCenter < calderaRadius * 1.5 && villager.body.position.y >= volcanoHeight * 0.85) {
                villager.performingRitual = true;
                villager.ritualTime = 0;
                villager.ritualStartY = villager.body.position.y;
            }
        }

        // Handle ritual animation
        if (villager.performingRitual) {
            villager.ritualTime += deltaTime;

            // Stop all horizontal movement
            villager.body.velocity.x = 0;
            villager.body.velocity.z = 0;
            villager.body.velocity.y = 0;

            // Bob up and down
            const bobFrequency = 2.0; // 2 Hz
            const bobAmplitude = 0.5; // 0.5 units up/down
            const bobOffset = Math.sin(villager.ritualTime * bobFrequency * Math.PI * 2) * bobAmplitude;
            villager.body.position.y = villager.ritualStartY + bobOffset;

            // Rotate slightly around vertical axis
            const rotationSpeed = 0.5; // radians per second
            villager.mesh.rotation.y = villager.ritualTime * rotationSpeed;

            // Check if ritual is complete
            if (villager.ritualTime >= villager.ritualDuration) {
                if (villager.isPrincess) {
                    // Create massive red explosion
                    createRedExplosion(villager.body.position);

                    // Remove the princess
                    scene.remove(villager.mesh);
                    if (villager.headMesh) scene.remove(villager.headMesh);
                    world.removeBody(villager.body);
                    villagers.splice(i, 1);

                    // Trigger game over after explosion
                    triggerGameOver();
                    return;
                }
            }
        } else {
            // Only move if princess, or if escort is near princess
            const shouldMove = villager.isPrincess || nearPrincess;

            if (shouldMove && distanceToTargetXZ > 0.5) {
                // Calculate horizontal direction toward target (ignore Y)
                const directionXZ = new THREE.Vector2(
                    villager.target.x - villager.body.position.x,
                    villager.target.z - villager.body.position.z
                );
                directionXZ.normalize();

                // Add obstacle avoidance - repulsion from nearby trees
                const avoidanceRadius = 3.0; // How far to detect trees
                const avoidanceStrength = 2.0; // How strongly to avoid
                let avoidanceForce = new THREE.Vector2(0, 0);

                for (let t = 0; t < trees.length; t++) {
                    const tree = trees[t];
                    const treePos = new THREE.Vector2(tree.position.x, tree.position.z);
                    const villagerPos = new THREE.Vector2(villager.body.position.x, villager.body.position.z);
                    const distanceToTree = villagerPos.distanceTo(treePos);

                    if (distanceToTree < avoidanceRadius) {
                        // Calculate repulsion direction (away from tree)
                        const repulsion = new THREE.Vector2(
                            villagerPos.x - treePos.x,
                            villagerPos.y - treePos.y
                        );
                        repulsion.normalize();

                        // Stronger repulsion when closer
                        const strength = (1 - (distanceToTree / avoidanceRadius)) * avoidanceStrength;
                        repulsion.multiplyScalar(strength);

                        avoidanceForce.add(repulsion);
                    }
                }

                // Blend target direction with avoidance
                directionXZ.add(avoidanceForce);
                directionXZ.normalize();

                // Direct velocity control for horizontal movement
                const moveSpeed = villager.speed * 1.5; // Slower, more manageable speed
                villager.body.velocity.x = directionXZ.x * moveSpeed;
                villager.body.velocity.z = directionXZ.y * moveSpeed;

                // Directly set Y position to stay on surface (ignore physics for vertical)
                const surfaceHeight = getIslandSurfaceHeight(villager.body.position.x, villager.body.position.z);
                const targetHeight = surfaceHeight + 5.0; // Surface + 5 units above to ensure visibility
                villager.body.position.y = targetHeight;
                villager.body.velocity.y = 0; // Cancel any vertical velocity
            } else if (!shouldMove) {
                // Escort without princess nearby - slow down
                villager.body.velocity.x *= 0.5;
                villager.body.velocity.z *= 0.5;
                villager.body.velocity.y = 0;
            } else {
                // Slow down when near target
                villager.body.velocity.x *= 0.5;
                villager.body.velocity.z *= 0.5;
                villager.body.velocity.y = 0;
            }
        }

        // Update highest villager elevation (0 = village height, 1 = win condition)
        const villageHeight = village.position.y;
        const winHeight = volcanoHeight * 0.9;
        const elevationRange = winHeight - villageHeight;

        const villagerProgress = (villager.body.position.y - villageHeight) / elevationRange;
        const clampedProgress = Math.max(0, Math.min(1, villagerProgress));

        if (clampedProgress > gameState.highestVillagerElevation) {
            gameState.highestVillagerElevation = clampedProgress;
        }

        // Win condition is now handled by the ritual completion (see above)

        // Check collision with hot lava
        for (let j = physicsObjects.length - 1; j >= 0; j--) {
            const lava = physicsObjects[j];
            if (!lava.isHot) continue;

            // Calculate distance using positions directly
            const dx = villager.body.position.x - lava.body.position.x;
            const dy = villager.body.position.y - lava.body.position.y;
            const dz = villager.body.position.z - lava.body.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (distance < 2.0) { // Increased range for easier hits
                // Deal 1 damage from lava hit
                const died = damageVillager(villager, 1);

                // Solidify the lava that hit the villager
                solidifyLava(lava, true); // hitCollidable = true

                // Remove from array if dead
                if (died) {
                    villagers.splice(i, 1);
                }

                break;
            }
        }
        }
    }

    // Generate caldera smoke periodically
    if (currentTime - lastCalderaSmokeTime > calderaSmokeInterval) {
        // Spawn smoke at random positions within the caldera center
        const calderaRadius = volcanoRadius * 0.08; // Small area in center
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * calderaRadius;

        const smokeX = Math.cos(angle) * dist;
        const smokeZ = Math.sin(angle) * dist;
        const smokeY = volcanoHeight - 2; // Just below the rim

        const smokePos = new THREE.Vector3(smokeX, smokeY, smokeZ);

        // Create a single smoke particle with custom behavior
        const size = 0.3 + Math.random() * 0.4;
        const geometry = new THREE.SphereGeometry(size, 6, 6);
        const material = new THREE.MeshBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.6,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(smokePos);
        scene.add(mesh);

        // Slow upward drift, but cap the height
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            1.0 + Math.random() * 0.5, // Slow rise
            (Math.random() - 0.5) * 0.5
        );

        particles.push({
            mesh,
            velocity,
            age: 0,
            lifetime: 4.0, // Lasts 4 seconds
            initialOpacity: 0.6,
            isCalderaSmoke: true,
            maxHeight: volcanoHeight + 6 // Don't rise above this
        });

        lastCalderaSmokeTime = currentTime;
    }

    // Spawn villagers periodically from both villages (only if game is started and not over)
    if (!gameState.gameOver && gameState.started) {
        // Spawn from village 1
        if (currentTime - lastSpawnTimeV1 > spawnInterval) {
            spawnVillagerGroup(1);
            lastSpawnTimeV1 = currentTime;
        }

        // Spawn from village 2
        if (currentTime - lastSpawnTimeV2 > spawnInterval) {
            spawnVillagerGroup(2);
            lastSpawnTimeV2 = currentTime;
        }
    }
    } // End of !gameState.paused block

    // Camera control based on mode (works even when paused in free-flying mode)
    if (gameState.freeFlying) {
        // Free-flying mode: WASD moves camera, mouse controls look direction
        const moveSpeed = 30; // Units per second
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();

        // Get camera's forward and right vectors
        camera.getWorldDirection(forward);
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        // Move based on input
        if (input.forward) {
            camera.position.addScaledVector(forward, moveSpeed * deltaTime);
        }
        if (input.backward) {
            camera.position.addScaledVector(forward, -moveSpeed * deltaTime);
        }
        if (input.left) {
            camera.position.addScaledVector(right, -moveSpeed * deltaTime);
        }
        if (input.right) {
            camera.position.addScaledVector(right, moveSpeed * deltaTime);
        }

        // Apply mouse look (free rotation)
        const lookDirection = new THREE.Vector3(
            Math.sin(mouseX) * Math.cos(mouseY),
            -Math.sin(mouseY),
            Math.cos(mouseX) * Math.cos(mouseY)
        );
        lookDirection.normalize();
        lookDirection.multiplyScalar(10);
        lookDirection.add(camera.position);
        camera.lookAt(lookDirection);
    } else {
        // Normal mode: rotation around volcano
        if (input.rotateLeft) {
            gameState.rotation += gameState.rotationSpeed * deltaTime;
        }
        if (input.rotateRight) {
            gameState.rotation -= gameState.rotationSpeed * deltaTime;
        }

        // Update camera position based on rotation
        const camX = Math.sin(gameState.rotation) * cameraRadius;
        const camZ = Math.cos(gameState.rotation) * cameraRadius;
        camera.position.x = camX;
        camera.position.z = camZ;

        // Apply mouse look (pitch and yaw)
        const lookDirection = new THREE.Vector3(
            Math.sin(gameState.rotation + mouseX),
            -Math.tan(mouseY),
            Math.cos(gameState.rotation + mouseX)
        );
        lookDirection.normalize();
        lookDirection.multiplyScalar(10);
        lookDirection.add(camera.position);
        camera.lookAt(lookDirection);
    }

    // Handle firing (only if game is started, not over, and not paused)
    if (input.fire && gameState.started && !gameState.gameOver && !gameState.paused) {
        const now = Date.now();
        if (now - lastFireTime > fireRate) {
            fireLava();
            lastFireTime = now;
        }
    }

    // Regenerate lava (only when not paused)
    if (!gameState.paused) {
        gameState.lavaAmount = Math.min(
            gameState.lavaMax,
            gameState.lavaAmount + gameState.lavaRegenRate * deltaTime
        );
    }

    updateUI();
    renderer.render(scene, camera);
}

animate();
