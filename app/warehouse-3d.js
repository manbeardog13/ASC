/* ASC warehouse 2.1. One room. Top view. No spin. */
(function () {
  var mount = document.getElementById('wh3d');
  if (!mount || !window.THREE) return;
  var THREE = window.THREE;
  var STACK = 8;

  // Coordinates: x east, z south. North is negative z. Door is north-east.
  var room = {
    id: '2.1',
    name: '2.1',
    w: 10,
    d: 14,
    door: { x: 3.2, z: -6.6 },
    stairs: { x: 3.4, z: 1.2 },
    stacks: []
  };

  function row(x, z0, count, step) {
    for (var i = 0; i < count; i++) room.stacks.push([x, z0 + i * step, STACK]);
  }
  row(-4.2, -5.6, 18, 0.62);          // left wall, north to south
  row(-2.4, -4.2, 15, 0.62);          // middle 15
  row(-0.6, -4.2, 15, 0.62);
  row(1.2, -4.2, 15, 0.62);
  row(3.0, -5.8, 4, 0.7);             // four, left of the door
  row(3.6, -1.4, 3, 0.7);             // three after the stairs
  row(3.6, 2.6, 6, 0.62);             // six coming to the stairs

  mount.innerHTML = '<div class="wh-one"><canvas id="whCanvas"></canvas><div class="wh-note"><b>2.1</b><span>Vrata sjeverno desno. Stepenice desno. Svaki stog je 8.</span></div></div>';
  var canvas = document.getElementById('whCanvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#f6f4f1');
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  scene.add(new THREE.AmbientLight(0xffffff, 0.96));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xeeeae4, 0.4));

  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.w, room.d),
    new THREE.MeshStandardMaterial({ color: 0xf3f1ee, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  var edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(room.w, room.d)),
    new THREE.LineBasicMaterial({ color: 0xc8c4be })
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.01;
  scene.add(edge);

  var door = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.04, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x1c1e24 })
  );
  door.position.set(room.door.x, 0.02, room.door.z);
  scene.add(door);

  var stairMat = new THREE.MeshBasicMaterial({ color: 0xb7b3ac, wireframe: true });
  for (var s = 0; s < 6; s++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.28), stairMat);
    step.position.set(room.stairs.x, 0.03 + s * 0.02, room.stairs.z + s * 0.28);
    scene.add(step);
  }

  var rubber = new THREE.MeshStandardMaterial({
    color: 0x2c3036,
    roughness: 0.35,
    metalness: 0.02,
    transparent: true,
    opacity: 0.92
  });
  var glass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.08
  });
  room.stacks.forEach(function (st) {
    var g = new THREE.Group();
    g.position.set(st[0], 0, st[1]);
    for (var n = 0; n < STACK; n++) {
      var tire = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 10, 20), rubber);
      tire.rotation.x = Math.PI / 2;
      tire.position.y = 0.08 + n * 0.11;
      g.add(tire);
      var coat = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 8, 16), glass);
      coat.rotation.x = Math.PI / 2;
      coat.position.y = tire.position.y;
      g.add(coat);
    }
    scene.add(g);
  });

  var yaw = 0, pitch = 1.15, dist = 18;
  var targetYaw = 0, targetPitch = 1.15, targetDist = 18;
  var look = new THREE.Vector3(0, 0, 0);
  var targetLook = new THREE.Vector3(0, 0, 0);
  var dragging = false, last = null, lastT = performance.now();

  function resize() {
    var r = canvas.parentElement.getBoundingClientRect();
    var h = Math.max(420, window.innerHeight * 0.72);
    renderer.setSize(r.width, h);
    camera.aspect = r.width / h;
    camera.updateProjectionMatrix();
  }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
  function place(dt) {
    yaw = damp(yaw, targetYaw, 10, dt);
    pitch = damp(pitch, targetPitch, 10, dt);
    dist = damp(dist, targetDist, 8, dt);
    look.lerp(targetLook, 1 - Math.exp(-8 * dt));
    var h = dist * Math.sin(pitch), flat = dist * Math.cos(pitch);
    camera.position.set(look.x + Math.sin(yaw) * flat, Math.max(6, h), look.z + Math.cos(yaw) * flat);
    camera.lookAt(look);
  }
  function loop(now) {
    var dt = Math.min(0.04, (now - lastT) / 1000); lastT = now;
    place(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  function focusToward(nx, nz) {
    targetLook.set(nx * 1.4, 0, nz * 1.4);
    targetYaw = nx * 0.18;
    targetPitch = 0.95;
    targetDist = 13;
  }
  function release() {
    targetLook.set(0, 0, 0);
    targetYaw = 0;
    targetPitch = 1.15;
    targetDist = 18;
  }
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    var r = canvas.getBoundingClientRect();
    focusToward((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
  });
  window.addEventListener('pointerup', function () { dragging = false; release(); });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var r = canvas.getBoundingClientRect();
    focusToward((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
  });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
})();
