/* ASC warehouse 3D. Open, light, no roof. Camera follows the finger. */
(function () {
  var mount = document.getElementById('wh3d');
  if (!mount || !window.THREE) return;
  var THREE = window.THREE;
  var STACK = 8;
  var people = ['Ivana Kovač', 'Marko Burić', 'Hotel Excelsior', 'Petra Jurjević', 'Ante Vuković'];
  var colors = [0x4c6fff, 0x1f9d55, 0xc45c26, 0x7c5cff, 0x0e7490];
  var rooms = [
    { id:'aisle', name:'Hodnik', w:4.6, d:14, stacks:[
      [-1.2,-5.4,8],[-1.2,-4.2,8],[-1.2,-3.0,7],[-1.2,-1.8,8],[-1.2,-0.6,6],[-1.2,0.6,8],[-1.2,1.8,8],[-1.2,3.0,5],
      [1.2,-5.4,8],[1.2,-4.2,8],[1.2,-3.0,8],[1.2,-1.8,4],[1.2,-0.6,8],[1.2,0.6,8],[1.2,1.8,7],[1.2,3.0,3]
    ]},
    { id:'floor', name:'Prizemlje', w:7.2, d:8.4, stacks:[
      [-2.2,-2.4,8],[-1.0,-2.4,8],[0.2,-2.4,5],[1.4,-2.4,8],[2.4,-2.4,8],
      [-2.2,-0.8,8],[-1.0,-0.8,3],[1.4,-0.8,8],[2.4,-0.8,6],
      [-2.2,1.2,8],[-1.0,1.2,8],[0.2,1.2,8],[1.4,1.2,2],[2.4,1.2,8]
    ]},
    { id:'shelf', name:'Polica', w:5, d:4, stacks:[
      [-1.2,-0.6,6],[-0.1,-0.6,6],[1.0,-0.6,5],[1.6,-0.6,6],
      [-1.2,0.7,4],[-0.1,0.7,6],[1.0,0.7,3]
    ]},
    { id:'attic', name:'Tavan', w:5.4, d:5.6, stacks:[
      [-1.3,-1.0,7],[-0.2,-1.0,7],[0.9,-1.0,5],
      [-1.3,0.6,6],[-0.1,0.6,4],[1.5,1.3,1]
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
    var w = canvas.clientWidth || 360, h = 200;
    canvas.width = w * 2; canvas.height = h * 2;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f5f2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var s = Math.min(canvas.width / (room.w + 2), canvas.height / (room.d + 2));
    var ox = canvas.width / 2, oy = canvas.height / 2;
    ctx.strokeStyle = '#d8d4ce'; ctx.lineWidth = 3;
    ctx.strokeRect(ox - room.w * s / 2, oy - room.d * s / 2, room.w * s, room.d * s);
    room.stacks.forEach(function (st) {
      ctx.beginPath();
      ctx.arc(ox + st[0] * s, oy + st[1] * s, 7, 0, 6.28);
      ctx.fillStyle = st[2] ? '#2c3038' : 'transparent';
      ctx.fill();
      ctx.strokeStyle = '#c5c1ba'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }

  var renderer, scene, camera, world, current;
  var yaw = 0.2, pitch = 0.55, dist = 14;
  var targetYaw = 0.2, targetPitch = 0.55, targetDist = 14;
  var dragging = false, last = null, pinch = null, running = false, lastT = 0;

  function rubber() {
    return new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.55, metalness: 0.04 });
  }
  function wire() {
    return new THREE.MeshBasicMaterial({ color: 0xd0d4da, wireframe: true, transparent: true, opacity: 0.7 });
  }
  function label(text, color) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 96;
    var g = c.getContext('2d');
    g.fillStyle = '#' + color.toString(16).padStart(6, '0');
    g.beginPath(); g.roundRect(8, 28, 16, 16, 4); g.fill();
    g.fillStyle = '#1c1e24';
    g.font = '600 36px Inter, sans-serif';
    g.fillText(text, 34, 58);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    sprite.position.y = 1.7; sprite.scale.set(1.6, 0.3, 1); sprite.userData.label = true;
    return sprite;
  }

  function enter(room) {
    current = room;
    inspect.hidden = false;
    inspect.innerHTML = '<canvas id="whCanvas"></canvas><div class="wh-sheet"><div class="grab"></div><b>' + room.name + '</b><p>Stog od 8. Puna guma je zauzeta. Žica je prazno. Približi se za ime.</p><div class="legend"><i class="full"></i>Zauzeto <i class="wire"></i>Prazno <i class="hold"></i>Isti vlasnik</div><form id="aiForm"><input id="aiText" placeholder="Pitaj ili reci…" /><button type="button" id="aiMic">Reci</button><button type="submit">Pošalji</button></form><div id="aiOut"></div></div>';
    var canvas = document.getElementById('whCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f2ee');
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    scene.add(new THREE.AmbientLight(0xffffff, 0.92));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e4de, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(4, 10, 6); scene.add(sun);
    world = new THREE.Group(); scene.add(world);
    buildRoom(room);
    targetPitch = 0.42; pitch = 0.42;
    targetDist = Math.max(room.w, room.d) * 1.15; dist = targetDist;
    targetYaw = 0.15; yaw = 0.15;
    lastT = performance.now();
    resize();
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.getElementById('aiMic').onclick = listen;
    document.getElementById('aiForm').onsubmit = onAsk;
    if (!running) { running = true; requestAnimationFrame(loop); }
  }

  function buildRoom(room) {
    while (world.children.length) world.remove(world.children[0]);
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w + 0.4, room.d + 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf0ece6, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2; world.add(floor);
    var border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(room.w, room.d)),
      new THREE.LineBasicMaterial({ color: 0xd4d0c8 })
    );
    border.rotation.x = -Math.PI / 2; border.position.y = 0.01; world.add(border);
    room.stacks.forEach(function (st, i) {
      var who = st[2] ? people[i % people.length] : '';
      var color = colors[i % people.length];
      var g = new THREE.Group();
      g.position.set(st[0], 0, st[1]);
      g.userData = { filled: st[2], who: who, color: color };
      for (var n = 0; n < STACK; n++) {
        var occupied = n < st[2];
        var tire = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 16, 36), occupied ? rubber() : wire());
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.2 + n * 0.18;
        tire.userData.occupied = occupied;
        if (occupied) tire.material.emissive = new THREE.Color(color);
        g.add(tire);
      }
      if (who) g.add(label(who, color));
      world.add(g);
    });
  }

  function resize() {
    var r = inspect.getBoundingClientRect();
    var h = Math.max(300, r.height * 0.62);
    renderer.setSize(r.width, h);
    camera.aspect = r.width / h;
    camera.updateProjectionMatrix();
  }
  function damp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
  }
  function placeCamera(dt) {
    yaw = damp(yaw, targetYaw, 8, dt);
    pitch = damp(pitch, targetPitch, 8, dt);
    dist = damp(dist, targetDist, 7, dt);
    var h = dist * Math.sin(pitch), flat = dist * Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * flat, Math.max(1.6, h), Math.cos(yaw) * flat);
    camera.lookAt(0, 0.4, 0);
  }
  function loop(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!inspect.hidden && world) {
      var close = dist < 9.5;
      world.children.forEach(function (g) {
        if (!g.userData || !g.userData.who) return;
        g.children.forEach(function (child) {
          if (child.userData && child.userData.label) {
            var op = child.material.opacity;
            child.material.opacity = damp(op, close ? 1 : 0, 10, dt);
            child.visible = child.material.opacity > 0.03;
          }
          if (child.material && child.material.emissive && child.userData.occupied) {
            child.material.emissiveIntensity = damp(child.material.emissiveIntensity || 0, close ? 0.35 : 0, 8, dt);
          }
          if (child.userData && child.userData.anim) {
            child.userData.anim.t = Math.min(1, child.userData.anim.t + dt * 2.2);
            var e = 1 - Math.pow(1 - child.userData.anim.t, 3);
            child.position.y = child.userData.anim.from + (child.userData.anim.to - child.userData.anim.from) * e;
            child.scale.setScalar(0.9 + 0.1 * e);
            if (child.userData.anim.t >= 1) child.userData.anim = null;
          }
        });
      });
      placeCamera(dt);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  }
  function onDown(e) { dragging = true; last = { x: e.clientX, y: e.clientY, yaw: targetYaw, pitch: targetPitch }; }
  function onMove(e) {
    if (!dragging || !last) return;
    targetYaw = last.yaw - (e.clientX - last.x) * 0.004;
    targetPitch = Math.max(0.18, Math.min(0.95, last.pitch + (e.clientY - last.y) * 0.0025));
  }
  function onUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    targetDist = Math.max(5, Math.min(22, targetDist + e.deltaY * 0.006));
  }
  inspect.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1 && e.touches[0].clientX < 40) inspect.dataset.sx = e.touches[0].clientX;
    if (e.touches.length === 2) {
      pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  inspect.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var next = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      targetDist = Math.max(5, Math.min(22, targetDist - (next - pinch) * 0.015));
      pinch = next;
    }
  }, { passive: true });
  inspect.addEventListener('touchend', function (e) {
    if (inspect.dataset.sx && e.changedTouches[0].clientX - Number(inspect.dataset.sx) > 70) exit();
    inspect.dataset.sx = '';
  });
  function exit() { inspect.hidden = true; current = null; }
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
    var group = world.children.find(function (g) { return g.userData && Math.abs(g.position.x - stack[0]) < 0.01 && Math.abs(g.position.z - stack[1]) < 0.01; });
    if (!group) return;
    var index = dir > 0 ? stack[2] : stack[2] - 1;
    var tire = group.children[index];
    if (!tire) return;
    stack[2] = Math.max(0, Math.min(STACK, stack[2] + dir));
    if (dir > 0) {
      tire.material = rubber();
      tire.material.emissive = new THREE.Color(group.userData.color || 0x4c6fff);
      tire.userData.occupied = true;
      tire.userData.anim = { t: 0, from: tire.position.y + 0.9, to: 0.2 + index * 0.18 };
      tire.position.y = tire.userData.anim.from;
    } else {
      tire.userData.anim = { t: 0, from: tire.position.y, to: tire.position.y + 1.1 };
      setTimeout(function () {
        tire.material = wire();
        tire.userData.occupied = false;
        tire.position.y = 0.2 + index * 0.18;
        tire.scale.setScalar(1);
        tire.userData.anim = null;
      }, 480);
    }
  }
})();
