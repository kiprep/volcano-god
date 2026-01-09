# Volcano God Game

A 3D browser-based game where you defend your volcano from climbing villagers trying to reach the summit.

## Setup

### Prerequisites
- Node.js (version 14 or higher)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Running the Game

Start the development server:
```bash
npm run dev
```

Then open the URL shown in the terminal (usually http://localhost:5173) in your web browser.

## Visual Modes

### Cutie Patootie Mode 🌸
Enable this mode in Settings (Pause Menu → Settings or Game Over → Settings) to replace the 3D cone models with custom 2D sprites! Sprites automatically flip to face the direction they're moving relative to your camera view.

### Controls Help
- **First Game (Desktop)**: Controls automatically display for 10 seconds at the start
- **Anytime**: Press Enter to pause, then click Settings → Show Controls to view controls again
- Controls automatically fade away after 10 seconds

## How to Play

### Objective
Stop the princesses (large red cones) from reaching the caldera at the top of the volcano and completing their ritual! Princesses spawn from two villages (pink and lime green) on opposite sides of the volcano. Each princess is accompanied by escorts (smaller blue cones) that only move when near their princess.

### Controls

#### Normal Mode
- **Space**: Start game / Fire lava
- **Mouse**: Look around
- **A/D or Left/Right Arrow**: Rotate camera left/right
- **Q/E**: Change lava type (Bomb/Boulder/Spray)
- **Left Click or Space**: Fire lava
- **Enter**: Pause/Resume

#### Free-Flying Mode (Pause Menu)
- Click "Toggle Free Flying Mode" button in pause menu
- **WASD**: Move camera forward/left/backward/right
- **Mouse**: Free look in any direction
- **Enter**: Exit pause (automatically returns to spawn point)

### Game Mechanics
- **Princesses** (bright red, large) follow waypoints (yellow for Village 1, purple for Village 2) up the volcano
  - Have 2 HP
  - When a princess reaches the caldera, she performs a 3-second ritual (bobbing and spinning)
  - If the ritual completes, the princess explodes in red particles and you lose
- **Brutes** (dark red with orange glow, large) are tough escorts
  - Have 4 HP - require multiple hits to destroy
  - 30% chance to spawn instead of a normal villager
  - Same size as princesses but more durable
- **Normal Villagers** (light blue, small) accompany their princess
  - Have 2 HP
- All villagers show health bars above their heads (green → yellow → red)
- Hit villagers with lava to damage them - they flash white when hit and create black smoke when destroyed
- Lava that hits water creates steam, lava that hits the volcano creates orange impact particles
- Death markers (yellow cubes) despawn after 5 seconds

### Lava Types
- **Bomb**: Large explosive projectile (costs 50% of total lava reserves)
  - Creates massive explosion on impact
  - Deals 2 damage to villagers within blast radius
  - Destroys trees within blast radius (10 units), creating wood splinters
- **Boulder**: Single large projectile (costs 10 lava)
  - Good for precision targeting
  - Deals 1 damage per hit
- **Spray**: Multiple smaller particles with spread (costs 5 lava)
  - Good for area coverage
  - Each particle deals 1 damage

## Technologies Used
- Three.js - 3D rendering
- Cannon.js - Physics engine
- Vite - Build tool and dev server

## Project Structure
```
volcano-god/
├── public/
│   └── sprites/       # PNG sprite images for Cutie Patootie Mode
│       ├── princess-1.png  # Village 1 princess
│       ├── princess-2.png  # Village 2 princess
│       ├── normal-1.png    # Normal villager variant 1
│       ├── normal-2.png    # Normal villager variant 2
│       ├── normal-3.png    # Normal villager variant 3
│       ├── brute-1.png     # Brute variant 1
│       ├── brute-2.png     # Brute variant 2
│       └── brute-3.png     # Brute variant 3
├── index.html    # Main HTML file with UI overlays
├── main.js       # Game logic, rendering, and physics
├── package.json  # Dependencies and scripts
└── README.md     # This file
```

## Development Notes
- The volcano is 60 units radius, 30 units tall
- Caldera radius is 15% of base (9 units)
- Win condition is at 90% height (27 units)
- Villagers spawn every 10 seconds from each village
- Debug mode is currently disabled
- To test first-time controls display: Open browser console and run `localStorage.removeItem('volcano-god-played')`
- Island features procedural biome texturing:
  - Beach zone (tan with dark brown specks) at low elevation
  - Vegetation zone (green with brown splotches) in mid-elevation
  - Rocky zone (gray with dark streaks) at high elevation
  - Caldera interior (gray to red to yellow gradient)
- Villages have green/brown terrain texture with colored roof cones (pink/lime green)
- 30 palm trees are randomly distributed in the 25-60% radius band

## Future Feature Wishlist

### Deformable Terrain
- Lava should add elevation where it solidifies, building up terrain over time
- Bombs should create craters, lowering terrain elevation
- Terrain deformation would affect villager pathfinding
- Technical challenges:
  - Dynamic mesh updates with real-time vertex modification
  - Physics body synchronization with deformed terrain
  - Biome texture reapplication on modified geometry
  - Performance optimization for continuous updates

### Liquid Flow Lava Mode
- Lava that flows downhill following terrain contours
- Creates rivers of lava that persist and deal damage over time
- Would interact with deformable terrain system
- Could solidify into permanent terrain features
