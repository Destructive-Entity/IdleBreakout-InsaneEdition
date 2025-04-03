const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Game Configuration ---
canvas.width = 800;
canvas.height = 600;
const SAVE_VERSION = 3; // Increment save version

// Helper flag to prevent starting the loop multiple times
let gameLoopStarted = false;

// --- Game State Variables ---
let score = 0;
let currentStage = 1;
let balls = [];
let bricks = [];
let powerups = []; // Array for active powerup entities on screen
let activePowerupEffects = {}; // Object to track active effect timers (e.g., { speed: 5.0, damage: 3.2 })
let floatingTexts = [];
let hoveredBrickIndex = -1;
let lastTime = 0;
let timeAccumulator = 0; // For auto-clicker logic

// --- Base Stats & Upgradeable Values ---
// These store the current *level* or *value* of the stat
let gameState = {
    // Ball Stats
    ballCount: 1, // Target number of balls (actual balls array length might differ briefly)
    ballSpeedMultiplier: 1.0,
    ballDamage: 1,
    critChance: 0.0, // 0.0 to 1.0
    critMultiplier: 1.5, // e.g., 1.5 means 150% damage
    // Click/Auto Stats
    clickValue: 1,
    autoClickerLevel: 0, // Determines clicks/sec
    autoClicksPerSec: 0,
    // General/Powerup Stats
    scoreMultiplier: 1.0,
    powerupChance: 0.02, // 2% base chance
    powerupDuration: 5.0, // Base duration in seconds
};

// --- Upgrade Definitions ---
// Structure: { cost, increaseFactor, action(currentValue) => newValue, targetStatKey }
// Using an object makes managing upgrades much easier
const upgrades = {
    addBall:          { baseCost: 50,  costIncrease: 1.6,   targetKey: 'ballCount',         maxLevel: 20,   description: "Add Ball" },
    ballSpeed:        { baseCost: 100, costIncrease: 1.65,  targetKey: 'ballSpeedMultiplier', valueIncrease: 0.1, description: "Ball Speed" },
    ballDamage:       { baseCost: 75,  costIncrease: 1.55,  targetKey: 'ballDamage',        valueIncrease: 1, description: "Ball Damage" }, // Base damage increase
    critChance:       { baseCost: 300, costIncrease: 1.8,   targetKey: 'critChance',        valueIncrease: 0.005, maxLevel: 40, description: "Crit Chance" }, // Max 20%?
    critMultiplier:   { baseCost: 500, costIncrease: 2.0,   targetKey: 'critMultiplier',    valueIncrease: 0.1, description: "Crit Damage" },
    clickValue:       { baseCost: 25,  costIncrease: 1.6,   targetKey: 'clickValue',        valueIncrease: 1, description: "Click Value" }, // Base click value increase
    autoClicker:      { baseCost: 1000, costIncrease: 2.5,  targetKey: 'autoClickerLevel',  description: "Auto Clicker" },
    scoreMultiplier:  { baseCost: 200, costIncrease: 1.8,   targetKey: 'scoreMultiplier',   valueIncrease: 0.1, description: "Score Bonus" },
    powerupChance:    { baseCost: 400, costIncrease: 1.9,   targetKey: 'powerupChance',     valueIncrease: 0.002, maxLevel: 40, description: "Powerup Chance" }, // Max 10%?
    powerupDuration:  { baseCost: 600, costIncrease: 1.7,   targetKey: 'powerupDuration',   valueIncrease: 0.5, description: "Powerup Duration" },
};

// Stores the *current cost* of each upgrade, dynamically calculated
let currentUpgradeCosts = {};

// --- DOM Elements (Simplified query) ---
const DOMElements = {
    score: document.getElementById('score'),
    stageDisplay: document.getElementById('stage-display'),
    ballCount: document.getElementById('ball-count'),
    ballSpeed: document.getElementById('ball-speed'),
    ballDamage: document.getElementById('ball-damage'),
    critChance: document.getElementById('crit-chance'),
    critMultiplier: document.getElementById('crit-multiplier'),
    clickValue: document.getElementById('click-value'),
    autoClicksPerSec: document.getElementById('auto-clicks-per-sec'),
    scoreMultiplier: document.getElementById('score-multiplier'),
    powerupChance: document.getElementById('powerup-chance'),
    powerupDuration: document.getElementById('powerup-duration'),
    activePowerupsList: document.getElementById('active-powerups-list'),
    saveBtn: document.getElementById('saveBtn'),
    loadBtn: document.getElementById('loadBtn'),
    saveCodeInput: document.getElementById('saveCodeInput'),
    saveLoadStatus: document.getElementById('saveLoadStatus'),
    popupOverlay: document.getElementById('popupOverlay'),
    introPopup: document.getElementById('introPopup'),
    closePopupBtn: document.getElementById('closePopupBtn')
};
// Add upgrade buttons and cost spans dynamically
Object.keys(upgrades).forEach(key => {
    DOMElements[`upgradeBtn_${key}`] = document.getElementById(`upgrade_${key}`);
    DOMElements[`costSpan_${key}`] = document.getElementById(`cost_${key}`);
});


