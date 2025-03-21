const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// Game controls and state
const controls = {
    up: false,
    down: false,
    left: false,
    right: false,
    shift: false
};

// Score tracking and game state
let sequenceScore = 0; // Tracks correct sequences completed
let gameStartTime = Date.now();
let gameOver = false;
let gameWon = false;
let gameStarted = false; // Track if the game has started
const GAME_TIME_LIMIT = 60000; // 1 minute in milliseconds

// Color sequence mechanics
const availableColors = ['#FF3366', '#33CCFF', '#FFCC00', '#66FF33', '#CC33FF']; // Pink, Light Blue, Yellow, Lime Green, Purple
let currentSequence = [];
let playerProgress = 0; // Tracks player's progress through the sequence
const SEQUENCE_LENGTH = 3;
const SEQUENCE_WIN_SCORE = 3; // Win after 3 correct sequences

// Generate a new random sequence
function generateNewSequence() {
    currentSequence = [];
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
        const randomIndex = Math.floor(Math.random() * availableColors.length);
        currentSequence.push(availableColors[randomIndex]);
    }
    playerProgress = 0;
}

// Add particle system
class Particle {
    constructor(x, y, color, speed, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.speed = speed;
        this.size = size;
        this.life = 1;
        this.angle = Math.random() * Math.PI * 2;
        this.dx = Math.cos(this.angle) * this.speed;
        this.dy = Math.sin(this.angle) * this.speed;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.life -= 0.02;
        this.size *= 0.95;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color}, ${this.life})`;
        ctx.fill();
    }
}

// Add particle system to game state
let particles = [];

// Wall class (now Coin class)
class Wall {
    constructor(x, y, radius, color, speedX, speedY) {
        this.x = x;
        this.y = y;
        this.radius = 20; // Smaller size
        this.color = color; // Use the provided color
        
        // Set consistent speed - direction is random but magnitude is fixed
        const angle = Math.random() * Math.PI * 2;
        const speed = 3; // Fixed speed magnitude
        this.speedX = Math.cos(angle) * speed;
        this.speedY = Math.sin(angle) * speed;
        
        this.captured = false;
        this.permanentlyCaught = false;
        this.rotation = 0;
        this.scale = 1;
        this.glowIntensity = 0;
        this.glowDirection = 1;
        this.mass = this.radius * 2; // Mass for collision physics
        this.respawnTime = 0;
        this.respawning = false;
        this.opacity = 1;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);

        // Draw glow effect
        const gradient = ctx.createRadialGradient(0, 0, this.radius * 0.5, 0, 0, this.radius * 1.5);
        
        // Extract color components for the glow
        let colorRGB = this.color;
        if (this.color.startsWith('#')) {
            const r = parseInt(this.color.slice(1, 3), 16);
            const g = parseInt(this.color.slice(3, 5), 16);
            const b = parseInt(this.color.slice(5, 7), 16);
            colorRGB = `${r}, ${g}, ${b}`;
        }
        
        gradient.addColorStop(0, `rgba(${colorRGB}, ${this.glowIntensity * 0.7})`);
        gradient.addColorStop(1, `rgba(${colorRGB}, 0)`);
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw coin body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = this.darkenColor(this.color, 20);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw coin inner circle
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = this.darkenColor(this.color, 20);
        ctx.fill();

        ctx.restore();

        // Update animations
        this.rotation += 0.05;
        this.scale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
        this.glowIntensity += this.glowDirection * 0.02;
        if (this.glowIntensity >= 1 || this.glowIntensity <= 0) {
            this.glowDirection *= -1;
        }
    }
    
    // Helper function to darken a color
    darkenColor(color, percent) {
        if (color.startsWith('#')) {
            let r = parseInt(color.slice(1, 3), 16);
            let g = parseInt(color.slice(3, 5), 16);
            let b = parseInt(color.slice(5, 7), 16);
            
            r = Math.max(0, r - percent);
            g = Math.max(0, g - percent);
            b = Math.max(0, b - percent);
            
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        return color;
    }

    update(walls) {
        if (this.captured) {
            // Handle respawn animation
            if (this.respawning) {
                const currentTime = Date.now();
                const elapsedTime = currentTime - this.respawnTime;
                
                if (elapsedTime < 1000) {
                    // Fade in animation
                    this.opacity = elapsedTime / 1000;
                    this.scale = 0.5 + (elapsedTime / 1000) * 0.5;
                } else {
                    // Done respawning
                    this.respawning = false;
                    this.captured = false;
                    this.opacity = 1;
                    this.scale = 1;
                }
            }
            return;
        }
        
        // Improved bounce off walls with better collision detection
        if (this.x - this.radius <= 0) {
            this.x = this.radius + 1; // Push away from edge
            this.speedX = Math.abs(this.speedX); // Force positive x speed
            
            // Add a slight randomness after wall bounce to avoid infinite loops
            this.speedY += (Math.random() - 0.5) * 0.3;
        } else if (this.x + this.radius >= canvas.width) {
            this.x = canvas.width - this.radius - 1; // Push away from edge
            this.speedX = -Math.abs(this.speedX); // Force negative x speed
            
            // Add a slight randomness after wall bounce to avoid infinite loops
            this.speedY += (Math.random() - 0.5) * 0.3;
        }
        
        if (this.y - this.radius <= 0) {
            this.y = this.radius + 1; // Push away from edge
            this.speedY = Math.abs(this.speedY); // Force positive y speed
            
            // Add a slight randomness after wall bounce to avoid infinite loops
            this.speedX += (Math.random() - 0.5) * 0.3;
        } else if (this.y + this.radius >= canvas.height) {
            this.y = canvas.height - this.radius - 1; // Push away from edge
            this.speedY = -Math.abs(this.speedY); // Force negative y speed
            
            // Add a slight randomness after wall bounce to avoid infinite loops
            this.speedX += (Math.random() - 0.5) * 0.3;
        }
        
        // Ensure velocity is never near zero
        if (Math.abs(this.speedX) < 0.5) {
            this.speedX = (this.speedX >= 0) ? 0.5 : -0.5;
        }
        if (Math.abs(this.speedY) < 0.5) {
            this.speedY = (this.speedY >= 0) ? 0.5 : -0.5;
        }
        
        // Ensure we maintain consistent speed overall
        const speed = Math.sqrt(this.speedX * this.speedX + this.speedY * this.speedY);
        if (speed !== 0 && Math.abs(speed - 3) > 0.5) {
            this.speedX = (this.speedX / speed) * 3;
            this.speedY = (this.speedY / speed) * 3;
        }
        
        // Collision with other balls
        walls.forEach(otherWall => {
            if (otherWall !== this && !otherWall.captured) {
                const dx = otherWall.x - this.x;
                const dy = otherWall.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = this.radius + otherWall.radius;
                
                if (distance < minDistance) {
                    // Calculate collision response
                    const angle = Math.atan2(dy, dx);
                    const sin = Math.sin(angle);
                    const cos = Math.cos(angle);
                    
                    // Rotate velocity vectors
                    const vx1 = this.speedX * cos + this.speedY * sin;
                    const vy1 = this.speedY * cos - this.speedX * sin;
                    const vx2 = otherWall.speedX * cos + otherWall.speedY * sin;
                    const vy2 = otherWall.speedY * cos - otherWall.speedX * sin;
                    
                    // Final velocities after collision
                    const final_vx1 = ((this.mass - otherWall.mass) * vx1 + 2 * otherWall.mass * vx2) / (this.mass + otherWall.mass);
                    const final_vx2 = ((otherWall.mass - this.mass) * vx2 + 2 * this.mass * vx1) / (this.mass + otherWall.mass);
                    
                    // Update velocities
                    this.speedX = final_vx1 * cos - vy1 * sin;
                    this.speedY = vy1 * cos + final_vx1 * sin;
                    otherWall.speedX = final_vx2 * cos - vy2 * sin;
                    otherWall.speedY = vy2 * cos + final_vx2 * sin;
                    
                    // Normalize the speeds to maintain consistent speed
                    const speed1 = Math.sqrt(this.speedX * this.speedX + this.speedY * this.speedY);
                    const speed2 = Math.sqrt(otherWall.speedX * otherWall.speedX + otherWall.speedY * otherWall.speedY);
                    
                    if (speed1 > 0) {
                        this.speedX = (this.speedX / speed1) * 3;
                        this.speedY = (this.speedY / speed1) * 3;
                    }
                    
                    if (speed2 > 0) {
                        otherWall.speedX = (otherWall.speedX / speed2) * 3;
                        otherWall.speedY = (otherWall.speedY / speed2) * 3;
                    }
                    
                    // Separate the balls to avoid sticking
                    const overlap = minDistance - distance;
                    const separationX = overlap * cos / 2;
                    const separationY = overlap * sin / 2;
                    this.x -= separationX;
                    this.y -= separationY;
                    otherWall.x += separationX;
                    otherWall.y += separationY;
                }
            }
        });

        // Update position
        this.x += this.speedX;
        this.y += this.speedY;

        this.draw();
    }
    
    respawn() {
        // Choose a random edge to respawn from with better positioning
        const edge = Math.floor(Math.random() * 4);
        const padding = this.radius * 3; // Increased padding
        
        switch(edge) {
            case 0: // Top edge
                this.x = Math.random() * (canvas.width - padding * 2) + padding;
                this.y = -this.radius * 2; // Further away from edge
                break;
            case 1: // Right edge
                this.x = canvas.width + this.radius * 2; // Further away from edge
                this.y = Math.random() * (canvas.height - padding * 2) + padding;
                break;
            case 2: // Bottom edge
                this.x = Math.random() * (canvas.width - padding * 2) + padding;
                this.y = canvas.height + this.radius * 2; // Further away from edge
                break;
            case 3: // Left edge
                this.x = -this.radius * 2; // Further away from edge
                this.y = Math.random() * (canvas.height - padding * 2) + padding;
                break;
        }
        
        // Reset to center if stuck somehow
        if (isNaN(this.x) || isNaN(this.y)) {
            this.x = canvas.width / 2;
            this.y = canvas.height / 2;
        }
        
        // Set angle to move toward center with some randomness
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dx = centerX - this.x;
        const dy = centerY - this.y;
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * Math.PI / 4; // Less randomness
        
        // Set consistent speed - slightly faster to ensure it enters the screen
        const speed = 4;
        this.speedX = Math.cos(angle) * speed;
        this.speedY = Math.sin(angle) * speed;
        
        // Start respawn animation
        this.respawnTime = Date.now();
        this.respawning = true;
        this.opacity = 0;
        this.scale = 0.5;
        
        // Create warp-in particles
        for (let i = 0; i < 15; i++) {
            let colorRGB = this.color;
            if (this.color.startsWith('#')) {
                const r = parseInt(this.color.slice(1, 3), 16);
                const g = parseInt(this.color.slice(3, 5), 16);
                const b = parseInt(this.color.slice(5, 7), 16);
                colorRGB = `${r}, ${g}, ${b}`;
            }
            particles.push(new Particle(this.x, this.y, colorRGB, 3, 5));
        }
    }
}

// Monster class (now a spotlight effect)
class Monster {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.radius = 25; 
        this.currentColorIndex = 0;
        this.nextColorIndex = 1;
        this.colorTransition = 0; // 0 to 1 for color transition
        this.colorChangeSpeed = 0.01;
        this.speed = 4.5;
        this.trail = [];
        this.maxTrailLength = 15;
        this.rotation = 0;
        this.rotationSpeed = 0.03;
        this.outerGlowSize = 2.5; // Size multiplier for outer glow
        this.pulsePhase = 0;
    }

    // Get current color based on transition between two colors
    getCurrentColor() {
        if (this.colorTransition >= 1) {
            this.currentColorIndex = this.nextColorIndex;
            this.nextColorIndex = (this.nextColorIndex + 1) % availableColors.length;
            this.colorTransition = 0;
        }
        
        const currentColor = this.hexToRgb(availableColors[this.currentColorIndex]);
        const nextColor = this.hexToRgb(availableColors[this.nextColorIndex]);
        
        // Interpolate between colors
        const r = Math.floor(currentColor.r + (nextColor.r - currentColor.r) * this.colorTransition);
        const g = Math.floor(currentColor.g + (nextColor.g - currentColor.g) * this.colorTransition);
        const b = Math.floor(currentColor.b + (nextColor.b - currentColor.b) * this.colorTransition);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    // Helper to convert hex color to RGB
    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    draw() {
        // Update color transition
        this.colorTransition += this.colorChangeSpeed;
        
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Update pulse
        this.pulsePhase += 0.05;
        const pulseFactor = 1 + Math.sin(this.pulsePhase) * 0.15;
        
        // Draw trail with fading opacity
        this.trail.forEach((pos, index) => {
            const ratio = index / this.trail.length;
            const alpha = 0.7 * (1 - ratio);
            const trailRadius = this.radius * (0.8 - ratio * 0.6);
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, trailRadius, 0, Math.PI * 2);
            
            // Use earlier color in the transition for trail
            const trailColorIndex = (this.currentColorIndex - Math.floor(ratio * 3) + availableColors.length) % availableColors.length;
            const color = this.hexToRgb(availableColors[trailColorIndex]);
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
            ctx.fill();
        });

        // Get current blended color
        const currentColor = this.getCurrentColor();
        const rgb = currentColor.replace(/[^\d,]/g, '').split(',');
        
        // Draw outer spotlight glow
        const outerGradient = ctx.createRadialGradient(
            this.x, this.y, this.radius * 0.2, 
            this.x, this.y, this.radius * this.outerGlowSize * pulseFactor
        );
        outerGradient.addColorStop(0, currentColor);
        outerGradient.addColorStop(0.6, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`);
        outerGradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * this.outerGlowSize * pulseFactor, 0, Math.PI * 2);
        ctx.fillStyle = outerGradient;
        ctx.fill();
        
        // Draw main spotlight core
        const coreGradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * pulseFactor
        );
        coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        coreGradient.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.7)`);
        coreGradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`);
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulseFactor, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.fill();
        
        // Draw small inner core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.4 * pulseFactor, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
        
        // Update trail
        this.trail.unshift({x: this.x, y: this.y});
        if (this.trail.length > this.maxTrailLength) {
            this.trail.pop();
        }
    }

    findClosestBall(balls) {
        let closest = null;
        let closestDist = Infinity;
        
        balls.forEach(ball => {
            if (ball.captured) return;
            
            const dx = ball.x - this.x;
            const dy = ball.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < closestDist) {
                closestDist = distance;
                closest = ball;
            }
        });
        
        return closest;
    }
    
    checkBallCollision(balls) {
        balls.forEach(ball => {
            if (ball.captured || ball.respawning) return;
            
            const dx = ball.x - this.x;
            const dy = ball.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.radius + ball.radius) {
                ball.captured = true;
                
                // Generate sequence if it doesn't exist yet
                if (currentSequence.length === 0) {
                    generateNewSequence();
                    // Don't increment playerProgress or count this coin
                    addCoinParticles(ball.x, ball.y);
                    setTimeout(() => {
                        ball.respawn();
                    }, 200);
                    return;
                }
                
                // Check if the ball matches the current sequence color
                if (ball.color === currentSequence[playerProgress]) {
                    // Correct color
                    playerProgress++;
                    
                    // Play correct ball sound
                    playSound(sounds.correctBall, 0.7);
                    
                    // If sequence is complete
                    if (playerProgress >= SEQUENCE_LENGTH) {
                        sequenceScore++;
                        // Add extra particles for sequence completion
                        for (let i = 0; i < 80; i++) {
                            const size = 3 + Math.random() * 5;
                            const speed = 2 + Math.random() * 5;
                            // Gold particles with some randomness
                            particles.push(new Particle(this.x, this.y, '255, 215, 0', speed, size));
                        }
                        
                        // Add some white sparkles
                        for (let i = 0; i < 30; i++) {
                            const size = 2 + Math.random() * 3;
                            const speed = 3 + Math.random() * 4;
                            particles.push(new Particle(this.x, this.y, '255, 255, 255', speed, size));
                        }
                        
                        // Play sequence complete sound
                        playSound(sounds.sequenceComplete, 1.0);
                        
                        generateNewSequence(); // Generate new sequence
                        
                        // Check for win condition
                        if (sequenceScore >= SEQUENCE_WIN_SCORE) {
                            gameOver = true;
                            // Set a flag to indicate win vs loss
                            gameWon = true;
                            // Play win sound
                            playSound(sounds.gameWin, 1.0);
                        }
                    }
                } else {
                    // Wrong color - reset progress
                    playerProgress = 0;
                    
                    // Add "broken" particles for sequence break
                    for (let i = 0; i < 40; i++) {
                        const size = 2 + Math.random() * 4;
                        const speed = 3 + Math.random() * 4;
                        // Red particles for error
                        particles.push(new Particle(this.x, this.y, '255, 50, 50', speed, size));
                    }
                    
                    // Play wrong ball sound
                    playSound(sounds.wrongBall, 0.7);
                }
                
                addCoinParticles(ball.x, ball.y);
                
                // Rather than using setTimeout for respawn, start respawn animation
                setTimeout(() => {
                    ball.respawn();
                }, 200);
            }
        });
    }

    update(balls) {
        if (gameOver) {
            this.draw();
            return;
        }

        // Check for time limit
        if (Date.now() - gameStartTime > GAME_TIME_LIMIT) {
            gameOver = true;
            // Play lose sound
            playSound(sounds.gameLose, 1.0);
            return;
        }

        // Calculate speed based on whether shift is pressed
        const speedMultiplier = controls.shift ? 2.0 : 1.0;

        // Manual mode - keyboard controls
        let dx = 0, dy = 0;
        
        if (controls.left) dx -= 1;
        if (controls.right) dx += 1;
        if (controls.up) dy -= 1;
        if (controls.down) dy += 1;
        
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            this.x += (dx / dist) * this.speed * speedMultiplier;
            this.y += (dy / dist) * this.speed * speedMultiplier;
            
            // Speed up rotation when moving
            this.rotationSpeed = 0.03 + speedMultiplier * 0.01;
        } else {
            // Slow rotation when idle
            this.rotationSpeed = 0.02;
        }
        
        this.target = this.findClosestBall(balls);
        
        // Screen wrapping for monster - move from one edge to another
        if (this.x < -this.radius) {
            this.x = canvas.width + this.radius;
            // Add teleport particle effect
            for (let i = 0; i < 20; i++) {
                // Get current color
                const currentColor = this.getCurrentColor();
                const rgb = currentColor.replace(/[^\d,]/g, '').split(',');
                particles.push(new Particle(this.x, this.y, rgb.join(', '), 4, 5));
            }
        } else if (this.x > canvas.width + this.radius) {
            this.x = -this.radius;
            // Add teleport particle effect
            for (let i = 0; i < 20; i++) {
                const currentColor = this.getCurrentColor();
                const rgb = currentColor.replace(/[^\d,]/g, '').split(',');
                particles.push(new Particle(this.x, this.y, rgb.join(', '), 4, 5));
            }
        }
        
        if (this.y < -this.radius) {
            this.y = canvas.height + this.radius;
            // Add teleport particle effect
            for (let i = 0; i < 20; i++) {
                const currentColor = this.getCurrentColor();
                const rgb = currentColor.replace(/[^\d,]/g, '').split(',');
                particles.push(new Particle(this.x, this.y, rgb.join(', '), 4, 5));
            }
        } else if (this.y > canvas.height + this.radius) {
            this.y = -this.radius;
            // Add teleport particle effect
            for (let i = 0; i < 20; i++) {
                const currentColor = this.getCurrentColor();
                const rgb = currentColor.replace(/[^\d,]/g, '').split(',');
                particles.push(new Particle(this.x, this.y, rgb.join(', '), 4, 5));
            }
        }
        
        // Check for collisions with balls
        this.checkBallCollision(balls);
        
        this.draw();
    }
}

