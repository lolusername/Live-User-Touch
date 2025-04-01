# LUT: Live User Touch

Welcome to LUT, an interactive video art installation that explores the relationship between human interaction and digital media. Inspired by Look-Up Tables (LUTs) used in professional color grading, this project transforms ordinary videos into dynamic, responsive artworks that change based on your movements. Just as a colorist uses LUTs to create specific moods and atmospheres in films, you can now create your own color grading effects in real-time through touch and movement.

## What Is This?

LUT is an interactive video installation that responds to your presence. Think of it as a digital canvas where:
- Videos become living, breathing entities that react to your movements
- Your mouse or touch becomes a paintbrush that alters the emotional tone of the visuals
- The experience is unique to each viewer's interaction
- You become the colorist, creating your own look-up tables through movement

## How to Use It

1. **Start the Experience**
   - Open the webpage in your browser
   - Wait for the video to load
   - You'll see a video playing in the center of the screen

2. **Interact with the Art**
   - Move your mouse or finger left and right:
     - Moving left makes the colors cooler (more blue) - like applying a cool LUT
     - Moving right makes the colors warmer (more orange) - like applying a warm LUT
   - Move up and down:
     - Moving up increases contrast (makes brights brighter, darks darker) - like increasing contrast in color grading
     - Moving down reduces contrast (makes everything more even) - like flattening the image
   - Use left/right arrow keys to switch between different videos

3. **Experiment and Play**
   - Try different combinations of movements
   - Notice how your interactions change the mood of the video
   - Each video responds differently to your touch
   - Create your own unique color grading style

## The Artistic Concept

This project explores several key ideas in digital art and media:

### 1. Interactive Art
- Traditional art is static; digital art can be dynamic
- The viewer becomes a participant in creating the artwork
- Each interaction creates a unique experience
- You become both the colorist and the audience

### 2. Color and Emotion
- Colors have psychological effects on viewers
- Warm colors (orange/red) often evoke feelings of energy and passion
- Cool colors (blue) often create feelings of calm and contemplation
- By controlling color temperature, you're essentially "painting" with emotions
- Each movement creates a new color grading look-up table

### 3. Contrast and Drama
- Contrast in art creates visual hierarchy
- High contrast draws attention to specific elements
- Low contrast creates a more unified, peaceful feeling
- Your vertical movements control this dramatic tension
- Like adjusting contrast in professional color grading

### 4. Digital Transformation
- This project shows how digital technology can transform ordinary media
- Videos become interactive canvases
- Human movement becomes a creative tool
- The line between viewer and creator becomes blurred
- Real-time color grading becomes an interactive experience

## Technical Background (For the Curious)

This project uses WebGL, a technology that allows web browsers to create complex graphics. Think of it as a digital paintbrush that can:
- Process video in real-time
- Apply color effects instantly (like a real-time LUT)
- Respond to user input immediately
- Create dynamic look-up tables based on movement

### How It Works

The technology works through several key components:

1. **WebGL Setup and Video Processing**
```javascript
// Create WebGL context - this gives us access to the GPU
const gl = canvas.getContext('webgl');

// Create a texture object to hold our video frame
const videoTexture = gl.createTexture();

// Bind the texture to make it the active texture
gl.bindTexture(gl.TEXTURE_2D, videoTexture);

// Copy the current video frame into the texture
// RGBA means we're using red, green, blue, and alpha (transparency) channels
// UNSIGNED_BYTE means each color channel is 0-255
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
```

2. **Shader Programs**
```glsl
// Vertex Shader: Handles the position and texture coordinates of each pixel
// This runs once for each vertex (corner) of our rectangle
attribute vec4 a_position;    // The position of the vertex (x, y, z, w)
attribute vec2 a_texCoord;    // The texture coordinate (u, v) for this vertex
varying vec2 v_texCoord;      // Pass texture coordinates to fragment shader

void main() {
    gl_Position = a_position;  // Set the final position of the vertex
    v_texCoord = a_texCoord;  // Pass texture coordinates to fragment shader
}

// Fragment Shader: Applies color effects to each pixel
// This runs once for each pixel in our rectangle
uniform sampler2D u_image;     // The video texture
uniform vec2 u_resolution;     // The size of our canvas
uniform float u_temperature;   // How warm/cool the colors should be (-1 to 1)
uniform float u_contrast;      // How much contrast to apply (0.5 to 1.5)
varying vec2 v_texCoord;       // Texture coordinates from vertex shader

void main() {
    // Get the color of the current pixel from the video
    vec4 color = texture2D(u_image, v_texCoord);
    
    // Apply temperature (warm/cool)
    // Adding to red and subtracting from blue creates warm/cool effect
    color.r += u_temperature;  // Red channel
    color.b -= u_temperature;  // Blue channel
    
    // Apply contrast
    // First subtract 0.5 to center around 0, then multiply by contrast
    // Finally add 0.5 back to get back to 0-1 range
    color = (color - 0.5) * u_contrast + 0.5;
    
    // Output the final color
    gl_FragColor = color;
}
```

