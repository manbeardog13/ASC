/* ASC warehouse 3D. Scroll the rooms, enter one, move freely. */
(function () {
  var mount = document.getElementById('wh3d');
  if (!mount || !window.THREE) return;
  var THREE = window.THREE;
  var STACK = 8;
  var people = ['Ivana Kovač', 'Marko Burić', 'Hotel Excelsior', 'Petra Jurjević', 'Ante Vuković'];
  var colors = [0x4c6fff, 0x1f9d55, 0xc45c26, 0x7c5cff, 0x0e7490];
  var rooms = [
    { id:'hall', name:'Dvorana', w:7.2, d:14.5, stacks:[
      [-2.2,-5.6,8],[-1.1,-5.6,8],[0,-5.6,6],[1.1,-5.6,8],[2.2,-5.6,4],
      [-2.2,-4.4,8],[-1.1,-4.4,8],[0,-4.4,8],[1.1,-4.4,5],[2.2,-4.4,8],
      [-2.2,-3.2,8],[-1.1,-3.2,3],[0,-3.2,8],[1.1,-3.2,8],[2.2,-3.2,2],
      [-2.2,-2.0,8],[-1.1,-2.0,8],[0,-2.0,7],[1.1,-2.0,8],
      [-2.2,-0.8,8],[-1.1,-0.8,8],[0,-0.8,8],[1.1,-0.8,6],
      [-0.8,3.4,4],[0.4,3.4,8],[1.6,3.4,2],[-0.8,4.8,8],[0.4,4.8,3],[1.6,4.8,8]
    ]},
    { id:'square', name:'Kvadrat', w:8, d:8, stacks:[
      [-2.6,-2.2,8],[-2.6,-0.4,5],[-2.6,1.4,8],[-2.6,2.6,2],
      [-1.2,-2.8,8],[0.4,-2.8,6],[2.0,-2.8,8],[2.6,-1.2,4],[2.6,0.6,8],[2.6,2.2,3],
      [-1.0,2.6,8],[0.6,2.6,8],[2.0,2.6,1]
    ]},
    { id:'triangle', name:'Trokut', w:9, d:10, stacks:[
      [-2.8,3.2,8],[-2.2,2.0,8],[-1.6,0.8,6],[-1.0,-0.4,8],[-0.4,-1.6,4],
      [0.2,2.4,8],[0.6,1.0,5],[1.0,-0.4,8],[2.4,-2.2,8],[2.2,-0.8,8],[2.0,0.6,3],[1.8,2.0,8],[1.6,3.2,2],
      [-0.4,3.6,8],[-0.1,3.6,6]
    ]},
    { id:'ell', name:'Kut', w:10, d:12, stacks:[
      [-2.6,-1.2,8],[-1.6,-1.2,8],[-0.6,-1.2,4],[-2.6,0,8],[-1.6,0,6],[-0.6,0,8],
      [-2.6,1.2,8],[-1.6,1.2,2],[-0.6,1.2,8],[-2.6,2.4,5],[-1.6,2.4,8],[-0.6,2.4,8],
      [1.0,-1.2,8],[2.0,-1.2,8],[3.0,-1.2,7],[4.0,-1.2,8],[1.0,0,8],[2.0,0,3],[3.0,0,8],[4.0,0,8],
      [1.0,1.2,6],[2.0,1.2,8],[3.0,1.2,8],[4.0,1.2,1],[1.0,2.4,8],[2.0,2.4,8],[3.0,2.4,4],[4.0,2.4,8]
    ]}
  ];

  mount.innerHTML = '<div class="wh-scroll" id="whScroll"></div><div class="wh-inspect" id="whInspect" hidden></div>';
  var scroll = document.getElementById('whScroll');
  var inspect = document.getElementById('whInspect');
  rooms.forEach(function (room) {
    var card = document.createElement('button');
    card.className = 'wh-card';
    card.type = 'button';
    card.innerHTML = '<span>' + room.name + '</span><canvas></canvas>';
    card.onclick = function () { enter(room); };
    scroll.appendChild(card);
    requestAnimationFrame(function () { drawTop(card.querySelector('canvas'), room); });
  });

  function drawTop(canvas, room) {
    var w = canvas.clientWidth || 360, h = 220;
    canvas.width = w * 2; canvas.height = h * 2;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3efe9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var s = Math.min(canvas.width / (room.w + 2.4), canvas.height / (room.d + 2.4));
    var ox = canvas.width / 2, oy = canvas.height / 2;
    ctx.strokeStyle = '#1c1e24'; ctx.lineWidth = 4;
    ctx.strokeRect(ox - room.w * s / 2, oy - room.d * s / 2, room.w * s, room.d * s);
    room.stacks.forEach(function (st) {
      ctx.beginPath();
      ctx.arc(ox + st[0] * s, oy + st[1] * s, 8, 0, 6.28);
      ctx.fillStyle = st[2] ? '#24272d' : 'transparent';
      ctx.fill();
      ctx.strokeStyle = '#9aa1ab'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  var renderer, scene, camera, world, current;
  var yaw = 0, pitch = 0.5, dist = 16;
  var targetYaw = 0, targetPitch = 0.5, targetDist = 16;
  var dragging = false, last = null, pinch = null, running = false, enteredAt = 0;

  function rubber() {
    return new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.72, metalness: 0.08 });
  }
  function wire() {
    return new THREE.MeshBasicMaterial({ color: 0xb7bec8, wireframe: true, transparent: true, opacity: 0.55 });
  }
  function label(text, color) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#' + color.toString(16).padStart(6, '0');
    g.fillRect(0, 36, 18, 18);
    g.fillStyle = '#1c1e24';
    g.font = '600 46px sans-serif';
    g.fillText(text, 28, 78);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    sprite.position.y = 1.85; sprite.scale.set(1.8, 0.45, 1); sprite.userData.label = true;
    return sprite;
  }

  function enter(room) {
    current = room;
    inspect.hidden = false;
    inspect.innerHTML = '<canvas id="whCanvas"></canvas><div class="wh-sheet"><div class="grab"></div><b>' + room.name + '</b><p>Stog od 8. Puna guma je zauzeta. Žica je prazno mjesto. Približi se i ime je već tu.</p><div class="legend"><i class="full"></i>Zauzeto <i class="wire"></i>Prazno <i class="hold"></i>Isti vlasnik</div><form id="aiForm"><input id="aiText" placeholder="Pitaj ili reci što treba…" /><button type="button" id="aiMic">Reci</button><button type="submit">Pošalji</button></form><div id="aiOut"></div></div>';
    var canvas = document.getElementById('whCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f6f3ee');
    scene.fog = new THREE.Fog(0xf6f3ee, 18, 36);
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    scene.add(new THREE.HemisphereLight(0xfff6ee, 0xc8c2b8, 0.45));
    var sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(6, 12, 4); sun.castShadow = true; scene.add(sun);
    world = new THREE.Group(); scene.add(world);
    buildRoom(room);
    targetPitch = 0.08; pitch = 0.08;
    targetDist = Math.max(room.w, room.d) * 1.55; dist = targetDist;
    targetYaw = 0; yaw = 0; enteredAt = performance.now();
    resize();
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.getElementById('aiMic').onclick = listen;
    document.getElementById('aiForm').onsubmit = onAsk;
    if (!running) { running = true; requestAnimationFrame(loop); }
    setTimeout(function () { targetPitch = 0.48; targetYaw = 0.18; }, 280);
  }

  function buildRoom(room) {
    while (world.children.length) world.remove(world.children[0]);
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w, room.d),
      new THREE.MeshStandardMaterial({ color: 0xe4ddd4, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
    addWalls(room);
    room.stacks.forEach(function (st, i) {
      var who = st[2] ? people[i % people.length] : '';
      var color = colors[i % people.length];
      var g = new THREE.Group();
      g.position.set(st[0], 0, st[1]);
      g.userData = { filled: st[2], who: who, color: color };
      for (var n = 0; n < STACK; n++) {
        var occupied = n < st[2];
        var tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 12, 28), occupied ? rubber() : wire());
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.18 + n * 0.17;
        tire.castShadow = occupied;
        tire.userData.occupied = occupied;
        if (occupied) tire.material.emissive = new THREE.Color(color);
        g.add(tire);
      }
      if (who) g.add(label(who, color));
      world.add(g);
    });
  }

  function addWalls(room) {
    var mat = new THREE.MeshStandardMaterial({ color: 0xf7f4ef, roughness: 0.8 });
    var edge = new THREE.LineBasicMaterial({ color: 0x1c1e24 });
    [[room.w, 0.85, 0.08, 0, 0.42, -room.d / 2], [room.w, 0.85, 0.08, 0, 0.42, room.d / 2],
     [0.08, 0.85, room.d, -room.w / 2, 0.42, 0], [0.08, 0.85, room.d, room.w / 2, 0.42, 0]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), mat);
      m.position.set(p[3], p[4], p[5]); world.add(m);
      var lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge);
      lines.position.copy(m.position); world.add(lines);
    });
  }

  function resize() {
    var r = inspect.getBoundingClientRect();
    var h = Math.max(340, r.height * 0.64);
    renderer.setSize(r.width, h);
    camera.aspect = r.width / h;
    camera.updateProjectionMatrix();
  }
  function damp(a, b, k) { return a + (b - a) * (1 - Math.exp(-k)); }
  function placeCamera() {
    yaw = damp(yaw, targetYaw, 0.08);
    pitch = damp(pitch, targetPitch, 0.08);
    dist = damp(dist, targetDist, 0.08);
    var h = dist * Math.sin(pitch), flat = dist * Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * flat, Math.max(1.4, h), Math.cos(yaw) * flat);
    camera.lookAt(0, 0.35, 0);
  }
  function loop() {
    if (!running) return;
    if (!inspect.hidden && world) {
      if (!dragging && performance.now() - enteredAt > 900) {
        targetYaw = 0.22 * Math.sin((performance.now() - enteredAt) / 2200);
      }
      var close = dist < 11;
      world.children.forEach(function (g) {
        if (!g.userData || !g.userData.who) return;
        g.children.forEach(function (child) {
          if (child.userData && child.userData.label) {
            child.material.opacity = damp(child.material.opacity, close ? 1 : 0, 0.12);
            child.visible = child.material.opacity > 0.04;
          }
          if (child.material && child.material.emissive && child.userData.occupied) {
            child.material.emissiveIntensity = damp(child.material.emissiveIntensity || 0, close ? 0.42 : 0, 0.1);
          }
          if (child.userData && child.userData.anim) {
            child.userData.anim.t = Math.min(1, child.userData.anim.t + 0.04);
            var e = 1 - Math.pow(1 - child.userData.anim.t, 3);
            child.position.y = child.userData.anim.from + (child.userData.anim.to - child.userData.anim.from) * e;
            child.scale.setScalar(0.86 + 0.14 * e);
            if (child.userData.anim.t === 1) child.userData.anim = null;
          }
        });
      });
      placeCamera();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  }
  function onDown(e) { dragging = true; last = { x: e.clientX, y: e.clientY, yaw: targetYaw, pitch: targetPitch }; }
  function onMove(e) {
    if (!dragging || !last) return;
    targetYaw = last.yaw - (e.clientX - last.x) * 0.005;
    targetPitch = Math.max(0.12, Math.min(1.05, last.pitch + (e.clientY - last.y) * 0.003));
  }
  function onUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    targetDist = Math.max(4.5, Math.min(26, targetDist + e.deltaY * 0.008));
    if (targetDist > 22) targetPitch = 0.16;
  }
  inspect.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1 && e.touches[0].clientX < 36) inspect.dataset.sx = e.touches[0].clientX;
    if (e.touches.length === 2) {
      pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  inspect.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var next = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      targetDist = Math.max(4.5, Math.min(26, targetDist - (next - pinch) * 0.02));
      if (targetDist > 22) targetPitch = 0.16;
      pinch = next;
    }
  }, { passive: true });
  inspect.addEventListener('touchend', function (e) {
    if (inspect.dataset.sx && e.changedTouches[0].clientX - Number(inspect.dataset.sx) > 80) exit();
    inspect.dataset.sx = '';
  });
  function exit() {
    targetPitch = 0.08; targetDist = 26;
    setTimeout(function () { inspect.hidden = true; current = null; }, 420);
  }
  function listen() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var out = document.getElementById('aiOut');
    if (!SR) { out.textContent = 'Mikrofon nije dostupan u ovom pregledniku.'; return; }
    var rec = new SR(); rec.lang = 'hr-HR';
    rec.onresult = function (ev) {
      document.getElementById('aiText').value = ev.results[0][0].transcript;
      onAsk({ preventDefault: function () {} });
    };
    rec.start();
  }
  function onAsk(e) {
    e.preventDefault();
    var text = document.getElementById('aiText').value.trim();
    var out = document.getElementById('aiOut');
    if (!text) return;
    out.textContent = 'Čujem: ' + text;
    if (/izvad|preuz/i.test(text)) animateCount(-1);
    else if (/dodaj|stavi|zaprim/i.test(text)) animateCount(1);
  }
  function animateCount(dir) {
    if (!current || !world) return;
    var stack = current.stacks.find(function (st) { return dir > 0 ? st[2] < STACK : st[2] > 0; }) || current.stacks[0];
    var group = world.children.find(function (g) { return g.userData && g.position.x === stack[0] && g.position.z === stack[1]; });
    if (!group) return;
    var index = dir > 0 ? stack[2] : stack[2] - 1;
    var tire = group.children[index];
    if (!tire) return;
    stack[2] = Math.max(0, Math.min(STACK, stack[2] + dir));
    if (dir > 0) {
      tire.material = rubber();
      tire.material.emissive = new THREE.Color(group.userData.color || 0x4c6fff);
      tire.userData.occupied = true;
      tire.userData.anim = { t: 0, from: tire.position.y + 1.4, to: 0.18 + index * 0.17 };
      tire.position.y = tire.userData.anim.from;
    } else {
      tire.userData.anim = { t: 0, from: tire.position.y, to: tire.position.y + 1.6 };
      setTimeout(function () {
        tire.material = wire();
        tire.userData.occupied = false;
        tire.position.y = 0.18 + index * 0.17;
        tire.scale.setScalar(1);
        tire.userData.anim = null;
      }, 520);
    }
  }
})();