// Create circles with different colors - now fixed colors matching the available colors
const walls = [
    // Original 5 balls
    new Wall(100, 100, 20, availableColors[0], 3, 2),      // Pink
    new Wall(200, 200, 20, availableColors[1], -2, 3),     // Light Blue
    new Wall(300, 300, 20, availableColors[2], 2, -2),     // Yellow
    new Wall(400, 400, 20, availableColors[3], -3, -3),    // Lime Green
    new Wall(500, 500, 20, availableColors[4], 2, 2),      // Purple
    
    // Second set of 5 balls
    new Wall(150, 450, 20, availableColors[0], 2, -3),     // Pink
    new Wall(350, 150, 20, availableColors[1], -3, -2),    // Light Blue
    new Wall(550, 350, 20, availableColors[2], 3, 3),      // Yellow
    new Wall(250, 550, 20, availableColors[3], -2, 2),     // Lime Green
    new Wall(450, 250, 20, availableColors[4], 3, -3),     // Purple
    
    // New third set of 5 balls
    new Wall(180, 320, 20, availableColors[0], -2, -2),    // Pink
    new Wall(420, 180, 20, availableColors[1], 3, 2),      // Light Blue
    new Wall(600, 500, 20, availableColors[2], -3, -2),    // Yellow
    new Wall(120, 220, 20, availableColors[3], 2, 3),      // Lime Green
    new Wall(520, 120, 20, availableColors[4], -2, -3)     // Purple
];

