/**
 * LiquidEther Background Effect
 * Vanilla JS implementation based on react-bits/LiquidEther
 * https://github.com/DavidHDev/react-bits
 */

class LiquidEther {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      mouseForce: options.mouseForce || 20,
      cursorSize: options.cursorSize || 100,
      isViscous: options.isViscous || false,
      viscous: options.viscous || 30,
      iterationsViscous: options.iterationsViscous || 32,
      iterationsPoisson: options.iterationsPoisson || 32,
      dt: options.dt || 0.014,
      BFECC: options.BFECC !== undefined ? options.BFECC : true,
      resolution: options.resolution || 0.5,
      isBounce: options.isBounce || false,
      colors: options.colors || ['#5227FF', '#FF9FFC', '#B19EEF'],
      autoDemo: options.autoDemo !== undefined ? options.autoDemo : true,
      autoSpeed: options.autoSpeed || 0.5,
      autoIntensity: options.autoIntensity || 2.2,
      takeoverDuration: options.takeoverDuration || 0.25,
      autoResumeDelay: options.autoResumeDelay || 1000,
      autoRampDuration: options.autoRampDuration || 0.6
    };

    this.rafId = null;
    this.running = false;
    this.isVisible = true;
    this.lastUserInteraction = performance.now();

    this.init();
  }

  init() {
    this.container.style.position = this.container.style.position || 'relative';
    this.container.style.overflow = 'hidden';

    this.paletteTex = this.makePaletteTexture(this.options.colors);
    this.bgVec4 = new THREE.Vector4(0, 0, 0, 0);

    this.initCommon();
    this.initMouse();
    this.initAutoDriver();
    this.initSimulation();
    this.initOutput();
    this.initObservers();

    this.start();
  }

  makePaletteTexture(stops) {
    let arr = Array.isArray(stops) && stops.length > 0
      ? (stops.length === 1 ? [stops[0], stops[0]] : stops)
      : ['#ffffff', '#ffffff'];

    const w = arr.length;
    const data = new Uint8Array(w * 4);

    for (let i = 0; i < w; i++) {
      const c = new THREE.Color(arr[i]);
      data[i * 4 + 0] = Math.round(c.r * 255);
      data[i * 4 + 1] = Math.round(c.g * 255);
      data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  initCommon() {
    this.common = {
      width: 0,
      height: 0,
      aspect: 1,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      time: 0,
      delta: 0,
      renderer: null,
      clock: null
    };

    this.resize();

    this.common.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.common.renderer.autoClear = false;
    this.common.renderer.setClearColor(new THREE.Color(0x000000), 0);
    this.common.renderer.setPixelRatio(this.common.pixelRatio);
    this.common.renderer.setSize(this.common.width, this.common.height);
    this.common.renderer.domElement.style.width = '100%';
    this.common.renderer.domElement.style.height = '100%';
    this.common.renderer.domElement.style.display = 'block';
    this.common.renderer.domElement.style.position = 'absolute';
    this.common.renderer.domElement.style.top = '0';
    this.common.renderer.domElement.style.left = '0';
    this.common.renderer.domElement.style.zIndex = '0';
    this.common.renderer.domElement.style.pointerEvents = 'none';

    this.common.clock = new THREE.Clock();
    this.common.clock.start();

    this.container.prepend(this.common.renderer.domElement);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.common.width = Math.max(1, Math.floor(rect.width));
    this.common.height = Math.max(1, Math.floor(rect.height));
    this.common.aspect = this.common.width / this.common.height;

    if (this.common.renderer) {
      this.common.renderer.setSize(this.common.width, this.common.height, false);
    }

    if (this.simulation) {
      this.simulation.resize();
    }
  }

  initMouse() {
    this.mouse = {
      mouseMoved: false,
      coords: new THREE.Vector2(),
      coords_old: new THREE.Vector2(),
      diff: new THREE.Vector2(),
      timer: null,
      isHoverInside: false,
      hasUserControl: false,
      isAutoActive: false,
      autoIntensity: this.options.autoIntensity,
      takeoverActive: false,
      takeoverStartTime: 0,
      takeoverDuration: this.options.takeoverDuration,
      takeoverFrom: new THREE.Vector2(),
      takeoverTo: new THREE.Vector2()
    };

    this._onMouseMove = this.onMouseMove.bind(this);
    this._onTouchStart = this.onTouchStart.bind(this);
    this._onTouchMove = this.onTouchMove.bind(this);
    this._onTouchEnd = this.onTouchEnd.bind(this);

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });
    window.addEventListener('touchend', this._onTouchEnd);
  }

  isPointInside(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  setCoords(x, y) {
    if (this.mouse.timer) clearTimeout(this.mouse.timer);
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (x - rect.left) / rect.width;
    const ny = (y - rect.top) / rect.height;
    this.mouse.coords.set(nx * 2 - 1, -(ny * 2 - 1));
    this.mouse.mouseMoved = true;
    this.mouse.timer = setTimeout(() => { this.mouse.mouseMoved = false; }, 100);
  }

  setNormalized(nx, ny) {
    this.mouse.coords.set(nx, ny);
    this.mouse.mouseMoved = true;
  }

  onMouseMove(event) {
    this.mouse.isHoverInside = this.isPointInside(event.clientX, event.clientY);
    if (!this.mouse.isHoverInside) return;

    this.lastUserInteraction = performance.now();
    if (this.autoDriver) this.autoDriver.forceStop();

    if (this.mouse.isAutoActive && !this.mouse.hasUserControl && !this.mouse.takeoverActive) {
      const rect = this.container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      this.mouse.takeoverFrom.copy(this.mouse.coords);
      this.mouse.takeoverTo.set(nx * 2 - 1, -(ny * 2 - 1));
      this.mouse.takeoverStartTime = performance.now();
      this.mouse.takeoverActive = true;
      this.mouse.hasUserControl = true;
      this.mouse.isAutoActive = false;
      return;
    }

    this.setCoords(event.clientX, event.clientY);
    this.mouse.hasUserControl = true;
  }

  onTouchStart(event) {
    if (event.touches.length !== 1) return;
    const t = event.touches[0];
    this.mouse.isHoverInside = this.isPointInside(t.clientX, t.clientY);
    if (!this.mouse.isHoverInside) return;
    this.lastUserInteraction = performance.now();
    if (this.autoDriver) this.autoDriver.forceStop();
    this.setCoords(t.clientX, t.clientY);
    this.mouse.hasUserControl = true;
  }

  onTouchMove(event) {
    if (event.touches.length !== 1) return;
    const t = event.touches[0];
    this.mouse.isHoverInside = this.isPointInside(t.clientX, t.clientY);
    if (!this.mouse.isHoverInside) return;
    this.lastUserInteraction = performance.now();
    this.setCoords(t.clientX, t.clientY);
  }

  onTouchEnd() {
    this.mouse.isHoverInside = false;
  }

  updateMouse() {
    if (this.mouse.takeoverActive) {
      const t = (performance.now() - this.mouse.takeoverStartTime) / (this.mouse.takeoverDuration * 1000);
      if (t >= 1) {
        this.mouse.takeoverActive = false;
        this.mouse.coords.copy(this.mouse.takeoverTo);
        this.mouse.coords_old.copy(this.mouse.coords);
        this.mouse.diff.set(0, 0);
      } else {
        const k = t * t * (3 - 2 * t);
        this.mouse.coords.copy(this.mouse.takeoverFrom).lerp(this.mouse.takeoverTo, k);
      }
    }

    this.mouse.diff.subVectors(this.mouse.coords, this.mouse.coords_old);
    this.mouse.coords_old.copy(this.mouse.coords);

    if (this.mouse.coords_old.x === 0 && this.mouse.coords_old.y === 0) {
      this.mouse.diff.set(0, 0);
    }

    if (this.mouse.isAutoActive && !this.mouse.takeoverActive) {
      this.mouse.diff.multiplyScalar(this.mouse.autoIntensity);
    }
  }

  initAutoDriver() {
    this.autoDriver = {
      enabled: this.options.autoDemo,
      speed: this.options.autoSpeed,
      resumeDelay: this.options.autoResumeDelay,
      rampDurationMs: this.options.autoRampDuration * 1000,
      active: false,
      current: new THREE.Vector2(0, 0),
      target: new THREE.Vector2(),
      lastTime: performance.now(),
      activationTime: 0,
      margin: 0.2,
      _tmpDir: new THREE.Vector2(),

      pickNewTarget: function() {
        this.target.set(
          (Math.random() * 2 - 1) * (1 - this.margin),
          (Math.random() * 2 - 1) * (1 - this.margin)
        );
      },

      forceStop: () => {
        this.autoDriver.active = false;
        this.mouse.isAutoActive = false;
      }
    };

    this.autoDriver.pickNewTarget();
  }

  updateAutoDriver() {
    if (!this.autoDriver.enabled) return;

    const now = performance.now();
    const idle = now - this.lastUserInteraction;

    if (idle < this.autoDriver.resumeDelay) {
      if (this.autoDriver.active) this.autoDriver.forceStop();
      return;
    }

    if (this.mouse.isHoverInside) {
      if (this.autoDriver.active) this.autoDriver.forceStop();
      return;
    }

    if (!this.autoDriver.active) {
      this.autoDriver.active = true;
      this.autoDriver.current.copy(this.mouse.coords);
      this.autoDriver.lastTime = now;
      this.autoDriver.activationTime = now;
    }

    if (!this.autoDriver.active) return;

    this.mouse.isAutoActive = true;

    let dtSec = (now - this.autoDriver.lastTime) / 1000;
    this.autoDriver.lastTime = now;
    if (dtSec > 0.2) dtSec = 0.016;

    const dir = this.autoDriver._tmpDir.subVectors(this.autoDriver.target, this.autoDriver.current);
    const dist = dir.length();

    if (dist < 0.01) {
      this.autoDriver.pickNewTarget();
      return;
    }

    dir.normalize();

    let ramp = 1;
    if (this.autoDriver.rampDurationMs > 0) {
      const t = Math.min(1, (now - this.autoDriver.activationTime) / this.autoDriver.rampDurationMs);
      ramp = t * t * (3 - 2 * t);
    }

    const step = this.autoDriver.speed * dtSec * ramp;
    const move = Math.min(step, dist);
    this.autoDriver.current.addScaledVector(dir, move);
    this.setNormalized(this.autoDriver.current.x, this.autoDriver.current.y);
  }

  // GLSL Shaders
  getShaders() {
    return {
      face_vert: `
        attribute vec3 position;
        uniform vec2 px;
        uniform vec2 boundarySpace;
        varying vec2 uv;
        precision highp float;
        void main(){
          vec3 pos = position;
          vec2 scale = 1.0 - boundarySpace * 2.0;
          pos.xy = pos.xy * scale;
          uv = vec2(0.5)+(pos.xy)*0.5;
          gl_Position = vec4(pos, 1.0);
        }
      `,
      line_vert: `
        attribute vec3 position;
        uniform vec2 px;
        precision highp float;
        varying vec2 uv;
        void main(){
          vec3 pos = position;
          uv = 0.5 + pos.xy * 0.5;
          vec2 n = sign(pos.xy);
          pos.xy = abs(pos.xy) - px * 1.0;
          pos.xy *= n;
          gl_Position = vec4(pos, 1.0);
        }
      `,
      mouse_vert: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform vec2 center;
        uniform vec2 scale;
        uniform vec2 px;
        varying vec2 vUv;
        void main(){
          vec2 pos = position.xy * scale * 2.0 * px + center;
          vUv = uv;
          gl_Position = vec4(pos, 0.0, 1.0);
        }
      `,
      advection_frag: `
        precision highp float;
        uniform sampler2D velocity;
        uniform float dt;
        uniform bool isBFECC;
        uniform vec2 fboSize;
        uniform vec2 px;
        varying vec2 uv;
        void main(){
          vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;
          if(isBFECC == false){
            vec2 vel = texture2D(velocity, uv).xy;
            vec2 uv2 = uv - vel * dt * ratio;
            vec2 newVel = texture2D(velocity, uv2).xy;
            gl_FragColor = vec4(newVel, 0.0, 0.0);
          } else {
            vec2 spot_new = uv;
            vec2 vel_old = texture2D(velocity, uv).xy;
            vec2 spot_old = spot_new - vel_old * dt * ratio;
            vec2 vel_new1 = texture2D(velocity, spot_old).xy;
            vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
            vec2 error = spot_new2 - spot_new;
            vec2 spot_new3 = spot_new - error / 2.0;
            vec2 vel_2 = texture2D(velocity, spot_new3).xy;
            vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
            vec2 newVel2 = texture2D(velocity, spot_old2).xy;
            gl_FragColor = vec4(newVel2, 0.0, 0.0);
          }
        }
      `,
      color_frag: `
        precision highp float;
        uniform sampler2D velocity;
        uniform sampler2D palette;
        uniform vec4 bgColor;
        varying vec2 uv;
        void main(){
          vec2 vel = texture2D(velocity, uv).xy;
          float lenv = clamp(length(vel), 0.0, 1.0);
          vec3 c = texture2D(palette, vec2(lenv, 0.5)).rgb;
          vec3 outRGB = mix(bgColor.rgb, c, lenv);
          float outA = mix(bgColor.a, 1.0, lenv);
          gl_FragColor = vec4(outRGB, outA);
        }
      `,
      divergence_frag: `
        precision highp float;
        uniform sampler2D velocity;
        uniform float dt;
        uniform vec2 px;
        varying vec2 uv;
        void main(){
          float x0 = texture2D(velocity, uv-vec2(px.x, 0.0)).x;
          float x1 = texture2D(velocity, uv+vec2(px.x, 0.0)).x;
          float y0 = texture2D(velocity, uv-vec2(0.0, px.y)).y;
          float y1 = texture2D(velocity, uv+vec2(0.0, px.y)).y;
          float divergence = (x1 - x0 + y1 - y0) / 2.0;
          gl_FragColor = vec4(divergence / dt);
        }
      `,
      externalForce_frag: `
        precision highp float;
        uniform vec2 force;
        uniform vec2 center;
        uniform vec2 scale;
        uniform vec2 px;
        varying vec2 vUv;
        void main(){
          vec2 circle = (vUv - 0.5) * 2.0;
          float d = 1.0 - min(length(circle), 1.0);
          d *= d;
          gl_FragColor = vec4(force * d, 0.0, 1.0);
        }
      `,
      poisson_frag: `
        precision highp float;
        uniform sampler2D pressure;
        uniform sampler2D divergence;
        uniform vec2 px;
        varying vec2 uv;
        void main(){
          float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
          float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
          float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
          float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
          float div = texture2D(divergence, uv).r;
          float newP = (p0 + p1 + p2 + p3) / 4.0 - div;
          gl_FragColor = vec4(newP);
        }
      `,
      pressure_frag: `
        precision highp float;
        uniform sampler2D pressure;
        uniform sampler2D velocity;
        uniform vec2 px;
        uniform float dt;
        varying vec2 uv;
        void main(){
          float step = 1.0;
          float p0 = texture2D(pressure, uv + vec2(px.x * step, 0.0)).r;
          float p1 = texture2D(pressure, uv - vec2(px.x * step, 0.0)).r;
          float p2 = texture2D(pressure, uv + vec2(0.0, px.y * step)).r;
          float p3 = texture2D(pressure, uv - vec2(0.0, px.y * step)).r;
          vec2 v = texture2D(velocity, uv).xy;
          vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
          v = v - gradP * dt;
          gl_FragColor = vec4(v, 0.0, 1.0);
        }
      `,
      viscous_frag: `
        precision highp float;
        uniform sampler2D velocity;
        uniform sampler2D velocity_new;
        uniform float v;
        uniform vec2 px;
        uniform float dt;
        varying vec2 uv;
        void main(){
          vec2 old = texture2D(velocity, uv).xy;
          vec2 new0 = texture2D(velocity_new, uv + vec2(px.x * 2.0, 0.0)).xy;
          vec2 new1 = texture2D(velocity_new, uv - vec2(px.x * 2.0, 0.0)).xy;
          vec2 new2 = texture2D(velocity_new, uv + vec2(0.0, px.y * 2.0)).xy;
          vec2 new3 = texture2D(velocity_new, uv - vec2(0.0, px.y * 2.0)).xy;
          vec2 newv = 4.0 * old + v * dt * (new0 + new1 + new2 + new3);
          newv /= 4.0 * (1.0 + v * dt);
          gl_FragColor = vec4(newv, 0.0, 0.0);
        }
      `
    };
  }

  initSimulation() {
    this.shaders = this.getShaders();

    const width = Math.max(1, Math.round(this.options.resolution * this.common.width));
    const height = Math.max(1, Math.round(this.options.resolution * this.common.height));

    this.simulation = {
      fboSize: new THREE.Vector2(width, height),
      cellScale: new THREE.Vector2(1.0 / width, 1.0 / height),
      boundarySpace: new THREE.Vector2(),
      fbos: {}
    };

    this.createFBOs();
    this.createShaderPasses();
  }

  getFloatType() {
    const isIOS = /(iPad|iPhone|iPod)/i.test(navigator.userAgent);
    return isIOS ? THREE.HalfFloatType : THREE.FloatType;
  }

  createFBOs() {
    const type = this.getFloatType();
    const opts = {
      type,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping
    };

    const names = ['vel_0', 'vel_1', 'vel_viscous0', 'vel_viscous1', 'div', 'pressure_0', 'pressure_1'];
    for (const name of names) {
      this.simulation.fbos[name] = new THREE.WebGLRenderTarget(
        this.simulation.fboSize.x,
        this.simulation.fboSize.y,
        opts
      );
    }
  }

  createShaderPasses() {
    // Advection pass
    this.advectionPass = this.createShaderPass({
      vertexShader: this.shaders.face_vert,
      fragmentShader: this.shaders.advection_frag,
      uniforms: {
        boundarySpace: { value: this.simulation.cellScale },
        px: { value: this.simulation.cellScale },
        fboSize: { value: this.simulation.fboSize },
        velocity: { value: this.simulation.fbos.vel_0.texture },
        dt: { value: this.options.dt },
        isBFECC: { value: true }
      }
    });

    // Boundary for advection
    this.createAdvectionBoundary();

    // External force pass
    this.externalForcePass = this.createExternalForcePass();

    // Viscous pass
    this.viscousPass = this.createShaderPass({
      vertexShader: this.shaders.face_vert,
      fragmentShader: this.shaders.viscous_frag,
      uniforms: {
        boundarySpace: { value: this.simulation.boundarySpace },
        velocity: { value: this.simulation.fbos.vel_1.texture },
        velocity_new: { value: this.simulation.fbos.vel_viscous0.texture },
        v: { value: this.options.viscous },
        px: { value: this.simulation.cellScale },
        dt: { value: this.options.dt }
      }
    });

    // Divergence pass
    this.divergencePass = this.createShaderPass({
      vertexShader: this.shaders.face_vert,
      fragmentShader: this.shaders.divergence_frag,
      uniforms: {
        boundarySpace: { value: this.simulation.boundarySpace },
        velocity: { value: this.simulation.fbos.vel_viscous0.texture },
        px: { value: this.simulation.cellScale },
        dt: { value: this.options.dt }
      }
    });

    // Poisson pass
    this.poissonPass = this.createShaderPass({
      vertexShader: this.shaders.face_vert,
      fragmentShader: this.shaders.poisson_frag,
      uniforms: {
        boundarySpace: { value: this.simulation.boundarySpace },
        pressure: { value: this.simulation.fbos.pressure_0.texture },
        divergence: { value: this.simulation.fbos.div.texture },
        px: { value: this.simulation.cellScale }
      }
    });

    // Pressure pass
    this.pressurePass = this.createShaderPass({
      vertexShader: this.shaders.face_vert,
      fragmentShader: this.shaders.pressure_frag,
      uniforms: {
        boundarySpace: { value: this.simulation.boundarySpace },
        pressure: { value: this.simulation.fbos.pressure_0.texture },
        velocity: { value: this.simulation.fbos.vel_viscous0.texture },
        px: { value: this.simulation.cellScale },
        dt: { value: this.options.dt }
      }
    });
  }

  createShaderPass(props) {
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const material = new THREE.RawShaderMaterial({
      vertexShader: props.vertexShader,
      fragmentShader: props.fragmentShader,
      uniforms: props.uniforms
    });
    const geometry = new THREE.PlaneGeometry(2.0, 2.0);
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    return { scene, camera, material, uniforms: props.uniforms };
  }

  createAdvectionBoundary() {
    const boundaryG = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0, -1, 1, 0, -1, 1, 0, 1, 1, 0, 1, 1, 0, 1, -1, 0, 1, -1, 0, -1, -1, 0
    ]);
    boundaryG.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const boundaryM = new THREE.RawShaderMaterial({
      vertexShader: this.shaders.line_vert,
      fragmentShader: this.shaders.advection_frag,
      uniforms: this.advectionPass.uniforms
    });

    this.advectionBoundary = new THREE.LineSegments(boundaryG, boundaryM);
    this.advectionPass.scene.add(this.advectionBoundary);
  }

  createExternalForcePass() {
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    const mouseG = new THREE.PlaneGeometry(1, 1);
    const mouseM = new THREE.RawShaderMaterial({
      vertexShader: this.shaders.mouse_vert,
      fragmentShader: this.shaders.externalForce_frag,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        px: { value: this.simulation.cellScale },
        force: { value: new THREE.Vector2(0.0, 0.0) },
        center: { value: new THREE.Vector2(0.0, 0.0) },
        scale: { value: new THREE.Vector2(this.options.cursorSize, this.options.cursorSize) }
      }
    });

    const mouse = new THREE.Mesh(mouseG, mouseM);
    scene.add(mouse);

    return { scene, camera, mouse, uniforms: mouseM.uniforms };
  }

  initOutput() {
    this.outputScene = new THREE.Scene();
    this.outputCamera = new THREE.Camera();

    const outputMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.RawShaderMaterial({
        vertexShader: this.shaders.face_vert,
        fragmentShader: this.shaders.color_frag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          velocity: { value: this.simulation.fbos.vel_0.texture },
          boundarySpace: { value: new THREE.Vector2() },
          palette: { value: this.paletteTex },
          bgColor: { value: this.bgVec4 }
        }
      })
    );

    this.outputScene.add(outputMesh);
  }

  initObservers() {
    // Resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);

    // Intersection observer
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        this.isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (this.isVisible && !document.hidden) {
          this.start();
        } else {
          this.pause();
        }
      },
      { threshold: [0, 0.01, 0.1] }
    );
    this.intersectionObserver.observe(this.container);

    // Visibility change
    this._onVisibility = () => {
      if (document.hidden) {
        this.pause();
      } else if (this.isVisible) {
        this.start();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    // Window resize
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  updateSimulation() {
    if (this.options.isBounce) {
      this.simulation.boundarySpace.set(0, 0);
    } else {
      this.simulation.boundarySpace.copy(this.simulation.cellScale);
    }

    // Advection
    this.advectionPass.uniforms.dt.value = this.options.dt;
    this.advectionPass.uniforms.isBFECC.value = this.options.BFECC;
    this.advectionBoundary.visible = this.options.isBounce;
    this.common.renderer.setRenderTarget(this.simulation.fbos.vel_1);
    this.common.renderer.render(this.advectionPass.scene, this.advectionPass.camera);

    // External force
    const forceX = (this.mouse.diff.x / 2) * this.options.mouseForce;
    const forceY = (this.mouse.diff.y / 2) * this.options.mouseForce;
    const cursorSizeX = this.options.cursorSize * this.simulation.cellScale.x;
    const cursorSizeY = this.options.cursorSize * this.simulation.cellScale.y;
    const centerX = Math.min(
      Math.max(this.mouse.coords.x, -1 + cursorSizeX + this.simulation.cellScale.x * 2),
      1 - cursorSizeX - this.simulation.cellScale.x * 2
    );
    const centerY = Math.min(
      Math.max(this.mouse.coords.y, -1 + cursorSizeY + this.simulation.cellScale.y * 2),
      1 - cursorSizeY - this.simulation.cellScale.y * 2
    );

    this.externalForcePass.uniforms.force.value.set(forceX, forceY);
    this.externalForcePass.uniforms.center.value.set(centerX, centerY);
    this.externalForcePass.uniforms.scale.value.set(this.options.cursorSize, this.options.cursorSize);
    this.common.renderer.setRenderTarget(this.simulation.fbos.vel_1);
    this.common.renderer.render(this.externalForcePass.scene, this.externalForcePass.camera);

    // Viscous (optional)
    let vel = this.simulation.fbos.vel_1;
    if (this.options.isViscous) {
      let fbo_in, fbo_out;
      this.viscousPass.uniforms.v.value = this.options.viscous;

      for (let i = 0; i < this.options.iterationsViscous; i++) {
        if (i % 2 === 0) {
          fbo_in = this.simulation.fbos.vel_viscous0;
          fbo_out = this.simulation.fbos.vel_viscous1;
        } else {
          fbo_in = this.simulation.fbos.vel_viscous1;
          fbo_out = this.simulation.fbos.vel_viscous0;
        }
        this.viscousPass.uniforms.velocity_new.value = fbo_in.texture;
        this.viscousPass.uniforms.dt.value = this.options.dt;
        this.common.renderer.setRenderTarget(fbo_out);
        this.common.renderer.render(this.viscousPass.scene, this.viscousPass.camera);
      }
      vel = fbo_out;
    }

    // Copy vel to vel_viscous0 if not viscous
    if (!this.options.isViscous) {
      this.simulation.fbos.vel_viscous0 = vel;
    }

    // Divergence
    this.divergencePass.uniforms.velocity.value = vel.texture;
    this.common.renderer.setRenderTarget(this.simulation.fbos.div);
    this.common.renderer.render(this.divergencePass.scene, this.divergencePass.camera);

    // Poisson
    let p_in, p_out;
    for (let i = 0; i < this.options.iterationsPoisson; i++) {
      if (i % 2 === 0) {
        p_in = this.simulation.fbos.pressure_0;
        p_out = this.simulation.fbos.pressure_1;
      } else {
        p_in = this.simulation.fbos.pressure_1;
        p_out = this.simulation.fbos.pressure_0;
      }
      this.poissonPass.uniforms.pressure.value = p_in.texture;
      this.common.renderer.setRenderTarget(p_out);
      this.common.renderer.render(this.poissonPass.scene, this.poissonPass.camera);
    }

    // Pressure
    this.pressurePass.uniforms.velocity.value = vel.texture;
    this.pressurePass.uniforms.pressure.value = p_out.texture;
    this.common.renderer.setRenderTarget(this.simulation.fbos.vel_0);
    this.common.renderer.render(this.pressurePass.scene, this.pressurePass.camera);
  }

  render() {
    this.common.renderer.setRenderTarget(null);
    this.common.renderer.render(this.outputScene, this.outputCamera);
  }

  loop() {
    if (!this.running) return;

    this.common.delta = this.common.clock.getDelta();
    this.common.time += this.common.delta;

    this.updateAutoDriver();
    this.updateMouse();
    this.updateSimulation();
    this.render();

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  pause() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose() {
    this.pause();

    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);

    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.intersectionObserver) this.intersectionObserver.disconnect();

    if (this.common.renderer) {
      const canvas = this.common.renderer.domElement;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      this.common.renderer.dispose();
    }

    for (const key in this.simulation.fbos) {
      this.simulation.fbos[key].dispose();
    }
  }
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  const container = document.body;

  // Create a wrapper for the liquid ether effect
  const liquidWrapper = document.createElement('div');
  liquidWrapper.id = 'liquid-ether-bg';
  liquidWrapper.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
  `;
  document.body.prepend(liquidWrapper);

  // Initialize LiquidEther with BRIEFIK brand colors (blue only)
  window.liquidEther = new LiquidEther(liquidWrapper, {
    colors: ['#3d8aed', '#5ca3ff', '#7db8ff'],  // BRIEFIK brand: dark blue, primary blue, light blue
    mouseForce: 20,
    cursorSize: 100,
    resolution: 0.5,
    autoDemo: true,
    autoSpeed: 0.5,
    autoIntensity: 2.2
  });
});
