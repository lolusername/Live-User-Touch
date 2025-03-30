# Interactive Video Effects with WebGL: A Beginner's Guide

This project demonstrates how to create interactive video effects in your web browser. You can move your mouse/finger to adjust video colors and use arrow keys to switch between videos. Let's break down how it works!

## Quick Start
1. A video plays in the center of the screen
2. Move mouse/finger left-right: changes color temperature (warmer/cooler)
3. Move up-down: adjusts contrast
4. Use left/right arrow keys: switch between videos

## Understanding the Basics

### Vectors in Graphics Programming

Vectors are fundamental building blocks in graphics programming. They represent:
- Positions in space
- Colors
- Texture coordinates
- Directions

In GLSL, we have different vector types:
```glsl
vec2 position;    // 2D point (x,y)
vec3 color;       // RGB color (r,g,b)
vec4 position;    // 3D point with perspective (x,y,z,w)
```

### The W Component and Homogeneous Coordinates

The w component is a crucial part of 3D graphics that enables perspective projection and unified matrix transformations. Here's why it's important:

#### Historical Context
The concept of homogeneous coordinates (which use the w component) has its roots in projective geometry, developed in the 16th and 17th centuries. Albrecht Dürer's 1525 engravings demonstrated early perspective projection techniques, and the mathematical concept was formalized by August Ferdinand Möbius in 1827.

#### What is W?
The w component turns our regular 3D coordinates (x, y, z) into 4D homogeneous coordinates (x, y, z, w). This serves several crucial purposes:

1. **Representing Points vs Directions**
   - When w = 1: Represents a point in 3D space
   - When w = 0: Represents a direction or vector
   - Any other w value: Represents the same point as (x/w, y/w, z/w, 1)

2. **Mathematical Properties**
   A point in homogeneous coordinates (x, y, z, w) represents the 3D point:
   \[ (x/w, y/w, z/w) \]

   This means these all represent the same 3D point:
   ```glsl
   vec4(1.0, 1.0, 1.0, 1.0)  // (1,1,1)
   vec4(2.0, 2.0, 2.0, 2.0)  // (1,1,1)
   vec4(3.0, 3.0, 3.0, 3.0)  // (1,1,1)
   ```

#### Why Use W? The Benefits

1. **Unified Matrix Transformations**
   - Allows both translations and linear transformations using a single 4x4 matrix
   - Without w, translations would require addition rather than multiplication

2. **Perspective Division**
   - Graphics pipelines automatically divide x, y, and z by w
   - This creates the perspective effect where distant objects appear smaller

3. **Representing Infinity**
   - Points at infinity can be represented using w = 0
   - Impossible in regular 3D coordinates

#### Practical Applications

In our vertex shader, we use w for perspective projection:
```glsl
// In vertex shader
vec4 position = vec4(x, y, z, 1.0);  // Start with w = 1.0
position = projectionMatrix * position;  // w gets modified for perspective
gl_Position = position;  // WebGL automatically divides by w
```

The projection matrix modifies w to create perspective effects:
- Objects further away (larger z) get a larger w
- When x and y are divided by w, distant objects appear smaller

#### Common W Values and Their Meanings

- w = 1.0: Standard position in 3D space
- w = 0.0: Direction vector or point at infinity
- w > 1.0: Point will appear smaller after perspective division
- 0 < w < 1.0: Point will appear larger after perspective division
- w < 0.0: Point is behind the camera (typically clipped)

### GLSL Variable Types

GLSL (OpenGL Shading Language) has special variable types:

1. **attribute**: Input data that changes for each vertex
   ```glsl
   attribute vec4 a_position; // Different for each corner of our quad
   ```

2. **uniform**: Input data that stays the same for all vertices/pixels
   ```glsl
   uniform vec2 u_resolution;  // Same for the whole frame
   uniform vec2 u_mouse;       // Same for the whole frame
   ```

3. **varying**: Data passed from vertex shader to fragment shader
   ```glsl
   varying vec2 v_texCoord;    // Interpolated between vertices
   ```

### Connecting WebGL to JavaScript