// --- Brick Configuration --- (Remains similar)
const brickRowCount = 7;
const brickColumnCount = 10;
const brickWidth = 68;
const brickHeight = 22;
const brickPadding = 6;
const brickOffsetTop = 40;
const totalBrickWidth = brickColumnCount * (brickWidth + brickPadding) - brickPadding;
const brickOffsetLeft = (canvas.width - totalBrickWidth) / 2;


// --- Classes ---

class Ball { /* ... (Ball class largely the same, but uses gameState.ballSpeedMultiplier) ... */
    constructor(x, y, radius, color, dx, dy) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.baseDx = dx;
        this.baseDy = dy;
        this.updateVelocity(); // Apply initial speed multiplier
    }

    updateVelocity() {
        // Check for active speed powerup first
        const speedMultiplier = activePowerupEffects.speed ? gameState.ballSpeedMultiplier * 1.5 : gameState.ballSpeedMultiplier; // Example: 1.5x boost
        const speed = 2.5 * speedMultiplier; // Use a base speed value here
        const magnitude = Math.sqrt(this.baseDx**2 + this.baseDy**2);
         if (magnitude === 0) {
             const randomAngle = Math.random() * Math.PI * 2;
             this.baseDx = Math.cos(randomAngle); this.baseDy = Math.sin(randomAngle);
         }
         // Always recalculate dx/dy based on base direction and current speed
         this.dx = (this.baseDx / (magnitude || 1)) * speed; // Avoid division by zero if magnitude is 0
         this.dy = (this.baseDy / (magnitude || 1)) * speed;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.closePath();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    move() {
        this.x += this.dx;
        this.y += this.dy;
        // Wall collision (left/right)
        if (this.x + this.radius > canvas.width || this.x - this.radius < 0) {
            this.dx *= -1; this.baseDx *= -1; // Flip base direction too
            this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x)); // Clamp position
        }
        // Wall collision (top/bottom)
        if (this.y + this.radius > canvas.height || this.y - this.radius < 0) {
            this.dy *= -1; this.baseDy *= -1; // Flip base direction too
             this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y)); // Clamp position
        }
    }
}

class Brick { /* ... (Brick constructor similar, draw updated for hover) ... */
    constructor(x, y, width, height, health) {
        this.x = x; this.y = y; this.width = width; this.height = height;
        const hue = Math.random() * 360;
        this.color = `hsl(${hue}, 65%, 60%)`; // Slightly less saturated
        this.health = Math.max(1, Math.round(health));
        this.maxHealth = this.health;
        this.status = 1; // 1: active, 0: broken
    }
    draw(isHovered = false) {
        if (this.status !== 1) return;
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = this.color;
        ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
        ctx.fill();
        ctx.closePath();
         if (isHovered) {
             ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = 2;
             ctx.strokeRect(this.x+1, this.y+1, this.width-2, this.height-2);
         }
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'transparent'; ctx.lineWidth = 1;
        // Draw health
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)"; ctx.font = "bold 11px var(--font-main)";
        const healthText = this.health.toLocaleString(); const textWidth = ctx.measureText(healthText).width;
        ctx.fillText(healthText, this.x + (this.width - textWidth) / 2, this.y + this.height / 2 + 4);
    }
    hit(damageAmount) {
        if (this.status !== 1) return { broken: false, overkill: 0 };
        const actualDamage = Math.min(this.health, damageAmount); // Damage can't exceed current health
        this.health -= actualDamage;
        const overkill = damageAmount - actualDamage; // How much damage was 'wasted'
        if (this.health <= 0) {
            this.status = 0;
            return { broken: true, overkill: overkill };
        }
        return { broken: false, overkill: 0 };
    }
}

// NEW: Powerup Class
const POWERUP_TYPES = {
    SPEED: { color: getComputedStyle(document.documentElement).getPropertyValue('--powerup-speed').trim() || '#4dabf7', symbol: 'SPD', durationKey: 'speed', label: 'Speed Boost' },
    DAMAGE: { color: getComputedStyle(document.documentElement).getPropertyValue('--powerup-damage').trim() || '#ff922b', symbol: 'DMG', durationKey: 'damage', label: 'Damage Boost' },
    SCORE: { color: getComputedStyle(document.documentElement).getPropertyValue('--powerup-score').trim() || '#fab005', symbol: '$', durationKey: 'score', label: 'Score Frenzy' },
    EXPLOSION: { color: getComputedStyle(document.documentElement).getPropertyValue('--powerup-explosion').trim() || '#e03131', symbol: 'EXP', durationKey: 'explosion', label: 'Ball Splosion' },
};
class Powerup {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // e.g., POWERUP_TYPES.SPEED
        this.radius = 10;
        this.velocity = { x: (Math.random() - 0.5) * 30, y: 30 + Math.random() * 30 }; // Move slightly angled downwards
        this.life = 5.0; // Time before it disappears if not collected
        this.collected = false;
    }
    move(deltaTime) {
        this.x += this.velocity.x * deltaTime;
        this.y += this.velocity.y * deltaTime;
        this.life -= deltaTime;
        // Basic bounds check (remove if it goes off screen)
        if (this.x < -this.radius || this.x > canvas.width + this.radius || this.y > canvas.height + this.radius) {
            this.life = 0; // Mark for removal
        }
    }
    draw() {
        if (this.life <= 0 || this.collected) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.type.color;
        ctx.fill();
        // Draw symbol
        ctx.fillStyle = this.type === POWERUP_TYPES.SCORE ? '#333' : '#fff'; // Dark text for yellow
        ctx.font = 'bold 10px var(--font-main)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.type.symbol, this.x, this.y + 1); // Slight offset for better centering
        ctx.textAlign = 'start'; // Reset
        ctx.textBaseline = 'alphabetic'; // Reset
    }
    collect() {
        if (this.collected) return;
        this.collected = true;
        this.life = 0; // Mark for removal visually
        activatePowerup(this.type);
    }
}