// Initialize with consistent speeds
walls.forEach(wall => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3; // Fixed speed magnitude
    wall.speedX = Math.cos(angle) * speed;
    wall.speedY = Math.sin(angle) * speed;
});

// Create monster
const monster = new Monster();

// Add a global muted state
let soundMuted = false;
const soundToggleBtn = document.getElementById('soundToggle');

// Function to toggle sound state
function toggleSound() {
    soundMuted = !soundMuted;
    
    // Update all sound volumes based on muted state
    Object.values(sounds).forEach(sound => {
        if (sound && sound.volume !== undefined) {
            // Store original volume if not already stored
            if (!sound.originalVolume && sound.originalVolume !== 0) {
                sound.originalVolume = sound.volume;
            }
            
            // Set volume to 0 if muted, otherwise restore original volume
            sound.volume = soundMuted ? 0 : (sound.originalVolume || (sound === sounds.bgMusic ? 0.3 : 1.0));
        }
    });
    
    // Update button text
    soundToggleBtn.textContent = soundMuted ? "SOUND: OFF" : "SOUND: ON";
}

// Setup sound toggle button
soundToggleBtn.addEventListener('click', toggleSound);

// Add sound effects with better organization
const sounds = {
    // Game state sounds
    gameStart: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
    gameWin: new Audio('https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3'),
    gameLose: new Audio('https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3'),
    
    // Gameplay sounds
    sequenceComplete: new Audio('https://assets.mixkit.co/active_storage/sfx/217/217-preview.mp3'), // Game experience level increased sound
    correctBall: new Audio('https://assets.mixkit.co/active_storage/sfx/2648/2648-preview.mp3'), // Using old sequence break for correct ball
    wrongBall: new Audio('https://assets.mixkit.co/active_storage/sfx/565/565-preview.mp3'), // Wrong answer fail notification - very short (under 1 sec)
    
    // Background music
    bgMusic: new Audio('https://assets.mixkit.co/active_storage/sfx/209/209-preview.mp3')
};

