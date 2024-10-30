// IIFE to avoid polluting global scope
(() => {
    'use strict';
  
    // Declare audioStream at the top level inside the IIFE
    let audioStream = null;
    let audioContext, sourceNode, analyserNode;
  
    // Add these variables at the top level inside the IIFE
    let lastBeatTime = 0;
    const BEAT_THRESHOLD = 0.80;  // Higher threshold for only strong beats
    const MIN_BEAT_INTERVAL = 100;  // Shorter interval to allow quick changes on strong beats
  
    // Functional helper to create and configure a video element
    const createVideoElement = (src) => {
      const video = document.createElement('video');
      video.src = src;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      return video;
    };
  
    // Main function to initialize and run the application
    const init = async () => {
      const canvas = document.getElementById('glCanvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
      if (!gl) {
        console.error('WebGL not supported');
        return;
      }
  
      // Adjust canvas size
      const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
  
      // Video sources array
      let videoSources = ['vid/C0008.MP4_Rendered_001.mp4', 'vid/C0016.MP4_Rendered_001.mp4', 'vid/C0014.MP4_Rendered_001.mp4', 'vid/C0022.MP4_Rendered_001.mp4'];
      let currentVideoIndex = 0;
  
      // Initialize video
      let video = createVideoElement(videoSources[currentVideoIndex]);
      video.play();
  
      // Modified initAudio function
      const initAudio = async () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (!analyserNode) {
            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 256;
        }
        
        // Only create new source node if we don't have one
        if (!sourceNode && video) {
            sourceNode = audioContext.createMediaElementSource(video);
        }
        
        // Always ensure proper connections
        if (sourceNode) {
            sourceNode.disconnect(); // Disconnect from any previous connections
            sourceNode.connect(analyserNode);
        }
      };
  
      // Modified audio capture button listeners
      document.getElementById('startAudio').addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true,
                audio: true 
            });
            
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                if (sourceNode) {
                    sourceNode.disconnect();
                }
                
                audioStream = new MediaStream([audioTrack]);
                sourceNode = audioContext.createMediaStreamSource(audioStream);
                sourceNode.connect(analyserNode);
                // Never connect to destination - we only want analysis
                
                document.getElementById('startAudio').style.display = 'none';
                document.getElementById('stopAudio').style.display = 'block';
            }
            
            stream.getVideoTracks().forEach(track => track.stop());
            
        } catch (error) {
            console.error('Error starting audio capture:', error);
        }
        updateControlsVisibility();
      });
  
      // Modified stop audio handler
      document.getElementById('stopAudio').addEventListener('click', () => {
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }

        if (sourceNode) {
            sourceNode.disconnect();
        }

        // Create new nodes for video audio
        sourceNode = null;
        analyserNode = null;
        
        // Reinitialize audio for video
        initAudio();

        document.getElementById('startAudio').style.display = 'block';
        document.getElementById('stopAudio').style.display = 'none';
        
        updateControlsVisibility();
      });
  
      // Shader sources
      const vertexShaderSource = `
          attribute vec4 a_position;
          attribute vec2 a_texCoord;
          uniform vec2 u_resolution;
          varying vec2 v_texCoord;

          void main() {
              // Calculate video aspect ratio (assuming 16:9 video)
              float videoAspect = 16.0/9.0;
              float screenAspect = u_resolution.x/u_resolution.y;
              
              vec2 position = a_position.xy;
              
              // Adjust position to maintain aspect ratio
              if (screenAspect > videoAspect) {
                  // Screen is wider than video
                  float scale = screenAspect / videoAspect;
                  position.x /= scale;
              } else {
                  // Screen is taller than video
                  float scale = videoAspect / screenAspect;
                  position.y /= scale;
              }
              
              gl_Position = vec4(position, 0.0, 1.0);
              v_texCoord = a_texCoord;
          }
      `;

      const fragmentShaderSource = `
          precision mediump float;

          uniform sampler2D u_videoTexture;
          uniform vec2 u_resolution;
          uniform vec2 u_mouse;
          uniform float u_time;
          uniform float u_audioFreq;
          uniform float u_cursorSpeed;
          uniform bool u_oldFilmEffect;

          varying vec2 v_texCoord;

          // Balanced chromatic aberration effect
          vec3 chromaticAberration(sampler2D tex, vec2 uv, float strength) {
              // Medium-high threshold for clear beats
              float threshold = 0.4;
              float maxOffset = 0.05;  // Moderate offset amount
              
              vec2 offset = vec2(0.0);
              if (strength > threshold) {
                  // Smoother transition with moderate intensity
                  float normalizedStrength = min((strength - threshold) / (1.0 - threshold), 1.0);
                  offset = vec2(maxOffset * normalizedStrength, 0.0);
              }

              float r = texture2D(tex, uv + offset).r;
              float g = texture2D(tex, uv).g;
              float b = texture2D(tex, uv - offset).b;
              return vec3(r, g, b);
          }

          // Enhanced color grading with saturation
          vec3 colorGrade(vec3 color, float temperature, float audioLevel) {
              // Cool colors (fashion-forward blue/purple)
              vec3 cool = vec3(0.7, 0.9, 1.1);
              // Warm colors (luxury gold/amber)
              vec3 warm = vec3(1.1, 1.0, 0.7);
            
              // Mix between cool and warm based on mouse x
              vec3 colorGrading = mix(cool, warm, temperature);
              
              // Enhance saturation based on audio
              float saturation = 1.0 + audioLevel * 0.5;
              vec3 grayscale = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
              color = mix(grayscale, color, saturation);
              
              return color * colorGrading;
          }

          void main() {
              vec2 uv = v_texCoord;

              float bassResponse = u_audioFreq * 2.0;
              
              // Apply chromatic aberration based on audio
              vec3 color = chromaticAberration(u_videoTexture, uv, 0.3 * bassResponse);

              // Apply color grading
              color = colorGrade(color, u_mouse.x, bassResponse);

              // Adjust contrast based on mouse Y
              float contrast = mix(0.8, 2.2, u_mouse.y);
              color = ((color - 0.5) * contrast) + 0.5;

              // Apply old film effect if toggled
              if (u_oldFilmEffect) {
                  float gray = dot(color, vec3(0.299, 0.587, 0.114));
                  color = vec3(gray);

                  // Add film grain
                  float grain = fract(sin(dot(uv * u_time * 100.0, vec2(12.9898,78.233))) * 43758.5453);
                  color += (grain - 0.5) * 0.15;

                  // Add vignette
                  vec2 position = uv - 0.5;
                  float vignette = smoothstep(0.8, 0.2, length(position));
                  color *= vignette;
              }

              // Final color adjustments
              color = min(color * 1.1, 1.0);
              
              gl_FragColor = vec4(color, 1.0);
          }
      `;

      // Create and compile shaders
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

      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

      // Create program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error(gl.getProgramInfoLog(program));
          return;
      }

      // Set up buffers
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      const texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
      const texCoords = new Float32Array([
          0, 1,
          1, 1,
          0, 0,
          0, 0,
          1, 1,
          1, 0,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

      // Set up attributes
      const positionLocation = gl.getAttribLocation(program, 'a_position');
      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

      // Set up uniforms
      const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
      const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
      const timeLocation = gl.getUniformLocation(program, 'u_time');
      const audioFreqLocation = gl.getUniformLocation(program, 'u_audioFreq');
      const cursorSpeedLocation = gl.getUniformLocation(program, 'u_cursorSpeed');
      const oldFilmEffectLocation = gl.getUniformLocation(program, 'u_oldFilmEffect');

      // Create and set up texture
      const videoTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Mouse tracking
      const mouse = {
          x: 0.5,
          y: 0.5,
          lastX: 0,
          lastY: 0,
          velocity: 0,
          lastTime: 0
      };

      let oldFilmEffect = false;

      // Event listeners
      window.addEventListener('mousemove', (e) => {
          const currentTime = performance.now();
          const deltaTime = (currentTime - mouse.lastTime) / 1000;
          
          const dx = e.clientX - mouse.lastX;
          const dy = e.clientY - mouse.lastY;
          mouse.velocity = Math.sqrt(dx*dx + dy*dy) / deltaTime;
          mouse.velocity = Math.min(mouse.velocity / 1000, 1.0);
          
          mouse.lastX = e.clientX;
          mouse.lastY = e.clientY;
          mouse.x = e.clientX / gl.canvas.width;
          mouse.y = 1 - e.clientY / gl.canvas.height;
          mouse.lastTime = currentTime;

          // Update UI to reflect cursor position
          if (!audioStream) {
              // Update temperature bar (mouse.x)
              const tempFill = document.querySelector('.temp-fill');
              const tempValue = document.querySelector('.temp-value');
              const tempPercentage = Math.round(mouse.x * 100);
              tempFill.style.width = `${tempPercentage}%`;
              tempValue.textContent = `${tempPercentage}%`;

              // Update contrast bar (mouse.y)
              const contrastFill = document.querySelector('.contrast-fill');
              const contrastValue = document.querySelector('.contrast-value');
              const contrastPercentage = Math.round(mouse.y * 100);
              contrastFill.style.width = `${contrastPercentage}%`;
              contrastValue.textContent = `${contrastPercentage}%`;
          }
      });

      canvas.addEventListener('click', (e) => {
          // Only toggle if the click was on the canvas, not the buttons
          if (e.target === canvas) {
              oldFilmEffect = !oldFilmEffect;
          }
      });

      // Modified double-click handler
      window.addEventListener('dblclick', () => {
          video.pause();
          currentVideoIndex = (currentVideoIndex + 1) % videoSources.length;
          video.src = videoSources[currentVideoIndex];
          video.play();
          
          // Don't reinitialize audio if we have a stream
          if (!audioStream) {
              initAudio();
          }
      });

      // Render loop
      let startTime = null;
      const render = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const elapsedTime = (timestamp - startTime) / 1000;

          gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);

          gl.useProgram(program);

          // Update attributes
          gl.enableVertexAttribArray(positionLocation);
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

          gl.enableVertexAttribArray(texCoordLocation);
          gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
          gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

          // Update uniforms
          gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
          gl.uniform2f(mouseLocation, mouse.x, mouse.y);
          gl.uniform1f(timeLocation, elapsedTime);
          gl.uniform1f(cursorSpeedLocation, mouse.velocity);
          gl.uniform1i(oldFilmEffectLocation, oldFilmEffect);

          // Update audio frequency data
          if (analyserNode) {
              const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
              analyserNode.getByteFrequencyData(frequencyData);
              
              // Focus on bass and mid frequencies for better beat detection
              let bassSum = 0;
              let midSum = 0;
              
              // Bass frequencies (first few bins)
              for (let i = 0; i < 4; i++) {
                  bassSum += frequencyData[i];
              }
              
              // Mid frequencies (next few bins)
              for (let i = 4; i < 12; i++) {
                  midSum += frequencyData[i];
              }
              
              const bassAverage = bassSum / (4 * 255); // Normalize to 0-1
              const midAverage = midSum / (8 * 255);  // Normalize to 0-1
              
              // Combined beat detection
              const beatStrength = (bassAverage * 0.7) + (midAverage * 0.3);
              gl.uniform1f(audioFreqLocation, beatStrength);

              // Only switch on very strong beats
              const currentTime = performance.now();
              if (beatStrength > BEAT_THRESHOLD && 
                  currentTime - lastBeatTime > MIN_BEAT_INTERVAL) {
                  lastBeatTime = currentTime;
                  video.pause();
                  currentVideoIndex = (currentVideoIndex + 1) % videoSources.length;
                  video.src = videoSources[currentVideoIndex];
                  video.play();
              }
          }

          // Update video texture
          if (video.readyState >= video.HAVE_CURRENT_DATA) {
              gl.bindTexture(gl.TEXTURE_2D, videoTexture);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          }

          // Draw
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          requestAnimationFrame(render);
      };

      // Modified video canplay listener
      video.addEventListener('canplay', async () => {
          if (!audioContext) {
              await initAudio();
          }
          requestAnimationFrame(render);
      });

      // Add this event listener after your other event listeners
      window.addEventListener('keydown', (e) => {
          // Only allow arrow key controls when not connected to audio
          if (!audioStream) {
              switch(e.code) {
                  case 'ArrowRight':
                  case 'ArrowDown':
                      // Next video
                      video.pause();
                      currentVideoIndex = (currentVideoIndex + 1) % videoSources.length;
                      video.src = videoSources[currentVideoIndex];
                      video.play();
                      break;
                      
                  case 'ArrowLeft':
                  case 'ArrowUp':
                      // Previous video
                      video.pause();
                      currentVideoIndex = (currentVideoIndex - 1 + videoSources.length) % videoSources.length;
                      video.src = videoSources[currentVideoIndex];
                      video.play();
                      break;
              }
          }
      });

      // Add at the top level inside init()
      const videoControls = document.querySelector('.video-controls');
      const tempBar = document.querySelector('.temp-bar');
      const contrastBar = document.querySelector('.contrast-bar');
      const tempValue = document.querySelector('.temp-value');
      const contrastValue = document.querySelector('.contrast-value');

      // Show/hide controls based on audio connection
      const updateControlsVisibility = () => {
          videoControls.style.display = audioStream ? 'none' : 'block';
      };

      // Update initial visibility
      updateControlsVisibility();

      // Handle control bar clicks
      const handleBarClick = (e, bar, fill, value, isTemp) => {
          const rect = bar.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
          
          fill.style.width = `${percentage}%`;
          value.textContent = `${Math.round(percentage)}%`;
          
          if (isTemp) {
              mouse.x = percentage / 100;
          } else {
              mouse.y = percentage / 100;
          }
      };

      tempBar.addEventListener('click', (e) => {
          if (!audioStream) {
              handleBarClick(e, tempBar, tempBar.querySelector('.temp-fill'), tempValue, true);
          }
      });

      contrastBar.addEventListener('click', (e) => {
          if (!audioStream) {
              handleBarClick(e, contrastBar, contrastBar.querySelector('.contrast-fill'), contrastValue, false);
          }
      });

      // Add to your JavaScript initialization
      const videoUpload = document.getElementById('videoUpload');
      videoUpload.addEventListener('change', (e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) {
              // Filter for video files and create object URLs
              const newVideoSources = files
                  .filter(file => file.type.startsWith('video/'))
                  .map(file => URL.createObjectURL(file));
              
              if (newVideoSources.length > 0) {
                  // Clean up old object URLs
                  videoSources.forEach(url => {
                      if (url.startsWith('blob:')) {
                          URL.revokeObjectURL(url);
                      }
                  });
                  
                  // Update video sources array
                  videoSources = newVideoSources;
                  currentVideoIndex = 0;
                  
                  // Load first video
                  video.src = videoSources[currentVideoIndex];
                  video.play();
              }
          }
      });

      // Add cleanup on page unload
      window.addEventListener('beforeunload', () => {
          videoSources.forEach(url => {
              if (url.startsWith('blob:')) {
                  URL.revokeObjectURL(url);
              }
          });
      });
    };
  
    // Run the application
    window.addEventListener('load', init);
  })();