// --- Core Game Logic ---

function calculateUpgradeCost(key) {
    const upgrade = upgrades[key];
    let level = 0;
    // Determine current level based on gameState value (needs specific logic per upgrade)
    switch (key) {
        case 'addBall':         level = Math.max(0, gameState.ballCount - 1); break;
        case 'ballSpeed':       level = Math.round((gameState.ballSpeedMultiplier - 1.0) / (upgrade.valueIncrease || 0.1)); break;
        case 'ballDamage':      level = Math.max(0, gameState.ballDamage - 1); break; // Simple level for now
        case 'critChance':      level = Math.round(gameState.critChance / (upgrade.valueIncrease || 0.005)); break;
        case 'critMultiplier':  level = Math.round((gameState.critMultiplier - 1.5) / (upgrade.valueIncrease || 0.1)); break;
        case 'clickValue':      level = Math.max(0, gameState.clickValue - 1); break; // Simple level
        case 'autoClicker':     level = gameState.autoClickerLevel; break;
        case 'scoreMultiplier': level = Math.round((gameState.scoreMultiplier - 1.0) / (upgrade.valueIncrease || 0.1)); break;
        case 'powerupChance':   level = Math.round((gameState.powerupChance - 0.02) / (upgrade.valueIncrease || 0.002)); break;
        case 'powerupDuration': level = Math.round((gameState.powerupDuration - 5.0) / (upgrade.valueIncrease || 0.5)); break;
        default: level = 0;
    }
    level = Math.max(0, level); // Ensure level isn't negative
    return Math.ceil(upgrade.baseCost * Math.pow(upgrade.costIncrease, level));
}

function updateAllUpgradeCosts() {
    Object.keys(upgrades).forEach(key => {
        currentUpgradeCosts[key] = calculateUpgradeCost(key);
    });
}

// REFACTORED Upgrade Purchase Logic
function buyUpgrade(key) {
    const upgrade = upgrades[key];
    const cost = currentUpgradeCosts[key];

    if (!upgrade) { console.error("Invalid upgrade key:", key); return; }
    if (score < cost) { console.log("Not enough score for", key); return; } // Not enough score

    // Check max level if applicable
    if (upgrade.maxLevel) {
         let currentLevel; // Calculate current level again (could store levels if needed)
         // This needs to be accurate based on how levels were calculated in calculateUpgradeCost
          switch (key) {
             case 'addBall': currentLevel = Math.max(0, gameState.ballCount - 1); break;
             case 'critChance': currentLevel = Math.round(gameState.critChance / (upgrade.valueIncrease || 0.005)); break;
             case 'powerupChance': currentLevel = Math.round((gameState.powerupChance - 0.02) / (upgrade.valueIncrease || 0.002)); break;
             default: currentLevel = Infinity; // Assume no max if not specified here
         }
         if (currentLevel >= upgrade.maxLevel) {
             console.log(key, "is already at max level.");
             // Optionally disable the button in updateUI if max level reached
             return;
         }
    }


    score -= cost;

    // Apply the upgrade effect
    const targetKey = upgrade.targetKey;
    switch (targetKey) {
        case 'ballCount':
            gameState.ballCount++;
            addBall(); // Add a new ball instance
            break;
        case 'ballSpeedMultiplier':
        case 'critMultiplier':
        case 'scoreMultiplier':
        case 'powerupDuration':
            gameState[targetKey] += upgrade.valueIncrease;
            break;
         case 'ballDamage':
         case 'clickValue':
             // Slightly increase scaling for damage/value? Or keep linear? Let's keep linear for now.
             gameState[targetKey] += upgrade.valueIncrease;
             break;
        case 'critChance':
        case 'powerupChance':
            gameState[targetKey] = Math.min(gameState[targetKey] + upgrade.valueIncrease, upgrade.maxLevel * upgrade.valueIncrease); // Ensure chance doesn't exceed max implied by level
             if(targetKey === 'critChance') gameState.critChance = Math.min(0.9, gameState.critChance); // Hard cap crit chance at 90%
             if(targetKey === 'powerupChance') gameState.powerupChance = Math.min(0.5, gameState.powerupChance); // Hard cap powerup chance at 50%
            break;
        case 'autoClickerLevel':
            gameState.autoClickerLevel++;
            // Update clicks/sec based on level (e.g., exponential or linear)
            gameState.autoClicksPerSec = gameState.autoClickerLevel * 0.5; // Example: 0.5 clicks per second per level
            break;
        default:
            console.error("Unhandled target key:", targetKey);
    }

    // Special case: update ball velocities if speed changed
    if (targetKey === 'ballSpeedMultiplier') {
        balls.forEach(ball => ball.updateVelocity());
    }


    updateAllUpgradeCosts(); // Recalculate costs
    updateUI(); // Refresh the UI
}