// Store original volumes for all sounds
Object.values(sounds).forEach(sound => {
    sound.originalVolume = sound.volume || 1.0;
});

// Configure sounds
sounds.bgMusic.volume = 0.3;
sounds.bgMusic.loop = true;

// Setup music controls
let musicPlaying = true;
function toggleMusic() {
    if (soundMuted) {
        // If sound is muted, only update the state but don't play
        musicPlaying = !musicPlaying;
        return;
    }
    
    if (musicPlaying) {
        sounds.bgMusic.pause();
    } else {
        sounds.bgMusic.play().catch(err => console.log("Music toggle error:", err));
    }
    musicPlaying = !musicPlaying;
}

// Setup keyboard controls
window.addEventListener('keydown', (e) => {
    if (!gameStarted && e.key === ' ') {
        // Start game
        gameStarted = true;
        initializeGame();
        return;
    }
    
    if (gameOver && e.key === ' ') {
        // Reset game and go back to title screen instead of restarting immediately
        gameStarted = false;
        gameOver = false;
        particles = [];
        return;
    }

    if (gameOver || !gameStarted) return;

    switch (e.key) {
        case 'ArrowUp': controls.up = true; break;
        case 'ArrowDown': controls.down = true; break;
        case 'ArrowLeft': controls.left = true; break;
        case 'ArrowRight': controls.right = true; break;
        case 'Shift': 
            controls.shift = true;
            break;
        case 'm':
        case 'M':
            toggleMusic();
            break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.key) {
        case 'ArrowUp': controls.up = false; break;
        case 'ArrowDown': controls.down = false; break;
        case 'ArrowLeft': controls.left = false; break;
        case 'ArrowRight': controls.right = false; break;
        case 'Shift': controls.shift = false; break;
    }
});

