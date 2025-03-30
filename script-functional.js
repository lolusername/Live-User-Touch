(() => {
    'use strict';

    /**
     * SECTION 1: GLOBAL VARIABLES AND CONFIGURATION
     * These variables control the overall state and behavior of our WebGL application
     */
    let isSpaceMode = false;      // Controls split-screen mode
    let isTimeMode = false;       // Controls time-based effects
    let dividerPosition = 50;     // Position of the screen divider (in percentage)
    let uniforms;                 // Will store our shader uniform locations
    const FRAME_INTERVAL = 1000 / 30;  // Target 30 FPS
    let lastRenderTime = 0;       // Timestamp of last render
    let lastVideoTime = 0;        // Timestamp of last video frame
    const videoTimestamps = new Map();  // Stores video timing information
    let mediaSources = [];        // Array of video sources
    let currentTexture = null;    // Current active texture
    let isImageLoaded = false;    // Flag for image loading status
    let mediaSizeLocation;        // WebGL uniform location for media size

    /**
     * SECTION 2: SHADER CODE
     * Shaders are special programs that run on the GPU
     * - Vertex Shader: Processes vertices (positions) of our geometry
     * - Fragment Shader: Processes pixels and determines their colors
     */
    const vertexShaderSource = `
        // Precision qualifier - defines floating point precision
        precision mediump float;
        
        // Input vertex position from our JavaScript code
        attribute vec4 a_position;
        
        // Input uniforms (global variables) from JavaScript
        uniform vec2 u_resolution;    // Screen resolution
        uniform vec2 u_mediaSize;     // Size of our media (video/image)
        
        // Output variable to fragment shader
        varying vec2 v_texCoord;      // Texture coordinates
        
        void main() {
            // Keep vertex position as is (we're drawing a simple quad)
            gl_Position = a_position;
            
            // Calculate aspect ratios for proper scaling
            float screenAspect = u_resolution.x / u_resolution.y;
            float mediaAspect = u_mediaSize.x / u_mediaSize.y;
            
            // Convert position to texture coordinates (0 to 1 range)
            vec2 texCoord = vec2((a_position.x + 1.0) / 2.0, (1.0 - a_position.y) / 2.0);
            
            // Calculate scaling to maintain aspect ratio
            vec2 scale = vec2(1.0);
            if (screenAspect > mediaAspect) {
                scale.x = mediaAspect / screenAspect;  // Fit to height
            } else {
                scale.y = screenAspect / mediaAspect;  // Fit to width
            }
            
            // Apply scaling from center
            texCoord = (texCoord - 0.5) * (1.0 / scale) + 0.5;
            
            v_texCoord = texCoord;
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;
        
        // Input textures and uniforms
        uniform sampler2D u_videoTexture;    // Main video texture
        uniform sampler2D u_webcamTexture;   // Webcam texture
        uniform bool u_isSpaceMode;          // Split screen mode flag
        uniform bool u_isTimeMode;           // Time blend mode flag
        uniform float u_dividerPosition;      // Split screen divider position
        uniform vec2 u_resolution;           // Screen resolution
        uniform vec2 u_mediaSize;            // Media size
        uniform vec2 u_mouse;               // Mouse position (for interactive effects)
        
        // Input from vertex shader
        varying vec2 v_texCoord;

        /**
         * Helper function to check if texture coordinates are valid (between 0 and 1)
         */
        bool isValidTexCoord(vec2 coord) {
            return coord.x >= 0.0 && coord.x <= 1.0 && 
                   coord.y >= 0.0 && coord.y <= 1.0;
        }

        /**
         * Advanced contrast adjustment function using ACES-inspired curve
         */
        vec3 sophisticatedContrast(vec3 color, float contrastLevel) {
            // Calculate luminance using standard coefficients
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            
            // Invert contrast for more intuitive control
            float invertedContrast = 1.0 - contrastLevel;
            
            // Apply professional grade adjustments
            float basicContrast = mix(0.95, 1.05, invertedContrast);
            float lift = mix(-0.02, 0.01, invertedContrast);
            float gamma = mix(1.02, 0.98, invertedContrast);
            float gain = mix(0.98, 1.02, invertedContrast);
            
            // Apply color adjustments
            color = pow(max(vec3(0.0), color + lift), vec3(1.0 / gamma)) * gain;
            
            // Natural highlight rolloff
            float highlightCompress = mix(1.02, 0.98, invertedContrast);
            vec3 highlights = smoothstep(0.8, 0.95, color);
            color = mix(color, pow(color, vec3(highlightCompress)), highlights);
            
            // Saturation compensation
            float saturationCompensation = mix(1.02, 0.98, invertedContrast);
            vec3 desaturated = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
            color = mix(desaturated, color, saturationCompensation);
            
            return color;
        }

        /**
         * Color temperature adjustment function
         */
        vec3 colorGrade(vec3 color, float temperature) {
            // Define color temperature matrices
            vec3 coolHighlights = vec3(0.85, 0.95, 1.15);
            vec3 coolShadows = vec3(0.85, 0.95, 1.1);
            vec3 warmHighlights = vec3(1.15, 0.95, 0.85);
            vec3 warmShadows = vec3(1.1, 0.95, 0.85);
            
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            
            // Interpolate between cool and warm colors
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
            
            // Apply adjustments based on luminance
            vec3 highlightAdjust = mix(vec3(1.0), highlights, smoothstep(0.4, 0.9, luminance));
            vec3 shadowAdjust = mix(vec3(1.0), shadows, smoothstep(0.8, 0.2, luminance));
            
            return color * highlightAdjust * shadowAdjust;
        }

        void main() {
            // Validate texture coordinates
            if (!isValidTexCoord(v_texCoord)) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);  // Black for invalid coordinates
                return;
            }

            // Sample colors from both textures
            vec3 videoColor = texture2D(u_videoTexture, v_texCoord).rgb;
            vec3 webcamColor = texture2D(u_webcamTexture, vec2(1.0 - v_texCoord.x, v_texCoord.y)).rgb;

            // Apply color grading and contrast
            videoColor = colorGrade(videoColor, u_mouse.x);
            videoColor = sophisticatedContrast(videoColor, u_mouse.y);
            
            webcamColor = colorGrade(webcamColor, u_mouse.x);
            webcamColor = sophisticatedContrast(webcamColor, u_mouse.y);
            
            // Handle different display modes
            if (u_isSpaceMode && gl_FragCoord.x > u_resolution.x / 2.0) {
                discard;  // Don't render right half in space mode
            }
            
            if (u_isSpaceMode) {
                gl_FragColor = vec4(videoColor, 1.0);
            } else if (u_isTimeMode) {
                gl_FragColor = vec4(mix(videoColor, webcamColor, 0.5), 1.0);  // Blend videos
            } else {
                gl_FragColor = vec4(videoColor, 1.0);
            }
        }
    `;

    /**
     * SECTION 3: STATE MANAGEMENT
     * Implementation of a simple reactive store pattern for managing application state
     */
    const createStore = (initialState = {}) => {
        let state = initialState;
        const subscribers = new Set();  // Set of callback functions

        // Get current state (returns a copy to prevent direct mutation)
        const getState = () => ({ ...state });
        
        // Update state and notify subscribers
        const setState = (newState) => {
            state = { ...state, ...newState };
            subscribers.forEach(callback => callback(getState()));
        };

        // Add a subscriber callback
        const subscribe = (callback) => {
            subscribers.add(callback);
            return () => subscribers.delete(callback);  // Return unsubscribe function
        };

        return { getState, setState, subscribe };
    };

    /**
     * SECTION 4: APPLICATION STATE
     * Initial state configuration for our WebGL application
     */
    const initialState = {
        isSpaceMode: false,           // Split screen mode
        isTimeMode: false,            // Time-based effects
        dividerPosition: 50,          // Screen divider position
        lastVideoTime: 0,             // Last video timestamp
        currentVideoIndex: 0,         // Current video index
        isImageLoaded: false,         // Image loading status
        mouse: {                      // Mouse state
            x: 0.5,                   // Normalized X position (0-1)
            y: 0.5,                   // Normalized Y position (0-1)
            lastX: 0,                 // Previous X position
            lastY: 0,                 // Previous Y position
            velocity: 0,              // Mouse movement velocity
            lastTime: 0               // Last update timestamp
        },
        videoSources: [               // Video file paths
            'vid/C0008.MP4_Rendered_001.mp4',
            'vid/C0016.MP4_Rendered_001.mp4',
            'vid/C0014.MP4_Rendered_001.mp4',
            'vid/C0022.MP4_Rendered_001.mp4'
        ],
        mediaSources: [],            // Loaded media elements
        currentTexture: null,        // Current WebGL texture
        video: null,                 // Main video element
        webcamVideo: null,           // Webcam video element
        webcamStream: null,          // Webcam media stream
        gl: null,                    // WebGL context
        program: null,               // Compiled shader program
        uniforms: null,              // Shader uniform locations
        textures: null,              // WebGL textures
        videoTimestamps: new Map()   // Video timing data
    };

    // Create our application state store
    const store = createStore(initialState);

    /**
     * SECTION 5: INPUT HANDLING
     * Functions for processing user input (mouse/touch)
     */
    const updateMousePosition = (e, canvas) => {
        const currentTime = performance.now();
        const state = store.getState();
        const { mouse } = state;
        
        // Safely handle both mouse and touch events
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        // Convert screen coordinates to normalized coordinates (0-1)
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        
        // Calculate movement velocity for effects
        const deltaTime = (currentTime - mouse.lastTime) / 1000;
        const dx = clientX - mouse.lastX;
        const dy = clientY - mouse.lastY;
        const velocity = Math.min(Math.sqrt(dx*dx + dy*dy) / deltaTime / 1000, 1.0);
        
        // Update mouse state
        store.setState({
            mouse: {
                ...mouse,
                lastX: clientX,
                lastY: clientY,
                x: Math.max(0, Math.min(1, x)),         // Clamp X to 0-1
                y: Math.max(0, Math.min(1, 1 - y)),     // Invert and clamp Y to 0-1
                lastTime: currentTime,
                velocity
            }
        });
    };

    /**
     * SECTION 6: WEBGL SETUP
     * Helper functions for initializing WebGL
     */
    const createShader = (gl, type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        // Check for compilation errors
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    /**
     * Creates and configures a video element
     */
    const createVideoElement = (src) => {
        const video = document.createElement('video');
        video.src = src;
        video.crossOrigin = 'anonymous';     // Enable CORS
        video.loop = false;                  // Disable looping
        video.muted = true;                  // Mute for autoplay
        video.autoplay = true;              // Enable autoplay
        video.playsInline = true;           // Better mobile support
        video.style.display = 'none';       // Hide video element
        document.body.appendChild(video);
        return video;
    };

    /**
     * Loads media into WebGL textures
     */
    const loadMedia = (index) => {
        const state = store.getState();
        const { videoSources, video, gl, textures, uniforms } = state;
        
        if (!videoSources || !videoSources.length) {
            console.warn('No video sources available');
            return;
        }

        const videoUrl = videoSources[index];
        if (!video) {
            console.warn('No video element available');
            return;
        }

        console.log('Loading video:', videoUrl);

        // Update video source if needed
        if (!video.src || video.src !== videoUrl) {
            video.pause();
            video.src = videoUrl;
            video.style.display = 'block';
        }
        
        // Handle video load completion
        video.onloadeddata = () => {
            console.log('Video loaded, setting up texture');
            store.setState({ isImageLoaded: true });
            
            if (gl && textures && uniforms) {
                // Update texture with video dimensions
                gl.uniform2f(uniforms.mediaSize, video.videoWidth, video.videoHeight);
                gl.bindTexture(gl.TEXTURE_2D, textures.videoTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                
                // Configure texture parameters
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            }
            
            // Start playback
            video.play().catch(err => {
                console.error('Error playing video:', err);
            });
        };

        // Handle video end
        video.onended = () => {
            const currentIndex = state.currentVideoIndex;
            const nextIndex = (currentIndex + 1) % videoSources.length;
            
            store.setState({ currentVideoIndex: nextIndex });
            loadMedia(nextIndex);
        };

        // Handle errors
        video.onerror = (err) => {
            console.error('Error loading video:', err);
        };
    };

    /**
     * SECTION 7: WEBGL INITIALIZATION
     * Sets up the WebGL context and initializes all necessary components
     */
    const initWebGL = () => {
        const canvas = document.getElementById('glCanvas');
        
        /**
         * Handles canvas resizing for high-DPI displays
         * Ensures proper rendering on all screen types
         */
        const handleResize = () => {
            const canvas = document.getElementById('glCanvas');
            const gl = canvas.getContext('webgl');
            
            // Calculate proper canvas size for high-DPI displays
            const pixelRatio = window.devicePixelRatio || 1;
            const container = canvas.parentElement;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            // Set physical pixel dimensions
            const displayWidth = Math.floor(containerWidth * pixelRatio);
            const displayHeight = Math.floor(containerHeight * pixelRatio);
            
            // Update canvas size if dimensions have changed
            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                // Update buffer size
                canvas.width = displayWidth;
                canvas.height = displayHeight;
                
                // Update CSS size
                canvas.style.width = containerWidth + 'px';
                canvas.style.height = containerHeight + 'px';
                
                // Update WebGL viewport
                gl.viewport(0, 0, displayWidth, displayHeight);
                
                // Update shader uniforms
                const state = store.getState();
                if (state.uniforms && state.video) {
                    gl.useProgram(state.program);
                    gl.uniform2f(state.uniforms.resolution, displayWidth, displayHeight);
                    
                    // Calculate proper aspect ratio
                    const videoAspect = state.video.videoWidth / state.video.videoHeight;
                    const screenAspect = displayWidth / displayHeight;
                    
                    let mediaWidth, mediaHeight;
                    if (screenAspect > videoAspect) {
                        // Fit to height if screen is wider
                        mediaHeight = displayHeight;
                        mediaWidth = displayHeight * videoAspect;
                    } else {
                        // Fit to width if screen is taller
                        mediaWidth = displayWidth;
                        mediaHeight = displayWidth / videoAspect;
                    }
                    
                    gl.uniform2f(state.uniforms.mediaSize, mediaWidth, mediaHeight);
                }
            }
        };

        // Initial resize call
        handleResize();
        
        // Listen for window resize events
        window.addEventListener('resize', handleResize);

        // Initialize WebGL context
        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.error('WebGL not supported');
            return false;
        }

        // Create and compile shaders
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        // Create shader program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        // Check for program compilation errors
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return false;
        }

        /**
         * Sets up vertex buffers for rendering
         * Creates a simple quad (two triangles) that covers the screen
         */
        const setupBuffers = () => {
            const positions = new Float32Array([
                -1, -1,  1, -1,  -1, 1,    // First triangle
                -1,  1,  1, -1,   1, 1     // Second triangle
            ]);

            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

            const positionLocation = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        };

        /**
         * Sets up textures for video and webcam
         * Configures texture parameters for optimal rendering
         */
        const setupTextures = () => {
            // Create and configure video texture
            const videoTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            // Create and configure webcam texture
            const webcamTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            return { videoTexture, webcamTexture };
        };

        // Initialize buffers and textures
        setupBuffers();
        const textures = setupTextures();

        // Get uniform locations from shader program
        const uniforms = {
            videoTexture: gl.getUniformLocation(program, 'u_videoTexture'),
            webcamTexture: gl.getUniformLocation(program, 'u_webcamTexture'),
            isSpaceMode: gl.getUniformLocation(program, 'u_isSpaceMode'),
            isTimeMode: gl.getUniformLocation(program, 'u_isTimeMode'),
            dividerPosition: gl.getUniformLocation(program, 'u_dividerPosition'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            mediaSize: gl.getUniformLocation(program, 'u_mediaSize'),
            mouse: gl.getUniformLocation(program, 'u_mouse')
        };

        // Create video element and update state
        const video = createVideoElement(store.getState().videoSources[0]);
        
        store.setState({
            gl,
            program,
            uniforms,
            textures,
            video
        });

        return true;
    };

    /**
     * SECTION 8: RENDER LOOP
     * Main rendering function that runs every animation frame
     */
    const render = (timestamp) => {
        const state = store.getState();
        const { gl, program, uniforms, textures, mouse, video, webcamVideo } = state;

        // Skip render if required components aren't ready
        if (!gl || !program || !uniforms || !textures || !video) return;

        // Set up viewport and clear
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use our shader program
        gl.useProgram(program);

        // Update uniforms
        gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
        gl.uniform1i(uniforms.isSpaceMode, state.isSpaceMode ? 1 : 0);
        gl.uniform1i(uniforms.isTimeMode, state.isTimeMode ? 1 : 0);
        gl.uniform1f(uniforms.dividerPosition, state.dividerPosition / 100);

        // Update video texture if video is ready
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textures.videoTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        }

        // Update webcam texture if available and ready
        if (webcamVideo && webcamVideo.readyState >= webcamVideo.HAVE_CURRENT_DATA) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, textures.webcamTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webcamVideo);
        }

        // Draw the scene
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Request next frame
        requestAnimationFrame(render);
    };

    /**
     * SECTION 9: APPLICATION INITIALIZATION
     * Sets up the application and starts the render loop
     */
    const init = async () => {
        console.log('Initializing application...');
        
        if (!initWebGL()) {
            console.error('Failed to initialize WebGL');
            return;
        }

        const state = store.getState();
        const { gl, video } = state;

        // Set up mouse/touch event handlers
        window.addEventListener('mousemove', (e) => updateMousePosition(e, gl.canvas));

        // Handle touch events
        window.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            updateMousePosition(e, gl.canvas);
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent scrolling
            updateMousePosition(e, gl.canvas);
        }, { passive: false });

        // Handle window resize
        window.addEventListener('resize', () => {
            const state = store.getState();
            const { gl } = state;
            handleResize();
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        });

        // Set up keyboard controls for video cycling
        window.addEventListener('keydown', (e) => {
            const state = store.getState();
            const { currentVideoIndex, videoSources } = state;
            
            if (e.key === 'ArrowRight') {
                const nextIndex = (currentVideoIndex + 1) % videoSources.length;
                store.setState({ currentVideoIndex: nextIndex });
                loadMedia(nextIndex);
            } else if (e.key === 'ArrowLeft') {
                const prevIndex = (currentVideoIndex - 1 + videoSources.length) % videoSources.length;
                store.setState({ currentVideoIndex: prevIndex });
                loadMedia(prevIndex);
            }
        });

        // Start loading first video and begin render loop
        loadMedia(0);
        requestAnimationFrame(render);
    };

    // Initialize application when window loads
    window.addEventListener('load', () => {
        console.log('Window loaded, starting initialization...');
        init();
    });

    // Handle device orientation changes
    window.addEventListener('orientationchange', () => {
        handleResize();
    });
})(); 