3. **Real-time Color Manipulation**
```javascript
// Update shader uniforms based on mouse position
function updateEffects(mouseX, mouseY) {
    // Calculate temperature (-1 to 1) based on horizontal position
    // mouseX / window.innerWidth gives us 0 to 1
    // Multiply by 2 and subtract 1 to get -1 to 1
    const temperature = (mouseX / window.innerWidth) * 2 - 1;
    
    // Calculate contrast (0.5 to 1.5) based on vertical position
    // mouseY / window.innerHeight gives us 0 to 1
    // Add 0.5 to get 0.5 to 1.5 range
    const contrast = 1.0 + (mouseY / window.innerHeight);
    
    // Update shader uniforms with new values
    // These values will be used in the next frame render
    gl.uniform1f(u_temperatureLocation, temperature);
    gl.uniform1f(u_contrastLocation, contrast);
}
```

### The Color Grading Pipeline

1. **Input Processing**
   - Video frames are captured and converted to WebGL textures
   - Each frame is processed in real-time through our shader pipeline
   - The texture coordinates (u, v) map each pixel to the correct position in the video

2. **Color Transformation**
   - Temperature adjustment: 
     - Positive values add red and subtract blue (warm)
     - Negative values add blue and subtract red (cool)
   - Contrast adjustment:
     - Values > 1 increase the difference between light and dark
     - Values < 1 decrease the difference
     - The formula (color - 0.5) * contrast + 0.5 preserves the middle gray

3. **Output Rendering**
   - Processed frames are rendered back to the canvas
   - The result is displayed instantly with no perceptible delay
   - Each pixel's color is calculated independently by the GPU

### Performance Optimization

The project uses several techniques to ensure smooth performance:
- GPU-accelerated processing through WebGL
  - All color calculations happen on the GPU
  - Each pixel is processed in parallel
- Efficient texture management
  - Video frames are uploaded to GPU once per frame
  - Texture coordinates are reused
- Optimized shader calculations
  - Minimal mathematical operations per pixel
  - Efficient use of GPU registers
- RequestAnimationFrame for smooth animation
  - Synchronizes with screen refresh rate
  - Prevents unnecessary frame renders

### Technical Requirements

To run this project, you need:
- A modern web browser with WebGL support
- JavaScript enabled
- Sufficient GPU capabilities for real-time video processing
- Modern hardware for optimal performance

### How It Differs from Traditional LUTs

Traditional Look-Up Tables (LUTs) are static color transformations applied during post-production. This project:
- Creates dynamic, real-time LUTs based on user interaction
- Allows for immediate visual feedback
- Combines multiple color transformations simultaneously
- Provides an interactive, experimental approach to color grading

## Tips for Best Experience

1. **Environment**
   - Use a modern web browser (Chrome, Firefox, or Safari)
   - Ensure your screen brightness is at a comfortable level
   - Consider using headphones for the full experience

2. **Interaction**
   - Start with gentle movements
   - Notice how different videos respond differently
   - Try to create different moods through your movements
   - Experiment with different color grading styles

3. **Exploration**
   - Don't be afraid to experiment
   - Each video offers different possibilities
   - Your unique interaction creates your personal artwork
   - Create your own signature color grading look

## About the Project

LUT was created to explore the intersection of technology and art, demonstrating how digital tools can create new forms of interactive expression. Inspired by Look-Up Tables used in professional color grading, this project brings the power of real-time color manipulation into an interactive experience. It's particularly relevant for:
- Digital art enthusiasts
- Media studies students
- Anyone interested in interactive experiences
- People curious about the future of digital media
- Aspiring colorists and filmmakers

## Getting Started

1. Clone or download this repository
2. Open `index.html` in your web browser
3. Start interacting with the videos
4. Create your own color grading style

## Support

If you encounter any issues or have questions:
1. Check that your browser is up to date
2. Ensure your internet connection is stable
3. Try refreshing the page

## License

This project is open source and available under the MIT License. Feel free to use it for your own artistic explorations or educational purposes. 