The magic of interactive graphics happens when we connect our JavaScript code to our WebGL shaders. Here's how it works:

#### 1. Setting Up the Connection

```javascript
// Create WebGL context
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl');

// Create and compile shaders
const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

// Create program and link shaders
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

// Get locations of variables in shaders
const attributes = {
    position: gl.getAttribLocation(program, 'a_position'),
    texCoord: gl.getAttribLocation(program, 'a_texCoord')
};

const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    videoTexture: gl.getUniformLocation(program, 'u_videoTexture')
};
```

#### 2. Creating and Managing Buffers

```javascript
// Create buffers for vertex data
const positionBuffer = gl.createBuffer();
const texCoordBuffer = gl.createBuffer();

// Set up position data (corners of our quad)
const positions = new Float32Array([
    -1, -1,  // Bottom left
     1, -1,  // Bottom right
    -1,  1,  // Top left
     1,  1   // Top right
]);

// Set up texture coordinates
const texCoords = new Float32Array([
    0, 0,  // Bottom left
    1, 0,  // Bottom right
    0, 1,  // Top left
    1, 1   // Top right
]);

// Upload data to buffers
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
```

#### 3. Setting Up Textures

```javascript
// Create and set up video texture
const videoTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, videoTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

// Update texture with video frame
function updateVideoTexture(video) {
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }
}
```

#### 4. The Render Loop

```javascript
function render(timestamp) {
    // Clear the canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use our shader program
    gl.useProgram(program);

    // Set up attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(attributes.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.enableVertexAttribArray(attributes.texCoord);
    gl.vertexAttribPointer(attributes.texCoord, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.mouse, mouseX, mouseY);
    gl.uniform1i(uniforms.videoTexture, 0);

    // Update video texture
    updateVideoTexture(video);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Request next frame
    requestAnimationFrame(render);
}
```

#### 5. Handling User Input

```javascript
// Track mouse position
let mouseX = 0.5;  // Center position
let mouseY = 0.5;

function updateMousePosition(event) {
    // Convert screen coordinates to normalized coordinates (-1 to 1)
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width;
    mouseY = 1.0 - (event.clientY - rect.top) / rect.height;
}

// Add event listeners
canvas.addEventListener('mousemove', updateMousePosition);
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    updateMousePosition(touch);
});
```

#### 6. State Management for Interactivity

```javascript
// Create a store to manage application state
const store = createStore({
    mouse: { x: 0.5, y: 0.5 },
    temperature: 0.5,
    contrast: 0.5
});

// Subscribe to state changes
store.subscribe((state) => {
    // Update uniforms with new state
    gl.useProgram(program);
    gl.uniform2f(uniforms.mouse, state.mouse.x, state.mouse.y);
    gl.uniform1f(uniforms.temperature, state.temperature);
    gl.uniform1f(uniforms.contrast, state.contrast);
});

// Update state based on user input
function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1.0 - (event.clientY - rect.top) / rect.height;
    
    store.setState({
        mouse: { x, y },
        temperature: x,  // Use x position for temperature
        contrast: y      // Use y position for contrast
    });
}
```

#### 7. Error Handling and Debugging

```javascript
// Check for WebGL support
if (!gl) {
    console.error('WebGL not supported');
    return;
}

// Check shader compilation
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Check program linking
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program));
    return;
}
```

This connection between JavaScript and WebGL/shaders creates a powerful pipeline where:
1. JavaScript handles user input and state management
2. WebGL manages the graphics context and resources
3. Shaders process the actual graphics data
4. The render loop ties everything together

The key to making things interactive is understanding how to:
- Update uniforms based on user input
- Manage state changes efficiently
- Handle texture updates for video
- Coordinate the render loop with state updates

### How Our Shaders Use These

