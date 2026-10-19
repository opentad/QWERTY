// world.js — земля, сетка, туман, мягкий свет и метка «куда идти».
// Здесь же потом появятся каталог декораций, локации, день и ночь.
import * as THREE from 'three';

export const WORLD_RADIUS = 35; // дальше этого круга идти нельзя

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  scene.fog = new THREE.Fog(0x16131f, 28, 75);

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  group.add(ambient);

  // асфальтовая земля
  const groundGeo = new THREE.CircleGeometry(60, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: 0x2b2540 }));
  group.add(ground);

  // сетка: одна клетка = один метр
  const grid = new THREE.GridHelper(120, 120, 0xff2e88, 0x4a3f6b);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  group.add(grid);

  // метка точки назначения
  const marker = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.22, 0.3, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.06, 24);
  dotGeo.rotateX(-Math.PI / 2);
  const markMat = new THREE.MeshBasicMaterial({ color: 0xff2e88, side: THREE.DoubleSide });
  marker.add(new THREE.Mesh(ringGeo, markMat), new THREE.Mesh(dotGeo, markMat));
  marker.position.y = 0.01;
  marker.visible = false;
  group.add(marker);

  return {
    group,
    ground,
    setTarget(x, z) {
      marker.position.set(x, 0.01, z);
      marker.visible = true;
    },
    hideTarget() {
      marker.visible = false;
    }
  };
}
