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

## How to Play

### Objective
Stop the princesses (large red cones) from reaching the caldera at the top of the volcano and completing their ritual! Princesses spawn from two villages (pink and lime green) on opposite sides of the volcano. Each princess is accompanied by escorts (smaller blue cones) that only move when near their princess.

### Controls
- **Space**: Start game / Fire lava
- **Mouse**: Look around
- **A/D or Left/Right Arrow**: Rotate camera left/right
- **Q/E**: Change lava type (Boulder/Spray/Liquid)
- **Left Click or Space**: Fire lava
- **Enter**: Pause/Resume

### Game Mechanics
- **Princesses** follow waypoints (yellow for Village 1, purple for Village 2) up the volcano
- When a princess reaches the caldera, she performs a 3-second ritual (bobbing and spinning)
- If the ritual completes, the princess explodes in red particles and you lose
- Hit villagers with lava to stop them - they create black smoke when destroyed
- Lava that hits water creates steam, lava that hits the volcano creates orange impact particles
- Death markers (yellow cubes) despawn after 5 seconds

### Lava Types
- **Boulder**: Single large projectile
- **Spray**: Multiple smaller particles with spread
- **Liquid**: (Not yet implemented)

## Technologies Used
- Three.js - 3D rendering
- Cannon.js - Physics engine
- Vite - Build tool and dev server

## Project Structure
```
volcano-god/
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
- Debug mode is currently enabled (shows waypoint markers)
