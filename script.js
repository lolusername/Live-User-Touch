// IIFE to avoid polluting global scope
(() => {
    'use strict';
  
    // Declare audioStream at the top level inside the IIFE
    let audioStream = null;
    let audioContext, sourceNode, analyserNode;
  
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
      const videoSources = ['vid/C0008.MP4_Rendered_001.mp4', 'vid/C0016.MP4_Rendered_001.mp4', 'vid/C0014.MP4_Rendered_001.mp4', 'vid/C0022.MP4_Rendered_001.mp4'];
      let currentVideoIndex = 0;
  
      // Initialize video
      let video = createVideoElement(videoSources[currentVideoIndex]);
      video.play();
  
      // Modified initAudio function
      const initAudio = async () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 256;
        
        // Don't connect video audio at all - we only want analysis, no playback
        if (!audioStream && video) {
            sourceNode = audioContext.createMediaElementSource(video);
            sourceNode.connect(analyserNode);
            // Remove this line to prevent video audio
            // analyserNode.connect(audioContext.destination);
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
      });
  
      // Add stop audio capture button listener
      document.getElementById('stopAudio').addEventListener('click', () => {
        if (audioStream) {
            // Stop all tracks in the audio stream
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;

            // Disconnect old source
            if (sourceNode) {
                sourceNode.disconnect();
            }

            // Reinitialize audio for video
            initAudio();

            // Show start button and hide stop button
            document.getElementById('startAudio').style.display = 'block';
            document.getElementById('stopAudio').style.display = 'none';
        }
      });
  
      // Shader sources
      const vertexShaderSource = `
          attribute vec4 a_position;
          attribute vec2 a_texCoord;
          varying vec2 v_texCoord;
          void main() {
              gl_Position = a_position;
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

          // Chromatic aberration effect
          vec3 chromaticAberration(sampler2D tex, vec2 uv, float strength) {
              vec2 offset = strength * vec2(0.01, 0.0);
              float r = texture2D(tex, uv + offset).r;
              float g = texture2D(tex, uv).g;
              float b = texture2D(tex, uv - offset).b;
              return vec3(r, g, b);
          }

          // Enhanced color grading with saturation
          vec3 colorGrade(vec3 color, float temperature, float audioLevel) {
              vec3 cool = vec3(0.7, 0.9, 1.3);
              vec3 warm = vec3(1.3, 1.0, 0.7);
              vec3 colorGrading = mix(cool, warm, temperature);
              float saturation = 1.0 + audioLevel * 0.5;
              vec3 grayscale = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
              color = mix(grayscale, color, saturation);
              return color * colorGrading;
          }

          // Glitch effect
          vec2 glitchOffset(vec2 uv, float time, float audioLevel) {
              float glitchAmount = audioLevel * 0.1;
              float noise = fract(sin(dot(uv, vec2(120.9898, 78.233) * time)) * 43758.5453);
              vec2 offset = vec2(0.0);
              if (noise > 0.98) {
                  offset.x = (noise - 0.5) * glitchAmount;
              }
              return offset;
          }

          void main() {
              vec2 uv = v_texCoord;

              float bassResponse = u_audioFreq * 2.0;
              float pulseEffect = 1.0 + bassResponse * sin(u_time * 2.0) * 0.1;

              float distortion = sin(uv.y * 10.0 + u_time) * (0.002 * u_cursorSpeed + bassResponse * 0.01);
              uv.x += distortion;

              uv += glitchOffset(uv, u_time, bassResponse);

              vec3 color = chromaticAberration(u_videoTexture, uv, 0.5 * bassResponse);

              color = colorGrade(color, u_mouse.x, bassResponse);

              float contrast = mix(0.8, 2.2, u_mouse.y);
              color = ((color - 0.5) * contrast) + 0.5;
              color *= pulseEffect;

              vec2 bloomUV = uv;
              vec3 bloom = vec3(0.0);
              float bloomStrength = 0.5 + bassResponse * 0.3;
              
              for(float i = 0.0; i < 4.0; i++) {
                  bloomUV *= 0.99;
                  bloom += texture2D(u_videoTexture, bloomUV).rgb;
              }
              color += bloom * bloomStrength * 0.1;

              if (u_oldFilmEffect) {
                  float gray = dot(color, vec3(0.299, 0.587, 0.114));
                  color = vec3(gray);

                  float grain = fract(sin(dot(uv * u_time * 100.0, vec2(12.9898,78.233))) * 43758.5453);
                  color += (grain - 0.5) * 0.15;

                  vec2 position = uv - 0.5;
                  float vignette = smoothstep(0.8, 0.2, length(position) * (1.1 + bassResponse * 0.2));
                  color *= vignette;
              }

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
      });

      window.addEventListener('click', () => {
          oldFilmEffect = !oldFilmEffect;
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
              
              // Use the average of the first few frequency bins (bass frequencies)
              let sum = 0;
              const numBins = 4;
              for (let i = 0; i < numBins; i++) {
                  sum += frequencyData[i];
              }
              const averageFrequency = sum / (numBins * 255); // Normalize to 0-1
              gl.uniform1f(audioFreqLocation, averageFrequency);
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
    };
  
    // Run the application
    window.addEventListener('load', init);
  })();