function createBricks() {
    bricks.length = 0;
    hoveredBrickIndex = -1;
    let brickHealthMultiplier = 1 + (currentStage - 1) * 0.2; // 20% more health per stage
    let layoutType = currentStage % 3; // Cycle through 3 basic layouts

    for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            // Skip some bricks for different layouts (simple example)
            if (layoutType === 1 && (c % 2 !== r % 2)) continue; // Checkerboard
            if (layoutType === 2 && r > 1 && r < brickRowCount - 2 && c > 1 && c < brickColumnCount - 2) continue; // Hollow center

            const brickX = brickOffsetLeft + c * (brickWidth + brickPadding);
            // VVVVV CORRECTED LINE VVVVV
            const brickY = brickOffsetTop + r * (brickHeight + brickPadding); // <-- CORRECTED!
            const baseHealth = ((r * 0.8) + 1) * 5 * brickHealthMultiplier; // Scale health more aggressively
            const health = Math.ceil(baseHealth);
            bricks.push(new Brick(brickX, brickY, brickWidth, brickHeight, health));
        }
    }
     // If a layout resulted in 0 bricks (unlikely but possible), default to full layout
     if(bricks.length === 0) {
         console.warn("Layout resulted in 0 bricks, creating default layout for stage", currentStage);
         layoutType = 0; // Reset layout type for the loop below if needed
          for (let c = 0; c < brickColumnCount; c++) {
             for (let r = 0; r < brickRowCount; r++) {
                 const brickX = brickOffsetLeft + c * (brickWidth + brickPadding);
                  // VVVVV CORRECTED LINE VVVVV
                 const brickY = brickOffsetTop + r * (brickHeight + brickPadding); // <-- CORRECTED!
                 const baseHealth = ((r * 0.8) + 1) * 5 * brickHealthMultiplier;
                 const health = Math.ceil(baseHealth);
                 bricks.push(new Brick(brickX, brickY, brickWidth, brickHeight, health));
             }
         }
     }
}

function handleBrickBreak(brick, hitter = 'ball') {
    // Grant score based on max health
    score += Math.ceil(brick.maxHealth * gameState.scoreMultiplier * (activePowerupEffects.score ? 3.0 : 1.0)); // Score Frenzy check

    console.log(`Brick Broken! Score added: ${Math.ceil(brick.maxHealth * gameState.scoreMultiplier * (activePowerupEffects.score ? 3.0 : 1.0))}, New Score: ${score}`); // DEBUG LINE

    // Update UI after score change
    console.log('Calling updateUI after score update'); // DEBUG LINE
    updateUI();

    // Chance to spawn powerup
    if (hitter !== 'explosion' && Math.random() < gameState.powerupChance) { // Explosions don't drop powerups maybe?
        spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
    }
}

function detectCollisions(deltaTime) {
    for (let b = balls.length - 1; b >= 0; b--) {
        const ball = balls[b];
        if (!ball) continue; // Should not happen, but safety check

        for (let i = bricks.length - 1; i >= 0; i--) {
            const brick = bricks[i];
            if (!brick || brick.status !== 1) continue;

            // Improved Collision Check (Circle vs Rect - Separating Axis Theorem basic idea)
            const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
            const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
            const distX = ball.x - closestX;
            const distY = ball.y - closestY;
            const distanceSquared = (distX * distX) + (distY * distY);

            if (distanceSquared < (ball.radius * ball.radius)) {
                // Collision!

                // --- Determine Bounce Direction ---
                // Calculate overlap on each axis relative to the BRICK'S perspective
                // This helps determine if it was more of a side hit or top/bottom hit
                const overlapX = (ball.radius) - Math.abs(ball.x - (brick.x + brick.width / 2)) + brick.width/2;
                const overlapY = (ball.radius) - Math.abs(ball.y - (brick.y + brick.height / 2)) + brick.height/2;

                 // Nudge factor to prevent sticking - increase this if balls get stuck
                 const nudgeFactor = 1.1;

                 // Bounce logic based on which axis has LESS overlap (collided first/harder)
                if (overlapX < overlapY) { // Horizontal collision is primary
                    ball.dx *= -1; ball.baseDx *= -1;
                    ball.x += (ball.dx > 0 ? overlapX : -overlapX) * nudgeFactor; // Nudge out horizontally
                } else { // Vertical collision is primary
                    ball.dy *= -1; ball.baseDy *= -1;
                    ball.y += (ball.dy > 0 ? overlapY : -overlapY) * nudgeFactor; // Nudge out vertically
                }


                // --- Apply Damage ---
                let damageDealt = activePowerupEffects.damage ? gameState.ballDamage * 2.0 : gameState.ballDamage; // Damage Boost check
                let isCrit = false;
                if (Math.random() < gameState.critChance) {
                    isCrit = true;
                    damageDealt *= gameState.critMultiplier;
                    createFloatingText("CRIT!", ball.x, ball.y - ball.radius, 'crit');
                }
                damageDealt = Math.ceil(damageDealt); // Deal whole number damage

                const { broken, overkill } = brick.hit(damageDealt);

                // Add score based on damage dealt, even if brick isn't broken
                const scoreGain = Math.ceil(Math.min(damageDealt, brick.health + damageDealt) * gameState.scoreMultiplier * (activePowerupEffects.score ? 3.0 : 1.0));
                score += scoreGain;
                createFloatingText(`+${scoreGain}`, ball.x, ball.y - ball.radius);

                if (broken) {
                    handleBrickBreak(brick); // Handle score gain & powerup chance

                    if (activePowerupEffects.explosion) {
                        handleExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, 50); // 50px radius explosion
                        delete activePowerupEffects.explosion; // One explosion per powerup
                    }

                    if (i === hoveredBrickIndex) hoveredBrickIndex = -1;
                    bricks.splice(i, 1);
                    if (hoveredBrickIndex > i) hoveredBrickIndex--;

                    if (bricks.length === 0) {
                        advanceStage();
                    }
                } else {
                    // Brick was damaged but not broken.
                }

                 // Update the UI after potential changes (score, brick removal)
                 updateUI();

                 // Exit the inner loop (checking bricks) for this ball's frame,
                 // as it has already collided with one brick.
                 break;
            } // End of collision check (if distanceSquared < radius^2)
        } // End of bricks loop
    } // End of balls loop
} // End of detectCollisions function

