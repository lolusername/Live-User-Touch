# Interactive WebGL Graphics Programming Guide

This project demonstrates fundamental concepts of graphics programming in the browser using WebGL. It's designed as a learning resource for beginners while showcasing advanced techniques for creating interactive visual experiences.

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
4. [Understanding WebGL](#understanding-webgl)
5. [Shaders Explained](#shaders-explained)
6. [State Management](#state-management)
7. [Interactive Features](#interactive-features)
8. [Advanced Topics](#advanced-topics)

## Core Concepts

### What is WebGL?
WebGL (Web Graphics Library) is a JavaScript API for rendering interactive 2D and 3D graphics in web browsers. It provides direct access to the GPU, allowing for hardware-accelerated rendering.

### Key Components
1. **Canvas**: The HTML element where graphics are rendered
2. **WebGL Context**: The interface to WebGL functionality
3. **Shaders**: Special programs that run on the GPU
4. **Buffers**: Data storage for vertices and other attributes
5. **Textures**: Image data used in rendering

## Project Structure

This project implements an interactive video processing application with the following components:

```
project/
├── index.html          # HTML container and canvas
├── script-functional.js # Main application code
└── styles.css          # Styling
```

### Code Organization
The application is organized into several logical sections:
1. Global Configuration
2. Shader Programs
3. State Management
4. Input Handling
5. WebGL Setup
6. Render Loop

## Getting Started

### Prerequisites
- Modern web browser with WebGL support
- Basic understanding of JavaScript
- Text editor or IDE

### Running the Project
1. Clone the repository
2. Open `index.html` in a web browser
3. Interact using mouse/touch and keyboard controls

## Understanding WebGL

### The Graphics Pipeline
1. **Vertex Processing**: Transforms 3D coordinates to 2D screen space
2. **Rasterization**: Converts vectors to pixels
3. **Fragment Processing**: Determines pixel colors
4. **Output**: Displays final image on screen

### Code Example: Setting Up WebGL
```javascript
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    console.error('WebGL not supported');
    return;
}
```

## Shaders Explained

### Vertex Shader
Processes vertex positions and attributes:
```glsl
attribute vec4 a_position;
uniform vec2 u_resolution;
varying vec2 v_texCoord;

void main() {
    gl_Position = a_position;
    v_texCoord = vec2((a_position.x + 1.0) / 2.0, 
                      (1.0 - a_position.y) / 2.0);
}
```

### Fragment Shader
Processes pixels and determines their colors:
```glsl
precision mediump float;
uniform sampler2D u_videoTexture;
varying vec2 v_texCoord;

void main() {
    vec3 color = texture2D(u_videoTexture, v_texCoord).rgb;
    gl_FragColor = vec4(color, 1.0);
}
```

## State Management

The project uses a reactive store pattern for state management:

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
```

## Interactive Features

### Mouse/Touch Input
The application responds to user input for:
- Color temperature adjustment (X-axis)
- Contrast control (Y-axis)
- Video cycling (arrow keys)

### Responsive Design
- Handles window resizing
- Supports high-DPI displays
- Works on both desktop and mobile

## Advanced Topics

### Color Grading
The application implements professional-grade color adjustments:
```glsl
vec3 colorGrade(vec3 color, float temperature) {
    // Cool/warm color adjustments
    vec3 coolHighlights = vec3(0.85, 0.95, 1.15);
    vec3 warmHighlights = vec3(1.15, 0.95, 0.85);
    
    // Mix based on temperature
    return mix(coolHighlights, warmHighlights, temperature) * color;
}
```

### Performance Optimization
1. **Texture Management**: Efficient texture updates
2. **State Updates**: Minimized state changes
3. **Render Loop**: Optimized frame rendering
4. **Memory Management**: Proper resource cleanup

## Resources for Learning

### WebGL Fundamentals
- [WebGL Fundamentals](https://webglfundamentals.org/)
- [MDN WebGL Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)

### GLSL (Shader Language)
- [The Book of Shaders](https://thebookofshaders.com/)
- [GLSL Reference](https://www.khronos.org/registry/OpenGL-Refpages/gl4/)

### Graphics Programming
- [Real-Time Rendering](http://www.realtimerendering.com/)
- [Learn OpenGL](https://learnopengl.com/)

## Contributing

Feel free to contribute to this project by:
1. Reporting bugs
2. Suggesting improvements
3. Adding features
4. Improving documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details. 