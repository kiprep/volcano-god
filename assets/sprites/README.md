# Sprite Assets for Cutie Patootie Mode

## Naming Convention

### Princesses (2 sprites)
- `princess-1.png` - Princess from Village 1 (pink village)
- `princess-2.png` - Princess from Village 2 (lime green village)

### Normal Villagers (3 sprites)
- `normal-1.png` - Normal villager variant 1
- `normal-2.png` - Normal villager variant 2
- `normal-3.png` - Normal villager variant 3

### Brutes (3 sprites)
- `brute-1.png` - Brute variant 1
- `brute-2.png` - Brute variant 2
- `brute-3.png` - Brute variant 3

## Image Format & Specifications

**Recommended Format:** PNG (Portable Network Graphics)

**Why PNG?**
- Supports transparency (alpha channel) - essential for sprites
- Lossless compression maintains image quality
- Excellent browser and Three.js support
- Perfect for both pixel art and illustrated characters

**Recommended Specifications:**
- **Resolution:** 256x256 or 512x512 pixels (power of 2 for optimal GPU performance)
- **Background:** Transparent
- **Color Mode:** RGBA (with alpha channel)
- **Bit Depth:** 32-bit (8-bit per channel + alpha)

**Tips:**
- Keep sprites facing forward by default
- Consider adding a subtle shadow or outline for better visibility against various backgrounds
- Higher resolution is better for close-up views (512x512 recommended)
- All sprites should be roughly the same scale relative to their character size

## Usage in Code

Sprites will be randomly selected from their type category when villagers spawn:
- Princesses use princess-1 or princess-2 based on village ID
- Normal villagers randomly pick from normal-1, normal-2, or normal-3
- Brutes randomly pick from brute-1, brute-2, or brute-3