function handleExplosion(x, y, radius) {
    const explosionDamage = Math.ceil(gameState.ballDamage * 0.5); // Explosions do 50% base ball damage?
    createFloatingText("BOOM!", x, y, 'explosion');

     for (let i = bricks.length - 1; i >= 0; i--) {
         const brick = bricks[i];
         if (brick.status !== 1) continue;

         // Check distance from explosion center to brick center
         const brickCenterX = brick.x + brick.width / 2;
         const brickCenterY = brick.y + brick.height / 2;
         const distSq = (x - brickCenterX)**2 + (y - brickCenterY)**2;

         if (distSq < radius * radius) {
              const { broken } = brick.hit(explosionDamage);
              if (broken) {
                    handleBrickBreak(brick, 'explosion'); // Score gain, but maybe no powerup from explosion breaks?
                    if (i === hoveredBrickIndex) hoveredBrickIndex = -1;
                    bricks.splice(i, 1);
                    if (hoveredBrickIndex > i) hoveredBrickIndex--;
                    if (bricks.length === 0) { advanceStage(); } // Check stage clear after explosion chain reaction
              }
         }
     }
}

function advanceStage() {
    currentStage++;
    createFloatingText(`Stage ${currentStage}!`, canvas.width / 2, canvas.height / 2, 'stage');
    console.log("Advancing to Stage:", currentStage);
    // Reset temporary effects or keep them? Let's reset powerups on stage clear.
    powerups.length = 0;
    activePowerupEffects = {};
    createBricks(); // Create bricks for the new stage
    // Ensure ball count matches target after stage transition if needed
    adjustBallCount();
    updateUI();
}


function drawGameObjects() {
    bricks.forEach((brick, index) => brick.draw(index === hoveredBrickIndex));
    powerups.forEach(p => p.draw()); // Draw powerup entities
    balls.forEach(ball => ball.draw()); // Draw balls last (on top)
}

// --- UI Update ---
function updateUI() {
    console.log('Updating UI with score:', score); // DEBUG LINE
    DOMElements.score.textContent = Math.floor(score).toLocaleString();
    DOMElements.stageDisplay.textContent = currentStage;

    // Stats display
    DOMElements.ballCount.textContent = balls.length + ` (${gameState.ballCount})`; // Show current / target
    DOMElements.ballSpeed.textContent = gameState.ballSpeedMultiplier.toFixed(2) + 'x';
    DOMElements.ballDamage.textContent = gameState.ballDamage.toLocaleString();
    DOMElements.critChance.textContent = (gameState.critChance * 100).toFixed(1) + '%';
    DOMElements.critMultiplier.textContent = Math.round(gameState.critMultiplier * 100) + '%';
    DOMElements.clickValue.textContent = gameState.clickValue.toLocaleString();
    DOMElements.autoClicksPerSec.textContent = gameState.autoClicksPerSec.toFixed(1);
    DOMElements.scoreMultiplier.textContent = gameState.scoreMultiplier.toFixed(1) + 'x';
    DOMElements.powerupChance.textContent = (gameState.powerupChance * 100).toFixed(1) + '%';
    DOMElements.powerupDuration.textContent = gameState.powerupDuration.toFixed(1) + 's';

    // Update upgrade costs and button states
    Object.keys(upgrades).forEach(key => {
        const cost = currentUpgradeCosts[key];
        const upgrade = upgrades[key];
        const btn = DOMElements[`upgradeBtn_${key}`];
        const costSpan = DOMElements[`costSpan_${key}`];

        if (costSpan) { costSpan.textContent = Math.ceil(cost).toLocaleString(); }
        if (btn) { btn.disabled = score < cost; }

         // Optionally disable if max level reached
         if (upgrade.maxLevel && btn) {
             let currentLevel;
             switch (key) {
                case 'addBall': currentLevel = Math.max(0, gameState.ballCount - 1); break;
                case 'critChance': currentLevel = Math.round(gameState.critChance / (upgrade.valueIncrease || 0.005)); break;
                case 'powerupChance': currentLevel = Math.round((gameState.powerupChance - 0.02) / (upgrade.valueIncrease || 0.002)); break;
                default: currentLevel = -1; // Assume no max if not specified here
             }
              if (currentLevel !== -1 && currentLevel >= upgrade.maxLevel) {
                  btn.disabled = true;
                  if (costSpan) costSpan.textContent = "MAX";
              }
         }
    });

    // Update active powerups display
    const listElement = DOMElements.activePowerupsList;
    listElement.innerHTML = ''; // Clear previous indicators
    let hasActivePowerups = false;
    Object.entries(activePowerupEffects).forEach(([key, duration]) => {
         hasActivePowerups = true;
         const powerupType = Object.values(POWERUP_TYPES).find(pt => pt.durationKey === key);
         if(powerupType) {
             const indicator = document.createElement('span');
             indicator.className = `powerup-indicator ${key}`;
             indicator.textContent = `${powerupType.label} (${duration.toFixed(1)}s)`;
             indicator.style.backgroundColor = powerupType.color;
              if(key === 'score') indicator.style.color = '#333'; // Dark text for yellow
             listElement.appendChild(indicator);
         }
    });
    if (!hasActivePowerups) {
         listElement.innerHTML = '<span class="no-powerups">None Active</span>';
    }

}