In our vertex shader:
```glsl
attribute vec4 a_position;     // Input: corner position
uniform vec2 u_resolution;     // Input: screen size
varying vec2 v_texCoord;       // Output: texture coordinate

void main() {
    // Keep position as is (we're drawing a rectangle)
    gl_Position = a_position;  // Special output variable
    
    // Convert position from clip space (-1 to +1) to texture space (0 to 1)
    v_texCoord = vec2(
        (a_position.x + 1.0) / 2.0,  // Convert -1..1 to 0..1
        (1.0 - a_position.y) / 2.0    // Flip Y and convert
    );
}
```

In our fragment shader:
```glsl
precision mediump float;              // Precision for calculations
uniform sampler2D u_videoTexture;     // Input: video frame
varying vec2 v_texCoord;             // Input: from vertex shader

void main() {
    // Sample color from video at this pixel's texture coordinate
    vec3 color = texture2D(u_videoTexture, v_texCoord).rgb;
    
    // Output final color (adding alpha=1.0 for fully opaque)
    gl_FragColor = vec4(color, 1.0);
}
```

## Technical Overview

### Core Components
1. WebGL Context and Shaders
2. Video Processing Pipeline
3. Reactive State Management
4. Event Handling System

### Project Structure
```
project/
├── index.html          # HTML container and WebGL canvas
├── script-functional.js # Main application logic
└── styles.css          # Styling and layout
```

## How It Works

### 1. Video Processing Pipeline

#### High-Level Explanation
Think of this like an assembly line for video frames:
- Load video frames
- Track mouse/touch position
- Apply effects
- Display result

#### Technical Implementation
```javascript
// Initialize WebGL context
const gl = canvas.getContext('webgl');

// Create shader program
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

// Set up video texture
const videoTexture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, videoTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
```

### 2. Shader Programs

#### High-Level Explanation
Shaders are like Instagram filters that:
- Run on your graphics card (very fast!)
- Process each pixel of the video
- Create color and contrast effects

#### Technical Implementation
```glsl
// Vertex Shader: Handles position and texture coordinates
attribute vec4 a_position;
uniform vec2 u_resolution;
uniform vec2 u_mediaSize;
varying vec2 v_texCoord;

void main() {
    gl_Position = a_position;
    float screenAspect = u_resolution.x / u_resolution.y;
    float mediaAspect = u_mediaSize.x / u_mediaSize.y;
    vec2 texCoord = vec2((a_position.x + 1.0) / 2.0, (1.0 - a_position.y) / 2.0);
    // ... aspect ratio calculations ...
    v_texCoord = texCoord;
}

// Fragment Shader: Handles color processing
precision mediump float;
uniform sampler2D u_videoTexture;
uniform vec2 u_mouse;
varying vec2 v_texCoord;

void main() {
    vec3 color = texture2D(u_videoTexture, v_texCoord).rgb;
    color = colorGrade(color, u_mouse.x);
    color = sophisticatedContrast(color, u_mouse.y);
    gl_FragColor = vec4(color, 1.0);
}
```

### 3. State Management

#### High-Level Explanation
The "brain" of the application that keeps track of:
- Current video and its state
- Mouse/touch position
- Effect parameters
- Screen dimensions

#### Technical Implementation
```javascript
const createStore = (initialState = {}) => {
    let state = initialState;
    const subscribers = new Set();

    return {
        getState: () => ({ ...state }),
        setState: (newState) => {
            state = { ...state, ...newState };
            subscribers.forEach(callback => callback(getState()));
        },
        subscribe: (callback) => {
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        }
    };
};

const initialState = {
    isSpaceMode: false,
    isTimeMode: false,
    dividerPosition: 50,
    mouse: {
        x: 0.5,
        y: 0.5,
        velocity: 0
    },
    videoSources: [
        'vid/C0008.MP4_Rendered_001.mp4',
        'vid/C0016.MP4_Rendered_001.mp4',
        'vid/C0014.MP4_Rendered_001.mp4',
        'vid/C0022.MP4_Rendered_001.mp4'
    ]
    // ... additional state properties ...
};
```

### 4. Color Effects

#### High-Level Explanation
Two main effects:
1. Color Temperature
   - Left = cooler/bluer
   - Right = warmer/orange
2. Contrast
   - Bottom = flat
   - Top = dramatic