// Modify draw instructions to include the sequence bar and win condition
function drawInstructions() {
    // Only draw sequence bar if a sequence exists
    if (currentSequence.length > 0) {
        // Draw the sequence bar at the top
        const barHeight = 70;
        const barWidth = canvas.width;
        const slotSize = 60;
        const slotPadding = 10;
        
        // Draw sequence bar background
        const barGradient = ctx.createLinearGradient(0, 0, barWidth, barHeight);
        barGradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        barGradient.addColorStop(0.5, 'rgba(50, 50, 70, 0.7)');
        barGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        
        ctx.fillStyle = barGradient;
        ctx.fillRect(0, 0, barWidth, barHeight);
        
        // Draw sequence slots
        const startX = (barWidth - (SEQUENCE_LENGTH * (slotSize + slotPadding))) / 2;
        
        for (let i = 0; i < SEQUENCE_LENGTH; i++) {
            const x = startX + i * (slotSize + slotPadding);
            const y = (barHeight - slotSize) / 2;
            
            // Draw slot background (darker if not reached yet)
            ctx.beginPath();
            ctx.roundRect(x, y, slotSize, slotSize, 10);
            
            if (i < playerProgress) {
                // Completed slot - brighter
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            } else if (i === playerProgress) {
                // Current slot - highlighted with pulse
                const pulse = 0.2 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.3;
                ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
            } else {
                // Future slot - dimmer
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            }
            
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw color circle
            ctx.beginPath();
            ctx.arc(x + slotSize/2, y + slotSize/2, slotSize/2 - 10, 0, Math.PI * 2);
            ctx.fillStyle = currentSequence[i];
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw glow for active slot
            if (i === playerProgress) {
                ctx.beginPath();
                ctx.arc(x + slotSize/2, y + slotSize/2, slotSize/2 - 5, 0, Math.PI * 2);
                const glowGradient = ctx.createRadialGradient(
                    x + slotSize/2, y + slotSize/2, slotSize/2 - 15,
                    x + slotSize/2, y + slotSize/2, slotSize/2
                );
                glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
                glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }
        }
        
        // Draw sequence counter
        ctx.fillStyle = 'white';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(`SEQUENCE: ${sequenceScore}/${SEQUENCE_WIN_SCORE}`, canvas.width / 2, barHeight + 25);
        
        // Time display
        const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
        const timeRemaining = Math.max(0, 60 - elapsedSeconds);
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        
        // Create gradient for time display
        const timeGradient = ctx.createLinearGradient(10, 10 + barHeight, 150, 60 + barHeight);
        timeGradient.addColorStop(0, 'rgba(0, 204, 255, 0.8)');
        timeGradient.addColorStop(1, 'rgba(0, 255, 153, 0.8)');
        
        // Draw time background
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(10, 10 + barHeight, 140, 60, 15);
        ctx.fillStyle = timeGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw time text with glow
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 10;
        
        ctx.fillStyle = 'white';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(`TIME`, 80, 35 + barHeight);
        
        // Make time red if less than 10 seconds
        if (timeRemaining <= 10) {
            ctx.fillStyle = '#FF3366';
            // Pulsing effect for low time
            if (timeRemaining <= 5) {
                const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.2;
                ctx.font = `${16 * pulse}px "Press Start 2P"`;
            }
        }
        
        ctx.fillText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`, 80, 55 + barHeight);
        
        ctx.shadowBlur = 0;
        ctx.restore();
    } else {
        // If no sequence exists yet, just show a simple prompt
        const elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
        const timeRemaining = Math.max(0, 60 - elapsedSeconds);
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        
        // Draw time in top-right corner
        ctx.save();
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 10;
        
        ctx.fillStyle = 'white';
        ctx.font = '16px "Press Start 2P"';
        ctx.textAlign = 'right';
        ctx.fillText(`TIME: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`, canvas.width - 20, 30);
        
        // Show prompt to collect any coin to start
        ctx.font = '14px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#33CCFF';
        
        // Add pulse effect
        const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.globalAlpha = pulse;
        ctx.fillText('COLLECT ANY COIN TO START SEQUENCE', canvas.width / 2, 30);
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    if (gameOver) {
        // Game is already over, no need to play sounds again
        
        // Draw game over screen with gradient background
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        gradient.addColorStop(1, 'rgba(50, 0, 50, 0.85)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw glowing central panel
        ctx.save();
        const panelGradient = ctx.createLinearGradient(
            canvas.width/2 - 200, canvas.height/2 - 100,
            canvas.width/2 + 200, canvas.height/2 + 100
        );
        
        if (gameWon) {
            // Victory panel colors
            panelGradient.addColorStop(0, 'rgba(0, 255, 102, 0.3)');
            panelGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)');
            panelGradient.addColorStop(1, 'rgba(0, 204, 255, 0.3)');
        } else {
            // Defeat panel colors
            panelGradient.addColorStop(0, 'rgba(255, 0, 102, 0.3)');
            panelGradient.addColorStop(0.5, 'rgba(102, 0, 255, 0.3)');
            panelGradient.addColorStop(1, 'rgba(0, 204, 255, 0.3)');
        }
        
        ctx.beginPath();
        ctx.roundRect(canvas.width/2 - 200, canvas.height/2 - 150, 400, 300, 20);
        ctx.fillStyle = panelGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Add glow effect
        if (gameWon) {
            ctx.shadowColor = 'rgba(0, 255, 128, 0.6)';
        } else {
            ctx.shadowColor = 'rgba(255, 0, 255, 0.6)';
        }
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.restore();

        // Draw game over text with glow and animation
        const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.1;
        
        ctx.save();
        if (gameWon) {
            ctx.shadowColor = 'rgba(0, 255, 0, 0.7)';
            ctx.fillStyle = '#00FF66';
            ctx.font = `${36 * pulse}px "Press Start 2P"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 60);
        } else {
            ctx.shadowColor = 'rgba(255, 0, 0, 0.7)';
            ctx.fillStyle = '#FF3366';
            ctx.font = `${36 * pulse}px "Press Start 2P"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('TIME UP!', canvas.width / 2, canvas.height / 2 - 60);
        }
        ctx.shadowBlur = 20;
        ctx.restore();
        
        // Show sequences completed
        ctx.save();
        ctx.shadowColor = 'rgba(255, 255, 0, 0.7)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#33CCFF';
        ctx.font = '18px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SEQUENCES: ${sequenceScore}/${SEQUENCE_WIN_SCORE}`, canvas.width / 2, canvas.height / 2);
        ctx.restore();

        ctx.save();
        ctx.shadowColor = 'rgba(0, 255, 255, 0.7)';
        ctx.shadowBlur = 15;
        
        ctx.fillStyle = '#00FFFF';
        ctx.font = '18px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PRESS SPACE', canvas.width / 2, canvas.height / 2 + 70);
        ctx.fillText('TO RETURN TO TITLE', canvas.width / 2, canvas.height / 2 + 100);
        ctx.restore();
    }
}