// --- Main Game Loop ---
function masterGameLoop(timestamp) {
    const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.1); // Delta time in seconds, max step 0.1s
    lastTime = timestamp;

    // --- Updates ---
    updatePowerups(deltaTime); // Update powerup timers and effects
    updateAutoClicker(deltaTime); // Process auto-clicks

    // Move balls & powerups
    balls.forEach(ball => ball.move(deltaTime));
    powerups.forEach(p => p.move(deltaTime));

    // Collisions
    detectCollisions(deltaTime);

    // Clean up inactive entities
    powerups = powerups.filter(p => p.life > 0 && !p.collected);


    // --- Drawing ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGameObjects();
    updateAndDrawFloatingTexts(deltaTime); // Draw floating text last

    requestAnimationFrame(masterGameLoop);
}


// --- User Interaction & Misc ---

function handleCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // 1. Check for Powerup Collection
    let powerupCollected = false;
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        const distSq = (clickX - p.x)**2 + (clickY - p.y)**2;
        if (distSq < p.radius * p.radius) {
            p.collect();
            powerupCollected = true;
            break; // Collect only one powerup per click
        }
    }
    if (powerupCollected) { updateUI(); return; } // Don't process brick click if powerup collected

    // 2. Check for Brick Click (Score Gain)
    for (let i = bricks.length - 1; i >= 0; i--) {
        const brick = bricks[i];
        if (brick.status === 1 &&
            clickX > brick.x && clickX < brick.x + brick.width &&
            clickY > brick.y && clickY < brick.y + brick.height)
        {
            let valueGained = gameState.clickValue;
            let isCrit = false;
            // Allow clicks to crit? Yes!
            if (Math.random() < gameState.critChance) {
                 isCrit = true;
                 valueGained *= gameState.critMultiplier;
                 createFloatingText("CRIT!", clickX, clickY - 10, 'crit');
            }
            valueGained = Math.ceil(valueGained * gameState.scoreMultiplier * (activePowerupEffects.score ? 3.0 : 1.0)); // Apply multipliers
            score += valueGained;
            createFloatingText(`+${valueGained.toLocaleString()}`, clickX, clickY);
            updateUI();
            break; // Click only the top-most brick
        }
    }
}

function handleCanvasMouseMove(event) { /* ... (Mouse move for hover - same as before) ... */
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    let brickFound = false;
    for (let i = 0; i < bricks.length; i++) {
         const brick = bricks[i];
         if (brick.status === 1 && mouseX > brick.x && mouseX < brick.x + brick.width && mouseY > brick.y && mouseY < brick.y + brick.height){
            hoveredBrickIndex = i; brickFound = true; break;
         }
    }
    if (!brickFound) hoveredBrickIndex = -1;
}
function handleCanvasMouseOut() { hoveredBrickIndex = -1; }

// --- Popup Control Functions ---
function showIntroPopup() {
    if (DOMElements.popupOverlay && DOMElements.introPopup) {
        DOMElements.popupOverlay.classList.add('visible');
        DOMElements.introPopup.classList.add('visible');
    }
}

function hideIntroPopup() {
    if (DOMElements.popupOverlay && DOMElements.introPopup) {
        DOMElements.popupOverlay.classList.remove('visible');
        DOMElements.introPopup.classList.remove('visible');
    }
    // Start the game loop ONLY after the popup is closed
    if (!gameLoopStarted) { // Prevent multiple starts
        startGameLoop();
    }
}

function startGameLoop() {
    if (gameLoopStarted) return;
    console.log("Starting Game Loop...");
    lastTime = performance.now(); // Initialize lastTime right before starting
    requestAnimationFrame(masterGameLoop);
    gameLoopStarted = true;
}

// --- Powerup Handling ---
function spawnPowerup(x, y) {
    const availableTypes = Object.values(POWERUP_TYPES);
    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    powerups.push(new Powerup(x, y, type));
}

