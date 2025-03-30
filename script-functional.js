(() => {
    'use strict';

    // Global WebGL variables
    let gl, program;
    let videoTexture, webcamTexture;
    let video, webcamVideo, webcamStream;
    let isSpaceMode = false;
    let isTimeMode = false;
    let dividerPosition = 50;
    let uniforms;
    const FRAME_INTERVAL = 1000 / 30;
    let lastRenderTime = 0;
    let lastVideoTime = 0;
    const videoTimestamps = new Map();
    let mediaSources = [];
    let currentTexture = null;
    let isImageLoaded = false;
    let mediaSizeLocation;

    // Shader sources
    const vertexShaderSource = `
        precision mediump float;
        attribute vec2 a_position;
        uniform vec2 u_resolution;
        uniform vec2 u_mediaSize;
        uniform bool u_isSpaceMode;
        varying vec2 v_texCoord;
        
        void main() {
            vec2 position = a_position;
            float viewportAspect = u_resolution.x / u_resolution.y;
            float mediaAspect = u_mediaSize.x / u_mediaSize.y;
            
            if (u_isSpaceMode) {
                viewportAspect *= 0.5;  // Half the viewport aspect in space mode
            }
            
            if (mediaAspect > viewportAspect) {
                position.y *= viewportAspect / mediaAspect;
            } else {
                position.x *= mediaAspect / viewportAspect;
            }
            
            gl_Position = vec4(position, 0, 1);
            v_texCoord = vec2((a_position.x + 1.0) / 2.0, (-a_position.y + 1.0) / 2.0);
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;
        uniform sampler2D u_videoTexture;
        uniform sampler2D u_webcamTexture;
        uniform bool u_isSpaceMode;
        uniform bool u_isTimeMode;
        uniform float u_dividerPosition;
        uniform vec2 u_resolution;
        uniform vec2 u_mediaSize;
        uniform vec2 u_mouse;
        varying vec2 v_texCoord;

        vec3 sophisticatedContrast(vec3 color, float contrastLevel) {
            // Professional contrast adjustment using ACES-like curve
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            
            // Increased contrast range (from 0.95-1.05 to 0.85-1.15)
            float basicContrast = mix(0.85, 1.15, contrastLevel);
            
            // Increased lift/gamma/gain values
            float lift = mix(-0.05, 0.02, contrastLevel);  // Increased from -0.02/0.01
            float gamma = mix(1.1, 0.9, contrastLevel);    // Increased from 1.02/0.98
            float gain = mix(0.95, 1.1, contrastLevel);    // Increased from 0.98/1.02
            
            // Apply LGG adjustments
            color = pow(max(vec3(0.0), color + lift), vec3(1.0 / gamma)) * gain;
            
            // More pronounced highlight rolloff
            float highlightCompress = mix(1.1, 0.9, contrastLevel);  // Increased from 1.02/0.98
            vec3 highlights = smoothstep(0.7, 0.9, color);  // Adjusted range
            color = mix(color, pow(color, vec3(highlightCompress)), highlights);
            
            // Increased saturation compensation
            float saturationCompensation = mix(1.1, 0.9, contrastLevel);  // Increased from 1.02/0.98
            vec3 desaturated = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
            color = mix(desaturated, color, saturationCompensation);
            
            return color;
        }

        vec3 colorGrade(vec3 color, float temperature) {
            // More pronounced color temperature adjustments
            vec3 coolHighlights = vec3(0.85, 0.95, 1.15);  // Increased from 0.98/0.99/1.02
            vec3 coolShadows = vec3(0.85, 0.95, 1.1);     // Increased from 0.97/0.98/1.01
            vec3 warmHighlights = vec3(1.15, 0.95, 0.85);  // Increased from 1.02/0.99/0.98
            vec3 warmShadows = vec3(1.1, 0.95, 0.85);     // Increased from 1.01/0.98/0.97
            
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            
            // Wider temperature transition range
            vec3 highlights = mix(
                coolHighlights,
                warmHighlights,
                smoothstep(0.2, 0.8, temperature)  // Increased range from 0.3/0.7
            );
            
            vec3 shadows = mix(
                coolShadows,
                warmShadows,
                smoothstep(0.2, 0.8, temperature)  // Increased range from 0.3/0.7
            );
            
            // More pronounced highlight and shadow adjustments
            vec3 highlightAdjust = mix(vec3(1.0), highlights, smoothstep(0.4, 0.9, luminance));  // Adjusted range
            vec3 shadowAdjust = mix(vec3(1.0), shadows, smoothstep(0.8, 0.2, luminance));       // Adjusted range
            
            return color * highlightAdjust * shadowAdjust;
        }

        void main() {
            vec2 texCoord = v_texCoord;
            
            float viewportAspect = u_resolution.x / u_resolution.y;
            float mediaAspect = u_mediaSize.x / u_mediaSize.y;
            
            if (mediaAspect > viewportAspect) {
                float scale = viewportAspect / mediaAspect;
                texCoord.y = (texCoord.y - 0.5) * scale + 0.5;
            } else {
                float scale = mediaAspect / viewportAspect;
                texCoord.x = (texCoord.x - 0.5) * scale + 0.5;
            }
            
            vec3 videoColor = texture2D(u_videoTexture, texCoord).rgb;
            vec3 webcamColor = texture2D(u_webcamTexture, vec2(1.0 - texCoord.x, texCoord.y)).rgb;

            videoColor = colorGrade(videoColor, u_mouse.x);
            videoColor = sophisticatedContrast(videoColor, u_mouse.y);
            
            webcamColor = colorGrade(webcamColor, u_mouse.x);
            webcamColor = sophisticatedContrast(webcamColor, u_mouse.y);
            
            if (u_isSpaceMode && gl_FragCoord.x > u_resolution.x / 2.0) {
                discard;
            }
            
            if (u_isSpaceMode) {
                gl_FragColor = vec4(videoColor, 1.0);
            } else if (u_isTimeMode) {
                gl_FragColor = vec4(mix(videoColor, webcamColor, 0.5), 1.0);
            } else {
                gl_FragColor = vec4(videoColor, 1.0);
            }
        }
    `;

    // State management using a reactive store
    const createStore = (initialState = {}) => {
        let state = initialState;
        const subscribers = new Set();

        const getState = () => ({ ...state });
        
        const setState = (newState) => {
            state = { ...state, ...newState };
            subscribers.forEach(callback => callback(getState()));
        };

        const subscribe = (callback) => {
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        };

        return { getState, setState, subscribe };
    };

    // Initial state
    const initialState = {
        isSpaceMode: false,
        isTimeMode: false,
        dividerPosition: 50,
        lastVideoTime: 0,
        currentVideoIndex: 0,
        isImageLoaded: false,
        mouse: {
            x: 0.5,
            y: 0.5,
            lastX: 0,
            lastY: 0,
            velocity: 0,
            lastTime: 0
        },
        videoSources: [
            'vid/C0008.MP4_Rendered_001.mp4',
            'vid/C0016.MP4_Rendered_001.mp4',
            'vid/C0014.MP4_Rendered_001.mp4',
            'vid/C0022.MP4_Rendered_001.mp4'
        ],
        mediaSources: [],
        currentTexture: null,
        video: null,
        webcamVideo: null,
        webcamStream: null,
        gl: null,
        program: null,
        uniforms: null,
        textures: null,
        videoTimestamps: new Map()
    };

    const store = createStore(initialState);

    // Pure functions for state updates
    const updateMousePosition = (e, canvas) => {
        const currentTime = performance.now();
        const state = store.getState();
        const { mouse } = state;
        
        const deltaTime = (currentTime - mouse.lastTime) / 1000;
        const dx = e.clientX - mouse.lastX;
        const dy = e.clientY - mouse.lastY;
        const velocity = Math.min(Math.sqrt(dx*dx + dy*dy) / deltaTime / 1000, 1.0);
        
        store.setState({
            mouse: {
                ...mouse,
                lastX: e.clientX,
                lastY: e.clientY,
                x: e.clientX / canvas.width,
                y: 1 - e.clientY / canvas.height,
                lastTime: currentTime,
                velocity
            }
        });
    };

    // Pure function for shader creation
    const createShader = (gl, type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };

    // Pure function for video element creation
    const createVideoElement = (src) => {
        const video = document.createElement('video');
        video.src = src;
        video.crossOrigin = 'anonymous';
        video.loop = false;  // Disable looping
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.style.display = 'none';
        document.body.appendChild(video);
        return video;
    };

    // Event handlers using reactive state
    const handleModeChange = (mode) => {
        store.setState({
            isSpaceMode: mode === 'space',
            isTimeMode: mode === 'time'
        });
    };

    const handleWebcamToggle = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            });
            
            const webcamVideo = document.getElementById('webcamVideo');
            webcamVideo.srcObject = stream;
            webcamVideo.play();
            
            store.setState({
                webcamStream: stream,
                isSpaceMode: true,
                isTimeMode: false
            });
            
        } catch (err) {
            console.error('Webcam error:', err);
            alert('Could not access webcam');
        }
    };

    // Pure function for media loading
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

        if (!video.src || video.src !== videoUrl) {
            video.pause();
            video.src = videoUrl;
            video.style.display = 'block';
        }
        
        video.onloadeddata = () => {
            console.log('Video loaded, setting up texture');
            store.setState({ isImageLoaded: true });
            
            if (gl && textures && uniforms) {
                gl.uniform2f(uniforms.mediaSize, video.videoWidth, video.videoHeight);
                gl.bindTexture(gl.TEXTURE_2D, textures.videoTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            }
            
            video.play().catch(err => {
                console.error('Error playing video:', err);
            });
        };

        video.onended = () => {
            // Get current index and increment it
            const currentIndex = state.currentVideoIndex;
            const nextIndex = (currentIndex + 1) % videoSources.length;
            
            // Update state and load next video
            store.setState({ currentVideoIndex: nextIndex });
            loadMedia(nextIndex);
        };

        video.onerror = (err) => {
            console.error('Error loading video:', err);
        };
    };

    // Initialize WebGL with reactive state
    const initWebGL = () => {
        const canvas = document.getElementById('glCanvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.error('WebGL not supported');
            return false;
        }

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return false;
        }

        const setupBuffers = () => {
            const positions = new Float32Array([
                -1, -1, 1, -1, -1, 1,
                -1, 1, 1, -1, 1, 1,
            ]);

            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

            const positionLocation = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        };

        const setupTextures = () => {
            const videoTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            const webcamTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            return { videoTexture, webcamTexture };
        };

        setupBuffers();
        const textures = setupTextures();

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

    // Render loop with reactive state
    const render = (timestamp) => {
        const state = store.getState();
        const { gl, program, uniforms, textures, mouse, video, webcamVideo } = state;

        if (!gl || !program || !uniforms || !textures || !video) return;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
        gl.uniform1i(uniforms.isSpaceMode, state.isSpaceMode ? 1 : 0);
        gl.uniform1i(uniforms.isTimeMode, state.isTimeMode ? 1 : 0);
        gl.uniform1f(uniforms.dividerPosition, state.dividerPosition / 100);

        if (video.readyState >= video.HAVE_CURRENT_DATA) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textures.videoTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        }

        if (webcamVideo && webcamVideo.readyState >= webcamVideo.HAVE_CURRENT_DATA) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, textures.webcamTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webcamVideo);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(render);
    };

    // Initialize application
    const init = async () => {
        console.log('Initializing application...');
        
        if (!initWebGL()) {
            console.error('Failed to initialize WebGL');
            return;
        }

        const state = store.getState();
        const { gl, video } = state;

        window.addEventListener('mousemove', (e) => updateMousePosition(e, gl.canvas));
        window.addEventListener('resize', () => {
            gl.canvas.width = window.innerWidth;
            gl.canvas.height = window.innerHeight;
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        });

        // Add keyboard controls for video cycling
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

        loadMedia(0);
        requestAnimationFrame(render);
    };

    // Start application
    window.addEventListener('load', () => {
        console.log('Window loaded, starting initialization...');
        init();
    });
})(); 