// Modify animation loop to include title screen
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!gameStarted) {
        // Draw title screen
        drawTitleScreen();
        requestAnimationFrame(animate);
        return;
    }
    
    // Update and draw particles
    particles = particles.filter(particle => particle.life > 0);
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });
    
    // Update walls with collision detection
    walls.forEach(wall => wall.update(walls));
    monster.update(walls);
    drawInstructions();
    
    requestAnimationFrame(animate);
}

// Draw title screen
function drawTitleScreen() {
    // Draw background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw title with glow
    ctx.save();
    ctx.shadowColor = 'rgba(255, 204, 0, 0.8)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.fillStyle = '#FF3366';
    ctx.font = '70px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add pulsing effect to title
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.1;
    ctx.font = `${70 * pulse}px "Press Start 2P", monospace`;
    ctx.fillText('JAPJAPJAP:P', canvas.width / 2, canvas.height / 3);
    ctx.restore();
    
    // Draw prompt with pulsing effect
    ctx.save();
    ctx.shadowColor = 'rgba(0, 204, 255, 0.7)';
    ctx.shadowBlur = 15;
    
    ctx.fillStyle = '#33CCFF';
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Pulse the "Press Space" text
    const promptPulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
    ctx.globalAlpha = promptPulse;
    ctx.fillText('PRESS SPACE TO START', canvas.width / 2, canvas.height * 0.7);
    ctx.restore();
    
    // Draw colorful particles in the background for visual effect
    for (let i = 0; i < 3; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const color = availableColors[Math.floor(Math.random() * availableColors.length)];
        
        // Convert hex to RGB for particles
        let colorRGB = '255, 255, 255';
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            colorRGB = `${r}, ${g}, ${b}`;
        }
        
        particles.push(new Particle(x, y, colorRGB, 2, 3 + Math.random() * 3));
    }
}