function activatePowerup(type) {
    const durationKey = type.durationKey;
    const duration = gameState.powerupDuration;
    console.log(`Activating ${type.label} for ${duration}s`);

    // Add or refresh duration
    activePowerupEffects[durationKey] = (activePowerupEffects[durationKey] || 0) + duration;

    // Immediate effect for explosion (triggers on next ball hit) handled in collision
    if (durationKey === 'speed') {
        balls.forEach(b => b.updateVelocity()); // Update speed immediately
    }
    updateUI(); // Show indicator
}

function updatePowerups(deltaTime) {
    let speedChanged = false;
    Object.keys(activePowerupEffects).forEach(key => {
        activePowerupEffects[key] -= deltaTime;
        if (activePowerupEffects[key] <= 0) {
            delete activePowerupEffects[key];
            console.log(`Powerup ${key} expired.`);
            if (key === 'speed') speedChanged = true; // Mark speed change needed
            updateUI(); // Update indicators immediately
        }
    });
    // If speed powerup expired, update ball velocities
    if (speedChanged) {
        balls.forEach(b => b.updateVelocity());
    }
}

// --- Auto Clicker ---
function updateAutoClicker(deltaTime) {
    if (gameState.autoClicksPerSec <= 0 || bricks.length === 0) return;

    timeAccumulator += deltaTime;
    const clicksToDo = Math.floor(timeAccumulator * gameState.autoClicksPerSec);

    if (clicksToDo > 0) {
        timeAccumulator -= clicksToDo / gameState.autoClicksPerSec; // Consume the time for clicks done

        for (let i = 0; i < clicksToDo; i++) {
            // Select a random active brick
            const activeBricks = bricks.filter(b => b.status === 1);
            if (activeBricks.length === 0) break; // Stop if no bricks left
            const targetBrick = activeBricks[Math.floor(Math.random() * activeBricks.length)];
            const targetX = targetBrick.x + targetBrick.width / 2;
            const targetY = targetBrick.y + targetBrick.height / 2;

            // Apply click value (no crit for auto-clicks?)
            let valueGained = Math.ceil(gameState.clickValue * gameState.scoreMultiplier * (activePowerupEffects.score ? 3.0 : 1.0));
            score += valueGained;
            // Optional: Less prominent floating text for auto-clicks
            createFloatingText(`+${valueGained.toLocaleString()}`, targetX, targetY - 5, 'auto');
        }
         if(clicksToDo > 0) updateUI(); // Update score display after auto clicks
    }
}

// --- Floating Text ---
function createFloatingText(text, x, y, type = 'normal') {
     const life = type === 'stage' ? 2.0 : 1.0; // Longer life for stage text
     floatingTexts.push({ text, x, y, life: life, type: type, initialY: y });
}
function updateAndDrawFloatingTexts(deltaTime) {
     ctx.textAlign = "center";
     ctx.textBaseline = "bottom"; // Align text bottom relative to y coordinate

     for (let i = floatingTexts.length - 1; i >= 0; i--) {
         const ft = floatingTexts[i];
         ft.y -= 40 * deltaTime; // Move up faster
         ft.life -= deltaTime;

         if (ft.life <= 0) {
             floatingTexts.splice(i, 1);
         } else {
             const alpha = Math.min(1.0, ft.life * 2); // Fade out faster at the end
             ctx.globalAlpha = alpha;
             let styleClass = '';
             switch(ft.type) {
                 case 'crit':
                      ctx.font = "bold 16px var(--font-main)";
                      ctx.fillStyle = "#ff4d4f"; // Red
                      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
                      break;
                 case 'stage':
                      ctx.font = "bold 24px var(--font-main)";
                      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--insane-color').trim(); // Insane Pink
                       ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4;
                      break;
                 case 'explosion':
                      ctx.font = "bold 18px var(--font-main)";
                      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--powerup-explosion').trim(); // Explosion Red
                       ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 3;
                      break;
                  case 'auto':
                      ctx.font = "normal 11px var(--font-main)";
                      ctx.fillStyle = "rgba(108, 117, 125, 0.8)"; // Gray for auto
                      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
                      break;
                 default: // Normal score gain
                      ctx.font = "bold 14px var(--font-main)";
                      ctx.fillStyle = "rgba(255, 210, 0, 0.9)"; // Gold
                      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 2;
             }
             ctx.fillText(ft.text, ft.x, ft.y);
             ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; // Reset shadow
         }
     }
     ctx.globalAlpha = 1.0;
     ctx.textAlign = "start"; ctx.textBaseline = "alphabetic"; // Reset
}

// --- Ball Management ---
function addBall() {
    if (balls.length >= gameState.ballCount) return; // Don't add if already at target

    const newBall = new Ball(
        Math.random() * (canvas.width - 40) + 20,
        canvas.height - 50 - Math.random() * 50,
        10, `hsl(${Math.random() * 360}, 85%, 60%)`,
        (Math.random() - 0.5) * 2, // Base direction vectors
        -(1 + Math.random() * 0.5)
    );
    // Velocity will be set correctly by updateVelocity using current multiplier
    balls.push(newBall);
    updateUI(); // Update ball count display
}

function adjustBallCount() {
    // Remove excess balls
    while (balls.length > gameState.ballCount) {
        balls.pop();
    }
    // Add missing balls
    while (balls.length < gameState.ballCount) {
        addBall();
    }
    updateUI();
}


