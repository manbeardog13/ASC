/* ASC warehouse 3D module. Top-view scroll, enter one room, gentle camera, stacks of 8. */
(function () {
  var mount = document.getElementById('wh3d');
  if (!mount || !window.THREE) return;
  var THREE = window.THREE;
  var STACK = 8;
  var rooms = [
    { id:'hall', name:'Dvorana', w:7.2, d:14.5, door:null, stairs:{x:2.6,z:1.4},
      stacks:[
        [-2.2,-5.6,8],[-1.1,-5.6,8],[0,-5.6,6],[1.1,-5.6,8],[2.2,-5.6,4],
        [-2.2,-4.4,8],[-1.1,-4.4,8],[0,-4.4,8],[1.1,-4.4,5],[2.2,-4.4,8],
        [-2.2,-3.2,8],[-1.1,-3.2,3],[0,-3.2,8],[1.1,-3.2,8],[2.2,-3.2,2],
        [-2.2,-2.0,8],[-1.1,-2.0,8],[0,-2.0,7],[1.1,-2.0,8],
        [-2.2,-0.8,8],[-1.1,-0.8,8],[0,-0.8,8],[1.1,-0.8,6],
        [-0.8,3.4,4],[0.4,3.4,8],[1.6,3.4,2],
        [-0.8,4.8,8],[0.4,4.8,3],[1.6,4.8,8]
      ]},
    { id:'square', name:'Kvadrat', w:8, d:8, door:null, stairs:null,
      stacks:[
        [-2.6,-2.2,8],[-2.6,-0.4,5],[-2.6,1.4,8],[-2.6,2.6,2],
        [-1.2,-2.8,8],[0.4,-2.8,6],[2.0,-2.8,8],
        [2.6,-1.2,4],[2.6,0.6,8],[2.6,2.2,3],
        [-1.0,2.6,8],[0.6,2.6,8],[2.0,2.6,1]
      ]},
    { id:'triangle', name:'Trokut', w:9, d:10, door:null, stairs:null, shape:'tri',
      stacks:[
        [-2.8,3.2,8],[-2.2,2.0,8],[-1.6,0.8,6],[-1.0,-0.4,8],[-0.4,-1.6,4],
        [0.2,2.4,8],[0.6,1.0,5],[1.0,-0.4,8],
        [2.4,-2.2,8],[2.2,-0.8,8],[2.0,0.6,3],[1.8,2.0,8],[1.6,3.2,2],
        [-0.4,3.6,8],[-0.1,3.6,6]
      ]},
    { id:'ell', name:'Kut', w:10, d:12, door:{x:-3.4,z:-5.2}, stairs:null, shape:'ell',
      stacks:[
        [-2.6,-1.2,8],[-1.6,-1.2,8],[-0.6,-1.2,4],
        [-2.6,0,8],[-1.6,0,6],[-0.6,0,8],
        [-2.6,1.2,8],[-1.6,1.2,2],[-0.6,1.2,8],
        [-2.6,2.4,5],[-1.6,2.4,8],[-0.6,2.4,8],
        [1.0,-1.2,8],[2.0,-1.2,8],[3.0,-1.2,7],[4.0,-1.2,8],
        [1.0,0,8],[2.0,0,3],[3.0,0,8],[4.0,0,8],
        [1.0,1.2,6],[2.0,1.2,8],[3.0,1.2,8],[4.0,1.2,1],
        [1.0,2.4,8],[2.0,2.4,8],[3.0,2.4,4],[4.0,2.4,8]
      ]}
  ];

  function loadIndex(){ try { return JSON.parse(localStorage.getItem('asc.index')||'{}'); } catch(e){ return {}; } }
  function saveIndex(db){ localStorage.setItem('asc.index', JSON.stringify(db)); }

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
    drawTop(card.querySelector('canvas'), room);
  });

  function drawTop(canvas, room) {
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, r.width * 2 || 640);
    canvas.height = Math.max(220, 280 * 2);
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#eceae6';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    var s = Math.min(canvas.width / (room.w + 2), canvas.height / (room.d + 2));
    var ox = canvas.width / 2, oy = canvas.height / 2;
    ctx.strokeStyle = '#1c1e24'; ctx.lineWidth = 3;
    ctx.strokeRect(ox - room.w * s / 2, oy - room.d * s / 2, room.w * s, room.d * s);
    room.stacks.forEach(function (st) {
      var x = ox + st[0] * s, y = oy + st[1] * s;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.28);
      ctx.fillStyle = st[2] >= STACK ? '#1c1e24' : st[2] > 0 ? '#3d4450' : 'transparent';
      ctx.fill();
      ctx.strokeStyle = '#8b909a'; ctx.stroke();
    });
  }

  var renderer, scene, camera, world, current, yaw = 0, pitch = 0.52, dist = 16, dragging = false, last = null, pinch = null;
  function enter(room) {
    current = room;
    inspect.hidden = false;
    inspect.innerHTML = '<canvas id="whCanvas"></canvas><div class="wh-sheet"><b>' + room.name + '</b><p>Stog od 8. Puna guma je zauzeta. Žica je prazno mjesto.</p><div class="legend"><i class="full"></i>Zauzeto <i class="wire"></i>Prazno <i class="hold"></i>Rezervirano <i class="done"></i>Indeksirano</div><form id="aiForm"><input id="aiText" placeholder="Pitaj ili reci što treba…" /><button type="button" id="aiMic">Reci</button><button type="submit">Pošalji</button></form><div id="aiOut"></div></div>';
    var canvas = document.getElementById('whCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f4f1ec');
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    var sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(4, 10, 6); scene.add(sun);
    world = new THREE.Group(); scene.add(world);
    buildRoom(room);
    yaw = 0; pitch = 0.15; dist = Math.max(room.w, room.d) * 1.35;
    resize();
    animateCamera(0.15, 0.52);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    inspect.addEventListener('touchstart', onTouch, { passive: false });
    document.getElementById('aiMic').onclick = listen;
    document.getElementById('aiForm').onsubmit = onAsk;
    requestAnimationFrame(loop);
  }

  function buildRoom(room) {
    while (world.children.length) world.remove(world.children[0]);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), new THREE.MeshStandardMaterial({ color: 0xd7d2cb }));
    floor.rotation.x = -Math.PI / 2; world.add(floor);
    wall(room.w, 0, 0, room.d);
    room.stacks.forEach(function (st, i) {
      var g = new THREE.Group(); g.position.set(st[0], 0, st[1]); g.userData = { i: i, filled: st[2], id: room.id + '-' + i };
      for (var n = 0; n < STACK; n++) {
        var geo = new THREE.TorusGeometry(0.28, 0.09, 8, 16);
        var mat = n < st[2]
          ? new THREE.MeshStandardMaterial({ color: 0x24272d })
          : new THREE.MeshBasicMaterial({ color: 0x9aa1ab, wireframe: true });
        var tire = new THREE.Mesh(geo, mat);
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.16 + n * 0.16;
        g.add(tire);
      }
      world.add(g);
    });
  }

  function wall(w, x, z, d) {
    var mat = new THREE.MeshBasicMaterial({ color: 0x1c1e24, wireframe: true });
    [[w, 0.9, 0.08, 0, 0, -d / 2], [w, 0.9, 0.08, 0, 0, d / 2], [0.08, 0.9, d, -w / 2, 0, 0], [0.08, 0.9, d, w / 2, 0, 0]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), mat);
      m.position.set(p[3], 0.45, p[5]); world.add(m);
    });
  }

  function resize() {
    var r = inspect.getBoundingClientRect();
    renderer.setSize(r.width, Math.max(320, r.height * 0.62));
    camera.aspect = r.width / Math.max(320, r.height * 0.62);
    camera.updateProjectionMatrix();
  }
  function placeCamera() {
    var h = dist * Math.sin(pitch), flat = dist * Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * flat, Math.max(1.2, h), Math.cos(yaw) * flat);
    camera.lookAt(0, 0.4, 0);
  }
  function animateCamera(fromPitch, toPitch) {
    var t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / 1400);
      var e = 1 - Math.pow(1 - t, 3);
      pitch = fromPitch + (toPitch - fromPitch) * e;
      yaw = Math.sin(t * Math.PI) * 0.22;
      placeCamera(); renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function loop() {
    if (inspect.hidden) return;
    yaw += Math.sin(performance.now() / 1800) * 0.0008;
    placeCamera(); renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  function onDown(e) { dragging = true; last = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; }
  function onMove(e) {
    if (!dragging || !last) return;
    yaw = last.yaw - (e.clientX - last.x) * 0.005;
    pitch = Math.max(0.08, Math.min(1.15, last.pitch + (e.clientY - last.y) * 0.004));
  }
  function onUp() { dragging = false; }
  function onWheel(e) { e.preventDefault(); dist = Math.max(4, Math.min(28, dist + e.deltaY * 0.01)); if (dist > 24) pitch = 0.12; }
  function onTouch(e) {
    if (e.touches.length === 1 && e.touches[0].clientX < 28) { inspect.dataset.sx = e.touches[0].clientX; }
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch = Math.hypot(dx, dy);
    }
  }
  inspect.addEventListener('touchend', function (e) {
    if (inspect.dataset.sx && e.changedTouches[0].clientX - inspect.dataset.sx > 70) exit();
  });
  inspect.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
      var next = Math.hypot(dx, dy);
      dist = Math.max(4, Math.min(28, dist - (next - pinch) * 0.03));
      if (dist > 24) pitch = 0.1;
      pinch = next;
    }
  }, { passive: true });
  function exit() { inspect.hidden = true; current = null; }
  function listen() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var out = document.getElementById('aiOut');
    if (!SR) { out.textContent = 'Mikrofon nije dostupan u ovom pregledniku.'; return; }
    var rec = new SR(); rec.lang = 'hr-HR';
    rec.onresult = function (ev) { document.getElementById('aiText').value = ev.results[0][0].transcript; onAsk({ preventDefault: function(){} }); };
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
    if (!current) return;
    var st = current.stacks[0];
    st[2] = Math.max(0, Math.min(STACK, st[2] + dir));
    buildRoom(current);
  }
})();