// Helper function to play sounds that respects mute setting
function playSound(sound, volume = 1.0) {
    if (!soundMuted && sound) {
        sound.currentTime = 0;
        sound.volume = volume;
        sound.play().catch(err => console.log("Audio play error:", err));
    }
}

// Modify initializeGame function to use the new sound playing helper
function initializeGame() {
    // Reset game state
    gameOver = false;
    gameWon = false;
    sequenceScore = 0;
    gameStartTime = Date.now();
    particles = [];
    
    // Initialize empty sequence and reset progress
    currentSequence = [];
    playerProgress = 0;
    
    // Play game start sound
    playSound(sounds.gameStart);
    
    // Ensure background music is playing
    if (musicPlaying && sounds.bgMusic.paused && !soundMuted) {
        sounds.bgMusic.currentTime = 0;
        sounds.bgMusic.play().catch(err => console.log("Music play error:", err));
    }
    
    // Reset monster position
    monster.x = canvas.width / 2;
    monster.y = canvas.height / 2;
    
    // Reset wall positions with better spacing for 15 balls
    const positions = [
        // First row
        { x: canvas.width * 0.1, y: canvas.height * 0.1 },
        { x: canvas.width * 0.3, y: canvas.height * 0.1 },
        { x: canvas.width * 0.5, y: canvas.height * 0.1 },
        { x: canvas.width * 0.7, y: canvas.height * 0.1 },
        { x: canvas.width * 0.9, y: canvas.height * 0.1 },
        
        // Second row
        { x: canvas.width * 0.15, y: canvas.height * 0.3 },
        { x: canvas.width * 0.35, y: canvas.height * 0.3 },
        { x: canvas.width * 0.55, y: canvas.height * 0.3 },
        { x: canvas.width * 0.75, y: canvas.height * 0.3 },
        { x: canvas.width * 0.95, y: canvas.height * 0.3 },
        
        // Third row
        { x: canvas.width * 0.1, y: canvas.height * 0.5 },
        { x: canvas.width * 0.3, y: canvas.height * 0.5 },
        { x: canvas.width * 0.5, y: canvas.height * 0.5 },
        { x: canvas.width * 0.7, y: canvas.height * 0.5 },
        { x: canvas.width * 0.9, y: canvas.height * 0.5 }
    ];
    
    walls.forEach((wall, index) => {
        wall.x = positions[index].x;
        wall.y = positions[index].y;
        wall.captured = false;
        wall.permanentlyCaught = false;
        wall.respawning = false;
        wall.opacity = 1;
        wall.scale = 1;
        
        // Set consistent speed with random direction
        const angle = Math.random() * Math.PI * 2;
        const speed = 3; // Fixed speed magnitude
        wall.speedX = Math.cos(angle) * speed;
        wall.speedY = Math.sin(angle) * speed;
    });
    
    // Add sounds.played tracking property if it doesn't exist
    sounds.gameLose.played = false;
    sounds.gameWin.played = false;
}

// Add particle effects when collecting coins
function addCoinParticles(x, y) {
    const coinColors = walls.find(wall => wall.x === x && wall.y === y)?.color || '#FFDD00';
    let colorRGB = '255, 221, 0'; // Default
    
    if (coinColors.startsWith('#')) {
        const r = parseInt(coinColors.slice(1, 3), 16);
        const g = parseInt(coinColors.slice(3, 5), 16);
        const b = parseInt(coinColors.slice(5, 7), 16);
        colorRGB = `${r}, ${g}, ${b}`;
    }
    
    for (let i = 0; i < 30; i++) {
        const speed = 2 + Math.random() * 3;
        const size = 3 + Math.random() * 4;
        particles.push(new Particle(x, y, colorRGB, speed, size));
    }
}

// Start the animation loop immediately, but don't initialize the game until space is pressed
animate(); // Start the animation loop 