// --- Save / Load (V3) ---
function displaySaveLoadMessage(message, type = 'info') { /* ... (Same as before) ... */
     const el = DOMElements.saveLoadStatus;
     el.textContent = message;
     el.className = `status-message ${type}`;
     void el.offsetWidth; // Reflow
     el.classList.add('visible');
     setTimeout(() => { el.classList.remove('visible'); }, 3500);
}

function saveGame() {
    const saveData = {
        saveVersion: SAVE_VERSION,
        score: score,
        currentStage: currentStage,
        gameState: gameState, // Save the entire gameState object
        upgradeCosts: currentUpgradeCosts, // Save current costs to avoid recalc issues on load
        // Note: We don't save active powerups, balls, bricks, etc. - they reset on load
    };
    try {
        const jsonString = JSON.stringify(saveData);
        const base64String = btoa(jsonString);
        DOMElements.saveCodeInput.value = base64String;
        displaySaveLoadMessage("Game Saved! (V3)", 'success');
    } catch (error) {
        console.error("Error saving game:", error);
        displaySaveLoadMessage("Error saving game.", 'error');
    }
}

function loadGame() {
    const base64String = DOMElements.saveCodeInput.value.trim();
    if (!base64String) { displaySaveLoadMessage("Paste V3 save code first.", 'error'); return; }
    try {
        const jsonString = atob(base64String);
        const loadedData = JSON.parse(jsonString);

        if (!loadedData.saveVersion || typeof loadedData.score !== 'number' || !loadedData.gameState || !loadedData.upgradeCosts) {
            throw new Error("Invalid or missing save data fields.");
        }
        if (loadedData.saveVersion !== SAVE_VERSION) {
            displaySaveLoadMessage(`Warning: Loading V${loadedData.saveVersion} save in V${SAVE_VERSION}. May be incompatible.`, 'info');
            // Attempt to load anyway, but provide defaults for potentially missing fields
        }

        score = loadedData.score ?? 0;
        currentStage = loadedData.currentStage ?? 1;

        // Load gameState, providing defaults for any missing properties from older saves
        const defaultGameState = { ballCount: 1, ballSpeedMultiplier: 1.0, ballDamage: 1, critChance: 0.0, critMultiplier: 1.5, clickValue: 1, autoClickerLevel: 0, autoClicksPerSec: 0, scoreMultiplier: 1.0, powerupChance: 0.02, powerupDuration: 5.0 };
        gameState = { ...defaultGameState, ...(loadedData.gameState || {}) }; // Merge loaded data over defaults

        // Load costs, providing defaults if missing
        currentUpgradeCosts = { ...(loadedData.upgradeCosts || {}) };
        // Ensure all expected costs exist, calculating if necessary
         Object.keys(upgrades).forEach(key => {
             if (currentUpgradeCosts[key] === undefined) {
                 console.warn(`Calculating missing cost for ${key} on load.`);
                 currentUpgradeCosts[key] = calculateUpgradeCost(key); // Recalculate if missing
             }
         });


        // --- Reset transient state ---
        balls = [];
        bricks = [];
        powerups = [];
        activePowerupEffects = {};
        floatingTexts = [];
        hoveredBrickIndex = -1;
        timeAccumulator = 0;

        // --- Initialize based on loaded state ---
        adjustBallCount(); // Create the correct number of balls
        createBricks(); // Create bricks for the loaded stage

        balls.forEach(b => b.updateVelocity()); // Apply loaded speed multiplier

        updateAllUpgradeCosts(); // Ensure costs are fully up-to-date just in case
        updateUI(); // Refresh the entire UI

        DOMElements.saveCodeInput.value = ''; // Clear input
        displaySaveLoadMessage(`Game Loaded (V${loadedData.saveVersion})`, 'success');

    } catch (error) {
        console.error("Error loading game:", error);
        if (error instanceof DOMException && error.name === 'InvalidCharacterError') { displaySaveLoadMessage("Invalid save code (not Base64).", 'error'); }
        else if (error instanceof SyntaxError) { displaySaveLoadMessage("Invalid save data format.", 'error'); }
        else { displaySaveLoadMessage(`Load failed: ${error.message}`, 'error'); }
    }
}


// --- Initialization ---
function init() {
    console.log("Initializing Game...");

    // Calculate initial costs
    updateAllUpgradeCosts();

    // Set up initial game state
    createBricks();
    adjustBallCount(); // Add the starting ball(s)

    // Attach event listeners dynamically
    Object.keys(upgrades).forEach(key => {
        const btn = DOMElements[`upgradeBtn_${key}`];
        if (btn) {
            btn.addEventListener('click', () => buyUpgrade(key));
        } else {
            console.warn(`Button for upgrade '${key}' not found.`);
        }
    });
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseout', handleCanvasMouseOut);
    DOMElements.saveBtn.addEventListener('click', saveGame);
    DOMElements.loadBtn.addEventListener('click', loadGame);
    DOMElements.closePopupBtn.addEventListener('click', hideIntroPopup); // Added popup close listener

    updateUI(); // Set initial UI
    
    showIntroPopup(); // Show popup on load
    console.log("Game Initialized. Waiting for popup close to start loop.");
}

// --- Start Game ---
window.onload = init;