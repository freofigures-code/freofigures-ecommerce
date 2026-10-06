import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export function ParametricModelViewer({ bytes, color, label }: { bytes: ArrayBuffer; color: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const material = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => { material.current?.color.set(color); }, [color]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const width = Math.max(element.clientWidth, 1);
    const height = Math.max(element.clientHeight, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#172734');
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const geometry = new STLLoader().parse(bytes);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) throw new Error('O modelo 3D não tem dimensões válidas.');
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    const max = Math.max(size.x, size.y, size.z, 1);
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.45, side: THREE.DoubleSide });
    material.current = mat;
    const mesh = new THREE.Mesh(geometry, mat);
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x506178, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(max, -max, max * 2);
    scene.add(key);
    camera.position.set(max * 1.2, -max * 1.5, max * 1.25);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = max * 0.6;
    controls.maxDistance = max * 8;
    controls.target.set(0, 0, 0);
    controls.update();
    let frame = 0;
    const draw = () => { frame = requestAnimationFrame(draw); controls.update(); renderer.render(scene, camera); };
    draw();
    const resize = new ResizeObserver(() => {
      const w = Math.max(element.clientWidth, 1), h = Math.max(element.clientHeight, 1);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    });
    resize.observe(element);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); controls.dispose();
      geometry.dispose(); mat.dispose(); material.current = null;
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [bytes]);

  return <div ref={host} role="img" aria-label={label} className="w-full h-full" />;
}