#### Technical Implementation
```glsl
vec3 colorGrade(vec3 color, float temperature) {
    vec3 coolHighlights = vec3(0.85, 0.95, 1.15);
    vec3 coolShadows = vec3(0.85, 0.95, 1.1);
    vec3 warmHighlights = vec3(1.15, 0.95, 0.85);
    vec3 warmShadows = vec3(1.1, 0.95, 0.85);
    
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    
    vec3 highlights = mix(
        coolHighlights,
        warmHighlights,
        smoothstep(0.2, 0.8, temperature)
    );
    
    vec3 shadows = mix(
        coolShadows,
        warmShadows,
        smoothstep(0.2, 0.8, temperature)
    );
    
    vec3 highlightAdjust = mix(vec3(1.0), highlights, smoothstep(0.4, 0.9, luminance));
    vec3 shadowAdjust = mix(vec3(1.0), shadows, smoothstep(0.8, 0.2, luminance));
    
    return color * highlightAdjust * shadowAdjust;
}

vec3 sophisticatedContrast(vec3 color, float contrastLevel) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float invertedContrast = 1.0 - contrastLevel;
    float basicContrast = mix(0.95, 1.05, invertedContrast);
    float lift = mix(-0.02, 0.01, invertedContrast);
    float gamma = mix(1.02, 0.98, invertedContrast);
    float gain = mix(0.98, 1.02, invertedContrast);
    
    color = pow(max(vec3(0.0), color + lift), vec3(1.0 / gamma)) * gain;
    
    float highlightCompress = mix(1.02, 0.98, invertedContrast);
    vec3 highlights = smoothstep(0.8, 0.95, color);
    color = mix(color, pow(color, vec3(highlightCompress)), highlights);
    
    return color;
}
```

## Performance Optimization

### Key Strategies
1. **Texture Management**
   ```javascript
   // Efficient texture updates
   if (video.readyState >= video.HAVE_CURRENT_DATA) {
       gl.activeTexture(gl.TEXTURE0);
       gl.bindTexture(gl.TEXTURE_2D, textures.videoTexture);
       gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
   }
   ```

2. **State Updates**
   - Minimized state changes
   - Efficient subscriber notifications
   - Batched updates when possible

3. **Render Loop**
   ```javascript
   const render = (timestamp) => {
       // Skip if components aren't ready
       if (!gl || !program || !uniforms || !textures || !video) return;
       
       // Update only when needed
       if (video.readyState >= video.HAVE_CURRENT_DATA) {
           // ... render code ...
       }
       
       requestAnimationFrame(render);
   };
   ```

## Troubleshooting

### Common Issues and Solutions

1. **Performance Issues**
   ```javascript
   // Add performance monitoring
   const performanceMonitor = {
       lastTime: 0,
       frameCount: 0,
       fps: 0,
       
       update(timestamp) {
           this.frameCount++;
           if (timestamp - this.lastTime >= 1000) {
               this.fps = this.frameCount;
               this.frameCount = 0;
               this.lastTime = timestamp;
               console.log(`Current FPS: ${this.fps}`);
           }
       }
   };
   ```

2. **Video Loading**
   ```javascript
   video.onerror = (err) => {
       console.error('Video loading error:', {
           error: err,
           networkState: video.networkState,
           readyState: video.readyState
       });
   };
   ```

## Resources for Learning

### WebGL and Graphics
- [WebGL Fundamentals](https://webglfundamentals.org/)
- [The Book of Shaders](https://thebookofshaders.com/)
- [Learn OpenGL](https://learnopengl.com/)

### Color Theory and Image Processing
- [Color Grading Theory](https://www.videomaker.com/article/c10/14221-color-correction-and-color-grading-whats-the-difference)
- [Digital Image Processing](https://www.cambridge.org/core/books/digital-image-processing/D78FAA85F3B64BA0F97C85C8A01E0AFD)

### Interactive Examples
- [Shadertoy](https://www.shadertoy.com/)
- [WebGL Examples](https://webgl2fundamentals.org/webgl/lessons/webgl-fundamentals.html)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License. 